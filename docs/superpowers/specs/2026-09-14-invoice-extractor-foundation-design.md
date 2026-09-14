# Invoice Extractor — Foundation (Plan 1)

**Date:** 2026-09-14
**Branch:** `feat/invoice-extractor`
**Status:** Approved for implementation

## Context

Discus is a multimodal communication-analysis pipeline: upload → MinIO →
webhook → BullMQ → worker → OCR/transcription → LLM feedback. The invoice
extractor reuses that ingestion spine and adds what discus lacks:
persistence, structured extraction, auth, and a queryable data model.

Roughly 70% of the infrastructure transfers unchanged. The reusable parts
are `packages/minio`, `packages/queues`, `packages/common`, the
webhook→queue routing in `apps/api/src/storage/controllers/webhook.controller.ts`,
and `processImageUrl()` in `packages/agents/index.ts` — which already
handles PDFs natively via `type: "document_url"`.

What is missing: a database (`packages/drizzle` is an empty `bun init`
scaffold), result persistence (workers `console.log` and discard),
structured output, correct idempotency, and any authentication.

## Scope

Plan 1 of six. Delivers the database foundation, authentication, and
protected CRUD — everything testable via HTTP with no LLM involved.

**In scope:** Drizzle setup and migrations, nine tables, JWT + refresh
auth, API keys, protected CRUD routes, money helpers, cross-user
isolation tests.

**Out of scope (later plans):** format builder (2), extraction pipeline
(3), dashboard (4, 5), public API endpoint (6).

## Decisions

| Topic | Decision | Rationale |
|---|---|---|
| Tenancy | Single-user | Rows scoped by `user_id`. Orgs can be added later via `org_id` + backfill. |
| Auth | 15-min access JWT + refresh token table | Stateless hot path; refresh table makes revocation real. `api_keys` needs a table regardless. |
| Password hashing | Argon2id via `Bun.password` | Built into Bun; no dependency. |
| Money | `BIGINT` minor units + currency code | Avoids float error; matches Stripe; `BigInt` maps cleanly to JS. Tradeoff: conversion on every read/write, centralised in `money.ts`. |
| Vendors | Separate table | Many-to-one: dedup, vendor pages, spend analytics. |
| Line items | Separate table | One-to-many and the most-queried entity. |
| Buyer | Preferences, not a table | Almost always the account holder; a 1-row table buys nothing. |
| Totals | Columns on `invoices` | One-to-one; a table would force a join for the most-read numbers. |
| Payment | Split | Status/terms → invoice columns; bank details → vendor. |

## Data model

Nine tables, all user-scoped.

```
users
 ├── refresh_tokens
 ├── api_keys
 ├── preferences          (kv + JSONB metadata; holds buyer identity)
 ├── invoice_formats      (JSON Schema + field→column mapping)
 ├── vendors
 ├── documents            (MinIO ref, ocr_text, summary, FTS index)
 └── invoices             (core columns + data JSONB)
      └── line_items
```

### users
`id` uuid pk · `email` citext unique · `password_hash` text ·
`created_at` · `updated_at`

### refresh_tokens
`id` uuid pk · `user_id` fk cascade · `token_hash` text unique ·
`expires_at` · `revoked_at` nullable · `created_at`

Rotating: each refresh issues a new token and revokes the old one.

### api_keys
`id` uuid pk · `user_id` fk cascade · `name` text · `key_hash` text
unique · `prefix` text (first 8 chars, for display) · `last_used_at`
nullable · `revoked_at` nullable · `created_at`

Plaintext key is shown once at creation and never stored.

### vendors
`id` uuid pk · `user_id` fk cascade · `name` text · `tax_id` text
nullable · `email` · `address` text · `bank_details` jsonb ·
timestamps

Unique on `(user_id, name, tax_id)` for upsert-on-extraction.

### documents
`id` uuid pk · `user_id` fk cascade · `bucket_name` · `object_path` ·
`mime_type` · `size_bytes` bigint · `status` enum(pending, processing,
completed, failed) · `ocr_text` text · `summary` text ·
`error_message` · timestamps

GIN index on `to_tsvector('english', coalesce(summary,'') || ' ' ||
coalesce(ocr_text,''))` for full-text search. Unique on
`(bucket_name, object_path)` — this is the real idempotency fix
replacing the broken in-process hashMap.

### invoices
`id` uuid pk · `user_id` fk cascade · `document_id` fk nullable ·
`vendor_id` fk nullable · `invoice_number` · `po_number` ·
`issue_date` · `due_date` · `currency` char(3) · `subtotal_minor`
bigint · `tax_total_minor` bigint · `discount_minor` bigint ·
`total_minor` bigint · `status` enum(draft, pending, approved, paid,
void) · `payment_terms` · `confidence` real · `needs_review` boolean ·
`data` jsonb · `source` enum(dashboard, api, extraction) · timestamps

GIN index on `data`. Indexes on `(user_id, issue_date)`,
`(user_id, status)`, `(user_id, vendor_id)`.

### line_items
`id` uuid pk · `invoice_id` fk cascade · `position` integer ·
`description` text · `quantity` numeric(12,3) · `unit_price_minor`
bigint · `line_total_minor` bigint · `tax_rate` numeric(5,2)

`position` preserves document order (SQL rows are unordered).
`line_total_minor` is stored as printed, not computed — a mismatch
against `quantity × unit_price` is a `needs_review` signal.

### preferences
`id` uuid pk · `user_id` fk cascade · `key` text · `value` text ·
`metadata` jsonb · timestamps. Unique on `(user_id, key)`.

### invoice_formats
`id` uuid pk · `user_id` fk cascade · `name` · `schema` jsonb
(JSON Schema for LLM structured output) · `field_mapping` jsonb
(user field → core column) · `is_default` boolean · timestamps

## Money handling

`packages/common/src/money.ts`:

- `getDivisor(currency)` — `10 ** maximumFractionDigits` from
  `Intl.NumberFormat`, which carries ISO 4217 data via ICU.
- `toMinorUnits(amount, currency)` → `bigint`
- `fromMinorUnits(minor, currency)` → `number`
- `formatMoney(minor, currency)` → localised string

JPY is 0-decimal, KWD 3-decimal; the divisor is never assumed to be 100.
All money conversion goes through these helpers — no ad-hoc arithmetic.

## Authentication

Two middlewares sharing one contract: both set `userId` on the Hono
context, so route handlers are agnostic to how the caller authenticated.

- `requireAuth` — verifies the access JWT from an httpOnly cookie.
  Stateless, no DB hit.
- `requireApiKey` — SHA-256 of the `Authorization: Bearer` value, looked
  up against `api_keys`, rejecting revoked keys; updates `last_used_at`.

Access tokens live 15 minutes. Refresh tokens live 30 days, are stored
hashed, and rotate on use.

## Routes

All user-scoped. Following the existing controller/validator layout in
`apps/api/src/storage/`.

| Path | Methods |
|---|---|
| `/auth` | `POST /signup`, `POST /login`, `POST /refresh`, `POST /logout`, `GET /me` |
| `/documents` | list, get, create, delete |
| `/invoices` | list (filter/paginate), get, create, update, delete |
| `/invoices/:id/line-items` | list, replace |
| `/vendors` | full CRUD |
| `/preferences` | list, upsert by key, delete |
| `/formats` | full CRUD + set-default |
| `/api-keys` | list, create (returns plaintext once), revoke |

## Testing

`bun test`, colocated under `apps/api/src/**/__tests__/`.

- Password hash round-trip and rejection
- JWT sign/verify, expiry, tampering
- Refresh rotation, revocation, reuse-after-revoke
- API key hashing, prefix display, revoked-key rejection
- Money: USD/JPY/KWD divisors, round-trip, formatting
- **Cross-user isolation on every resource** — user A must receive 404,
  not 403, for user B's rows (no existence leak)

## Risks

- **Money representation is expensive to change later.** Accepted
  deliberately; `NUMERIC(14,2)` was the alternative.
- **Format-builder mapping (Plan 2) is the most likely to grow** beyond
  estimate — arbitrary user schemas mapping onto fixed columns.
- **Local llama structured-output reliability (Plan 3)** is unproven.
  LangChain's `withStructuredOutput()` keeps the provider swap cheap.
