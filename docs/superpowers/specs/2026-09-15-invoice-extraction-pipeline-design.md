# Invoice Extraction Pipeline (Plans 2+3, merged)

**Date:** 2026-09-15
**Branch:** `feat/invoice-extraction-pipeline`
**Depends on:** Plan 1 foundation (`feat/invoice-foundation`)
**Status:** Approved for implementation

## Context

Plan 1 built the data model, auth, and CRUD. The `invoice_formats` table
stores a JSON Schema and a field mapping, but nothing consumes either:
`fieldMapping` is written and read back, never applied.

Plans 2 and 3 were originally separate — the mapping engine, then the
extraction pipeline. They are merged here because the mapping engine has
no observable behaviour until something produces extracted JSON to map.
Building a transformer with no input, then an input with no consumer,
would leave both untestable until the second landed.

## Scope

Upload → text → structured extraction → mapped rows in the database.

**In scope:** user attribution on upload, `DOCUMENT_QUEUE` and its worker,
two-path text extraction, Gemini structured output via LangChain, the
mapping engine, transactional persistence, failure handling with retry.

**Out of scope:** the visual format builder (Plan 5), dashboard UI
(Plan 4), LangGraph.

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Attribution | `userId` in the object path | MinIO's webhook carries no user context. The presigned-URL endpoint enforces the prefix, so the path is trustworthy. |
| Text extraction | anydoc first, Mistral OCR fallback | Verified: 12ms, local, preserves tables as markdown. No public URL needed for digital PDFs. |
| LLM | Gemini via `@langchain/google-genai` | `withStructuredOutput()` constrains output to the format's JSON Schema. Removes the "is Ollama running" failure mode; far better schema adherence than a small local model. |
| Orchestration | Plain LangChain, no LangGraph | The pipeline is a straight line with no cycles. LangGraph earns its place when a validate-and-reprompt loop exists — not before. |
| Job shape | One job, sequential stages | Simplest to debug; BullMQ's existing 3-attempt backoff covers the whole thing. Re-running a 12ms parse on retry costs nothing. |
| Validation | Coerce what is safe, flag the rest | A single malformed field should not discard an otherwise good extraction. |
| Failure | Always persist, flag `needs_review` | Nothing is silently lost. The user sees the row and corrects it. |
| Retry | Flag + endpoint, no buffer table | `documents.status` and `error_message` already exist. A toast plus a retry button needs no new schema. |

## Verified during design

`@firecrawl/anydoc@0.2.4` spiked on this machine:

- Installs clean, prebuilt `darwin-arm64` binary, no build step
- 12ms to extract a realistic invoice PDF, fully local
- Preserves the line-items table as a markdown table, which is
  materially easier for an LLM to extract from than reflowed prose
- Throws `code: "needsOcr"` on a scanned PDF
- Throws `code: "unsupported"` on an image — it is a document converter,
  not an OCR engine, so images bypass it entirely

## Architecture

```
upload → MinIO (invoices/<userId>/<uuid>.pdf)
  → webhook (parse userId, insert document row, enqueue)
    → DOCUMENT_QUEUE
      → worker:
          1. text     anydoc → markdown, else Mistral OCR
          2. extract  Gemini + format.schema → JSON
          3. map      applyMapping(json, format.fieldMapping)
          4. persist  one transaction: vendor → invoice → line_items
```

### 1. Ingestion and attribution

Object path becomes `invoices/<userId>/<uuid>.<ext>`. The presigned-URL
endpoint derives the prefix from the authenticated session rather than
accepting it from the client, so a user cannot write into another's
folder.

The webhook parses `userId` from the path and confirms the user exists
before enqueuing. An unparseable or unknown path is logged and dropped —
never enqueued.

The `documents` row is created here with `status: 'pending'`. The existing
unique index on `(bucket_name, object_path)` makes duplicate webhook
delivery a database conflict rather than a second job.

### 2. Queue and worker

`QueueNames.DOCUMENT_QUEUE` joins the existing enum.
`webhook.controller.ts` gains a branch for `application/pdf`, Office
types, and images under the invoices bucket. The image and video queues
are untouched; discus's coaching pipeline keeps working.

`apps/workers/media-worker/src/workers/document.worker.ts` follows the
existing worker shape, minus the broken in-process `hashMap` dedup — the
database constraint replaces it.

### 3. Text extraction

```
anydoc.toMarkdown(path)
  ├─ ok                 → markdown
  ├─ code needsOcr      → Mistral OCR (scanned PDF)
  └─ code unsupported   → Mistral OCR (image)
```

anydoc's own `ocr: 'hosted'` option is not used — it routes to Firecrawl's
paid service, and Mistral OCR is already wired and working. Result is
stored in `documents.ocr_text`.

### 4. Structured extraction

`packages/agents` gains `extractInvoice(markdown, jsonSchema)` built on
`@langchain/google-genai` with `withStructuredOutput(schema)`, where the
schema comes from the user's default `invoice_formats.schema`.

**When the user has no default format**, the worker falls back to the
built-in EN 16931 template rather than failing the document. Seeding is
currently manual (`POST /formats/seed-default`, called by nothing), so an
account that uploads before visiting settings would otherwise have no
schema at all. This plan also wires seeding into signup, making "every
user has at least one format" true in the database rather than a
precondition every consumer must defend against.

A 120s per-call timeout bounds the job. BullMQ's configured 3 attempts
with exponential backoff handle transient failures.

### 5. Mapping engine

`packages/common/src/mapping/` — pure functions, no I/O, so they are
testable in isolation and the web app can reuse them for preview.

```ts
applyMapping(extracted, fieldMapping) → {
  vendor:    { name, taxId, email, address },
  invoice:   { invoiceNumber, issueDate, currency, totalMinor, ... },
  lineItems: [...],
  data:      { costCentre: "ENG-42" },   // unmapped fields
  issues:    ["currency 'GBP?' unrecognised"],
}
```

Zod-validates against the format schema. Safe coercions (numeric strings,
parseable dates) go through; ambiguous values are left null and recorded
as an issue. Money goes through the existing `parseAmount`, which returns
null rather than guessing.

**Currency is resolved before any amount is parsed** — the divisor depends
on it, and getting this backwards is an order-of-magnitude error, not a
rounding one.

### 6. Persistence

One transaction:

```
upsert vendor        (on the existing unique index)
  → insert invoice   (source: 'extraction', needs_review = issues.length > 0)
    → insert line_items   (position preserved)
      → update document   (status completed, summary, processed_at)
```

All-or-nothing. A half-written invoice with missing lines would be a
silently wrong financial record.

`documents.summary` is populated by a short summarisation call — a second
prompt, not the existing `analyzeText`, whose prompt is a writing coach
that returns critique rather than a searchable summary.

### 7. Failure handling

On exhausted retries: `documents.status = 'failed'` and `error_message`
set to a human-readable reason (not a raw stack trace).

`POST /documents/:id/retry` re-enqueues an existing document. Session
auth, ownership checked, 404 for another user's document like every other
route. The dashboard surfaces `error_message` as a toast with a Retry
action.

No buffer table: `status` and `error_message` already exist on
`documents`, and a flag plus an endpoint covers the requirement.

## Testing

**Unit (no network, no database):**
- `applyMapping` with the EN 16931 default format
- `applyMapping` with a differently-shaped format (German field names)
  producing the same core columns — the property that makes cross-user
  queries possible
- Unmapped fields fall through to `data`
- Currency resolved before amounts; a wrong-order regression fails
- Ambiguous values produce `issues` and leave the field null

**Integration (database, stubbed LLM):**
- A real PDF through anydoc → stubbed extraction → assert rows in
  `vendors`, `invoices`, `line_items`
- Duplicate webhook delivery creates one document and one invoice
- A failing extraction sets `status: 'failed'` with a message and creates
  no partial invoice

The LLM is stubbed so tests stay deterministic and free. One opt-in test
hits Gemini for real, skipped unless `GOOGLE_API_KEY` is set.

## Risks

- **`MINIO_PUBLIC_URL` is a stale ngrok address.** The Mistral fallback
  cannot work until it points somewhere reachable. Digital PDFs are
  unaffected, since anydoc reads from local disk.
- **`GOOGLE_API_KEY` is a new secret** and needs the same env-schema
  treatment as the others, including a startup failure when absent.
- **Gemini cost is per-document.** Small per invoice, but unbounded if a
  user uploads in bulk. Not addressed here; worth a rate limit before the
  public API endpoint ships in Plan 6.
- **anydoc is v0.2.4** — early. The fallback path means a regression
  degrades to Mistral OCR rather than breaking extraction outright.
