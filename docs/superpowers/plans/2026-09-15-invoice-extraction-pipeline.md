# Invoice Extraction Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an uploaded invoice document into typed rows in `vendors`, `invoices`, and `line_items`, using the uploading user's own format definition.

**Architecture:** A MinIO webhook parses the owning user from the object path, creates a `documents` row, and enqueues one BullMQ job. A single worker runs four sequential stages — local text extraction via anydoc (Mistral OCR fallback), Gemini structured output constrained by the user's JSON Schema, a pure mapping function that routes fields to columns or JSONB, then one database transaction writing all three tables.

**Tech Stack:** Bun, Hono, Drizzle, BullMQ, `@firecrawl/anydoc`, `@langchain/google-genai`, Zod v4, Postgres 16.

**Spec:** `docs/superpowers/specs/2026-09-15-invoice-extraction-pipeline-design.md`

## Global Constraints

- **Runtime is Bun, not Node.** `bun test`, `bun add`, `bun run`. Never `npm`/`jest`/`vitest`.
- **Money is `bigint` minor units** in the database, decimals across the API. Always convert with `toMinorUnits` / `fromMinorUnits` from `common`. Never `JSON.stringify` a `bigint` — it throws.
- **Currency must be resolved before any amount is parsed.** The divisor depends on it; getting this backwards is an order-of-magnitude error.
- **Every row is user-scoped.** Another user's row returns 404, never 403.
- **Repositories accept `ex: Executor = db`** so they compose inside `db.transaction()`. Follow that signature for new repository methods.
- **`packages/common` must not import `drizzle`.** The web app imports `common` and has no database client.
- **Tests run against a live database:** `bun run db:up` then `bun run test`.
- **Commit after every task.** End commit messages with the attribution lines used by existing commits on this branch.

---

### Task 1: Add the `DOCUMENT_QUEUE` and its job type

**Files:**
- Modify: `packages/queues/src/types.ts`
- Test: `packages/queues/src/types.test.ts` (create)

**Interfaces:**
- Consumes: nothing
- Produces: `QueueNames.DOCUMENT_QUEUE = 'document_queue'`; `type DocumentJobData = { documentId: string; userId: string; bucketName: string; objectPath: string; mimeType: string }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/queues/src/types.test.ts
import { test, expect, describe } from "bun:test";
import { QueueNames, type DocumentJobData } from "./types";

describe("DOCUMENT_QUEUE", () => {
  test("is registered with a stable name", () => {
    expect(QueueNames.DOCUMENT_QUEUE).toBe("document_queue");
  });

  test("does not collide with the existing queues", () => {
    const names = Object.values(QueueNames);
    expect(new Set(names).size).toBe(names.length);
  });

  test("job data carries the document id and its owner", () => {
    // The worker must never re-derive the owner from the path: the webhook
    // already validated it, and re-parsing would be a second chance to get
    // attribution wrong.
    const job: DocumentJobData = {
      documentId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      bucketName: "invoices",
      objectPath: "invoices/22222222-2222-2222-2222-222222222222/abc.pdf",
      mimeType: "application/pdf",
    };
    expect(job.documentId).toBeDefined();
    expect(job.userId).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/queues/src/types.test.ts`
Expected: FAIL — `QueueNames.DOCUMENT_QUEUE` is undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/queues/src/types.ts — add to the existing enum and file
export enum QueueNames {
    VIDEO_QUEUE = 'video_queue',
    IMAGE_QUEUE = 'image_queue',
    DOCUMENT_QUEUE = 'document_queue',
}

export type OCRJobData = {
    bucketName: string;
    fileType: string;
    objectPath: string[];
}

/**
 * Invoice extraction job. The webhook has already resolved and validated the
 * owning user and created the documents row, so the worker takes both as
 * given rather than re-parsing the path.
 */
export type DocumentJobData = {
    documentId: string;
    userId: string;
    bucketName: string;
    objectPath: string;
    mimeType: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/queues/src/types.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/queues/src/types.ts packages/queues/src/types.test.ts
git commit -m "feat(queues): add DOCUMENT_QUEUE and its job type"
```

---

### Task 2: Object-path helpers for user attribution

**Files:**
- Create: `packages/common/src/storage/object-path.ts`
- Create: `packages/common/src/storage/index.ts`
- Create: `packages/common/src/storage/object-path.test.ts`
- Modify: `packages/common/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `buildInvoiceObjectPath(userId: string, filename: string): string`
  - `parseInvoiceObjectPath(objectPath: string): { userId: string; filename: string } | null`
  - `INVOICE_PREFIX = "invoices"`

- [ ] **Step 1: Write the failing test**

```ts
// packages/common/src/storage/object-path.test.ts
import { test, expect, describe } from "bun:test";
import {
  buildInvoiceObjectPath,
  parseInvoiceObjectPath,
  INVOICE_PREFIX,
} from "./object-path";

const USER = "22222222-2222-2222-2222-222222222222";

describe("buildInvoiceObjectPath", () => {
  test("puts the user id in the path", () => {
    const p = buildInvoiceObjectPath(USER, "invoice.pdf");
    expect(p).toStartWith(`${INVOICE_PREFIX}/${USER}/`);
    expect(p).toEndWith(".pdf");
  });

  test("generates a unique name per call so uploads never collide", () => {
    const a = buildInvoiceObjectPath(USER, "invoice.pdf");
    const b = buildInvoiceObjectPath(USER, "invoice.pdf");
    expect(a).not.toBe(b);
  });

  test("strips directory traversal from the supplied filename", () => {
    // A client-supplied name must never escape its own prefix.
    const p = buildInvoiceObjectPath(USER, "../../etc/passwd");
    expect(p).toStartWith(`${INVOICE_PREFIX}/${USER}/`);
    expect(p).not.toContain("..");
  });
});

describe("parseInvoiceObjectPath", () => {
  test("round-trips a built path", () => {
    const p = buildInvoiceObjectPath(USER, "invoice.pdf");
    expect(parseInvoiceObjectPath(p)?.userId).toBe(USER);
  });

  test("rejects a path with no user segment", () => {
    expect(parseInvoiceObjectPath("invoices/invoice.pdf")).toBeNull();
  });

  test("rejects a non-uuid user segment", () => {
    // Refusing to parse is what stops a crafted path from attributing an
    // upload to an arbitrary string.
    expect(parseInvoiceObjectPath("invoices/not-a-uuid/x.pdf")).toBeNull();
  });

  test("rejects a different prefix", () => {
    expect(parseInvoiceObjectPath(`other/${USER}/x.pdf`)).toBeNull();
  });

  test("rejects an empty or malformed path", () => {
    expect(parseInvoiceObjectPath("")).toBeNull();
    expect(parseInvoiceObjectPath("invoices")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/common/src/storage/object-path.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/common/src/storage/object-path.ts
import { randomUUID } from "crypto";

export const INVOICE_PREFIX = "invoices";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Invoice objects live at `invoices/<userId>/<uuid>.<ext>`.
 *
 * MinIO's webhook carries no user context — only a bucket and a key — so the
 * path is the only place attribution can come from. The presigned-URL
 * endpoint derives the prefix from the authenticated session rather than
 * accepting it from the client, which is what makes the path trustworthy.
 */
export const buildInvoiceObjectPath = (
  userId: string,
  filename: string,
): string => {
  // Keep only the extension from the client-supplied name; the rest is
  // replaced by a uuid so a crafted name cannot escape the prefix.
  const base = filename.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).replace(/[^.A-Za-z0-9]/g, "") : "";
  return `${INVOICE_PREFIX}/${userId}/${randomUUID()}${ext}`;
};

/** Returns null for anything that is not a well-formed invoice path. */
export const parseInvoiceObjectPath = (
  objectPath: string,
): { userId: string; filename: string } | null => {
  if (typeof objectPath !== "string" || !objectPath) return null;

  const parts = objectPath.split("/");
  if (parts.length !== 3) return null;

  const [prefix, userId, filename] = parts;
  if (prefix !== INVOICE_PREFIX) return null;
  if (!userId || !UUID_RE.test(userId)) return null;
  if (!filename) return null;

  return { userId, filename };
};
```

```ts
// packages/common/src/storage/index.ts
export * from "./object-path";
```

```ts
// packages/common/index.ts — append
export * from './src/storage'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/common/src/storage/object-path.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/common/src/storage packages/common/index.ts
git commit -m "feat(common): add invoice object-path helpers for user attribution"
```

---

### Task 3: Mapping engine — core field routing

**Files:**
- Create: `packages/common/src/mapping/apply-mapping.ts`
- Create: `packages/common/src/mapping/index.ts`
- Create: `packages/common/src/mapping/apply-mapping.test.ts`
- Modify: `packages/common/index.ts`

**Interfaces:**
- Consumes: `toMinorUnits`, `parseAmount` from `common/src/money`
- Produces:
  - `type MappedInvoice = { vendor: MappedVendor; invoice: MappedInvoiceFields; lineItems: MappedLineItem[]; data: Record<string, unknown>; issues: string[] }`
  - `applyMapping(extracted: Record<string, unknown>, fieldMapping: Record<string, string | null>): MappedInvoice`
  - `getByPath(obj: Record<string, unknown>, path: string): unknown`

- [ ] **Step 1: Write the failing test**

```ts
// packages/common/src/mapping/apply-mapping.test.ts
import { test, expect, describe } from "bun:test";
import { applyMapping, getByPath } from "./apply-mapping";

const EN16931_MAPPING = {
  "vendor.name": "vendorName",
  "vendor.taxId": "vendorTaxId",
  "vendor.email": "vendorEmail",
  "vendor.address": "vendorAddress",
  invoiceNumber: "invoiceNumber",
  poNumber: "poNumber",
  issueDate: "issueDate",
  dueDate: "dueDate",
  currency: "currency",
  subtotal: "subtotal",
  taxTotal: "taxTotal",
  discount: "discount",
  total: "total",
  paymentTerms: "paymentTerms",
  lineItems: "lineItems",
} as const;

const ACME = {
  vendor: { name: "Acme Supplies Ltd", taxId: "GB123456789" },
  invoiceNumber: "INV-2026-001",
  issueDate: "2026-09-01",
  currency: "GBP",
  subtotal: 1800,
  taxTotal: 360,
  total: 2160,
  costCentre: "ENG-42",
  lineItems: [
    { description: "Consulting hours", quantity: 10, unitPrice: 150, lineTotal: 1500 },
  ],
};

describe("getByPath", () => {
  test("reads a nested value", () => {
    expect(getByPath({ a: { b: "x" } }, "a.b")).toBe("x");
  });

  test("returns undefined for a missing path rather than throwing", () => {
    expect(getByPath({ a: {} }, "a.b.c")).toBeUndefined();
  });
});

describe("applyMapping — core fields", () => {
  test("routes mapped fields to the vendor and invoice", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.vendor.name).toBe("Acme Supplies Ltd");
    expect(m.vendor.taxId).toBe("GB123456789");
    expect(m.invoice.invoiceNumber).toBe("INV-2026-001");
    expect(m.invoice.issueDate).toBe("2026-09-01");
  });

  test("converts money to minor units in the invoice's currency", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.invoice.currency).toBe("GBP");
    expect(m.invoice.totalMinor).toBe(216000n);
    expect(m.invoice.subtotalMinor).toBe(180000n);
  });

  test("a zero-decimal currency is not divided by 100", () => {
    // Currency must be resolved before amounts. If it were not, 5000 JPY
    // would be stored as 50 — a 100x error, not a rounding one.
    const m = applyMapping(
      { ...ACME, currency: "JPY", total: 5000 },
      EN16931_MAPPING,
    );
    expect(m.invoice.totalMinor).toBe(5000n);
  });

  test("unmapped fields fall through to data", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.data.costCentre).toBe("ENG-42");
    expect(m.invoice).not.toHaveProperty("costCentre");
  });

  test("maps line items with their document order preserved", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.lineItems).toHaveLength(1);
    expect(m.lineItems[0]!.position).toBe(0);
    expect(m.lineItems[0]!.description).toBe("Consulting hours");
    expect(m.lineItems[0]!.lineTotalMinor).toBe(150000n);
  });

  test("a differently shaped format produces the same core columns", () => {
    // The property that makes cross-user queries possible: Bob's German
    // fields land in the same typed columns as Acme's English ones.
    const bob = {
      lieferant: { name: "Müller GmbH" },
      gesamt: 2400,
      waehrung: "EUR",
      lieferschein: "LS-9982",
    };
    const m = applyMapping(bob, {
      "lieferant.name": "vendorName",
      gesamt: "total",
      waehrung: "currency",
      lieferschein: null,
    });

    expect(m.vendor.name).toBe("Müller GmbH");
    expect(m.invoice.totalMinor).toBe(240000n);
    expect(m.data.lieferschein).toBe("LS-9982");
  });

  test("defaults to USD and records an issue when no currency is mapped", () => {
    const m = applyMapping({ total: 10 }, { total: "total" });
    expect(m.invoice.currency).toBe("USD");
    expect(m.issues.join(" ")).toContain("currency");
  });
});

describe("applyMapping — ambiguity", () => {
  test("leaves an unparseable amount null and records an issue", () => {
    const m = applyMapping(
      { ...ACME, total: "N/A" },
      EN16931_MAPPING,
    );
    expect(m.invoice.totalMinor).toBeNull();
    expect(m.issues.some((i) => i.includes("total"))).toBe(true);
  });

  test("parses a european decimal written as a string", () => {
    // parseFloat("1.234,56") is 1.234 — a 1000x error this guards against.
    const m = applyMapping(
      { ...ACME, currency: "EUR", total: "1.234,56" },
      EN16931_MAPPING,
    );
    expect(m.invoice.totalMinor).toBe(123456n);
  });

  test("leaves an unparseable date null and records an issue", () => {
    const m = applyMapping({ ...ACME, issueDate: "last tuesday" }, EN16931_MAPPING);
    expect(m.invoice.issueDate).toBeNull();
    expect(m.issues.some((i) => i.includes("issueDate"))).toBe(true);
  });

  test("an empty extraction produces issues rather than throwing", () => {
    const m = applyMapping({}, EN16931_MAPPING);
    expect(m.issues.length).toBeGreaterThan(0);
    expect(m.vendor.name).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/common/src/mapping/apply-mapping.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/common/src/mapping/apply-mapping.ts
import { parseAmount, toMinorUnits } from "../money";

export type MappedVendor = {
  name: string | null;
  taxId: string | null;
  email: string | null;
  address: string | null;
};

export type MappedInvoiceFields = {
  invoiceNumber: string | null;
  poNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotalMinor: bigint | null;
  taxTotalMinor: bigint | null;
  discountMinor: bigint | null;
  totalMinor: bigint | null;
  paymentTerms: string | null;
};

export type MappedLineItem = {
  position: number;
  description: string | null;
  quantity: string | null;
  unitPriceMinor: bigint | null;
  lineTotalMinor: bigint | null;
  taxRate: string | null;
};

export type MappedInvoice = {
  vendor: MappedVendor;
  invoice: MappedInvoiceFields;
  lineItems: MappedLineItem[];
  data: Record<string, unknown>;
  issues: string[];
};

/** Reads "vendor.name" out of a nested object, undefined if absent. */
export const getByPath = (
  obj: Record<string, unknown>,
  path: string,
): unknown =>
  path.split(".").reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === "object"
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  );

const MONEY_FIELDS = ["subtotal", "taxTotal", "discount", "total"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const asText = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

/**
 * Amounts may arrive as numbers or as strings written in any locale, so a
 * string goes through parseAmount rather than Number(): parseFloat("1.234,56")
 * yields 1.234, a 1000x error on a real invoice.
 */
const asMoney = (
  v: unknown,
  currency: string,
  field: string,
  issues: string[],
): bigint | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return toMinorUnits(v, currency);
  }
  const parsed = parseAmount(String(v), currency);
  if (parsed === null) {
    issues.push(`Could not read an amount for ${field}: ${JSON.stringify(v)}`);
  }
  return parsed;
};

const asDate = (
  v: unknown,
  field: string,
  issues: string[],
): string | null => {
  const text = asText(v);
  if (text === null) return null;
  if (ISO_DATE.test(text)) return text;

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) {
    issues.push(`Could not read a date for ${field}: ${JSON.stringify(v)}`);
    return null;
  }
  return d.toISOString().slice(0, 10);
};

/**
 * Routes an extracted object onto the core columns, leaving anything without
 * a mapping in `data`.
 *
 * Nothing here touches the database or the network, so the web app can call
 * it to preview a format before anything is saved.
 */
export const applyMapping = (
  extracted: Record<string, unknown>,
  fieldMapping: Record<string, string | null>,
): MappedInvoice => {
  const issues: string[] = [];

  // Invert the mapping so a core field can be looked up by name.
  const pathFor = new Map<string, string>();
  for (const [path, core] of Object.entries(fieldMapping)) {
    if (core) pathFor.set(core, path);
  }

  const read = (core: string): unknown => {
    const path = pathFor.get(core);
    return path ? getByPath(extracted, path) : undefined;
  };

  // Currency first: every amount below needs its divisor.
  const rawCurrency = asText(read("currency"));
  let currency = "USD";
  if (rawCurrency && /^[A-Za-z]{3}$/.test(rawCurrency)) {
    currency = rawCurrency.toUpperCase();
  } else {
    issues.push(
      rawCurrency
        ? `Unrecognised currency ${JSON.stringify(rawCurrency)}, defaulted to USD`
        : "No currency found, defaulted to USD",
    );
  }

  const vendor: MappedVendor = {
    name: asText(read("vendorName")),
    taxId: asText(read("vendorTaxId")),
    email: asText(read("vendorEmail")),
    address: asText(read("vendorAddress")),
  };
  if (!vendor.name) issues.push("No vendor name found");

  const money: Record<string, bigint | null> = {};
  for (const field of MONEY_FIELDS) {
    money[field] = asMoney(read(field), currency, field, issues);
  }

  const invoice: MappedInvoiceFields = {
    invoiceNumber: asText(read("invoiceNumber")),
    poNumber: asText(read("poNumber")),
    issueDate: asDate(read("issueDate"), "issueDate", issues),
    dueDate: asDate(read("dueDate"), "dueDate", issues),
    currency,
    subtotalMinor: money.subtotal ?? null,
    taxTotalMinor: money.taxTotal ?? null,
    discountMinor: money.discount ?? null,
    totalMinor: money.total ?? null,
    paymentTerms: asText(read("paymentTerms")),
  };
  if (invoice.totalMinor === null) issues.push("No invoice total found");

  const rawLines = read("lineItems");
  const lineItems: MappedLineItem[] = Array.isArray(rawLines)
    ? rawLines.map((raw, index) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        return {
          position: index,
          description: asText(item.description),
          quantity:
            item.quantity === null || item.quantity === undefined
              ? null
              : String(item.quantity),
          unitPriceMinor: asMoney(
            item.unitPrice,
            currency,
            `lineItems[${index}].unitPrice`,
            issues,
          ),
          lineTotalMinor: asMoney(
            item.lineTotal,
            currency,
            `lineItems[${index}].lineTotal`,
            issues,
          ),
          taxRate:
            item.taxRate === null || item.taxRate === undefined
              ? null
              : String(item.taxRate),
        };
      })
    : [];

  // Anything the format did not map to a core column stays queryable in the
  // JSONB column rather than being dropped.
  const mappedTopLevel = new Set(
    Object.entries(fieldMapping)
      .filter(([, core]) => core !== null)
      .map(([path]) => path.split(".")[0]!),
  );
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (!mappedTopLevel.has(key)) data[key] = value;
  }

  return { vendor, invoice, lineItems, data, issues };
};
```

```ts
// packages/common/src/mapping/index.ts
export * from "./apply-mapping";
```

```ts
// packages/common/index.ts — append
export * from './src/mapping'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/common/src/mapping/apply-mapping.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/common/src/mapping packages/common/index.ts
git commit -m "feat(common): add the invoice field mapping engine"
```

---

### Task 4: Text extraction with anydoc and an OCR fallback

**Files:**
- Create: `apps/workers/media-worker/src/services/text-extraction.service.ts`
- Create: `apps/workers/media-worker/src/services/text-extraction.test.ts`
- Modify: `apps/workers/media-worker/package.json`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `extractText(localPath: string, mimeType: string, ocrFallback: (path: string) => Promise<string>): Promise<{ text: string; source: "anydoc" | "ocr" }>`

- [ ] **Step 1: Add the dependency**

```bash
cd apps/workers/media-worker && bun add @firecrawl/anydoc && cd -
```

Expected: installs `@firecrawl/anydoc@0.2.x` with a prebuilt platform binary. No build step.

- [ ] **Step 2: Write the failing test**

```ts
// apps/workers/media-worker/src/services/text-extraction.test.ts
import { test, expect, describe } from "bun:test";
import { extractText } from "./text-extraction.service";

/**
 * anydoc is a document converter, not an OCR engine. It throws
 * `code: "needsOcr"` on a scanned PDF and `code: "unsupported"` on an image;
 * both must route to the OCR fallback rather than fail the document.
 */
const throwing = (code: string) => {
  const err = new Error(`anydoc: ${code}`) as Error & { code: string };
  err.code = code;
  throw err;
};

describe("extractText", () => {
  test("uses the OCR fallback for an image, without calling anydoc", async () => {
    let ocrCalled = false;
    const result = await extractText("/tmp/scan.png", "image/png", async () => {
      ocrCalled = true;
      return "text from ocr";
    });

    expect(ocrCalled).toBe(true);
    expect(result.source).toBe("ocr");
    expect(result.text).toBe("text from ocr");
  });

  test("falls back to OCR when anydoc reports needsOcr", async () => {
    const result = await extractText(
      "/tmp/scanned.pdf",
      "application/pdf",
      async () => "ocr text",
      async () => throwing("needsOcr"),
    );
    expect(result.source).toBe("ocr");
  });

  test("falls back to OCR when anydoc reports unsupported", async () => {
    const result = await extractText(
      "/tmp/weird.pdf",
      "application/pdf",
      async () => "ocr text",
      async () => throwing("unsupported"),
    );
    expect(result.source).toBe("ocr");
  });

  test("returns anydoc output for a digital pdf", async () => {
    const result = await extractText(
      "/tmp/digital.pdf",
      "application/pdf",
      async () => "should not be used",
      async () => "# INVOICE\n\n|Item|Total|\n|---|---|",
    );
    expect(result.source).toBe("anydoc");
    expect(result.text).toContain("INVOICE");
  });

  test("propagates an unexpected anydoc error instead of masking it as OCR", async () => {
    // A disk error is not a "needs OCR" condition; silently falling back
    // would turn a bug into a slow, expensive, wrong success.
    await expect(
      extractText(
        "/tmp/x.pdf",
        "application/pdf",
        async () => "ocr",
        async () => throwing("io"),
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test apps/workers/media-worker/src/services/text-extraction.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// apps/workers/media-worker/src/services/text-extraction.service.ts
import { toMarkdown } from "@firecrawl/anydoc";

export type ExtractedText = {
  text: string;
  source: "anydoc" | "ocr";
};

/** anydoc error codes that mean "this needs OCR", not "this is broken". */
const OCR_CODES = new Set(["needsOcr", "unsupported"]);

const isOcrSignal = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  OCR_CODES.has(String((err as { code?: unknown }).code));

/**
 * Two paths, in cost order.
 *
 * A digital PDF or Office file converts locally in about 12ms and keeps the
 * document off the network entirely — which also means the Mistral fallback's
 * public-URL requirement does not apply to the common case. anydoc preserves
 * line-item tables as markdown tables, which an LLM reads far more reliably
 * than reflowed prose.
 *
 * Images never reach anydoc: it is a document converter and rejects them.
 *
 * `converter` is injectable so tests can exercise the fallback branches
 * without fixture files.
 */
export const extractText = async (
  localPath: string,
  mimeType: string,
  ocrFallback: (path: string) => Promise<string>,
  converter: (path: string) => Promise<string> = toMarkdown,
): Promise<ExtractedText> => {
  if (mimeType.startsWith("image/")) {
    return { text: await ocrFallback(localPath), source: "ocr" };
  }

  try {
    return { text: await converter(localPath), source: "anydoc" };
  } catch (err) {
    if (!isOcrSignal(err)) throw err;
    return { text: await ocrFallback(localPath), source: "ocr" };
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test apps/workers/media-worker/src/services/text-extraction.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/workers/media-worker/src/services/text-extraction.service.ts \
        apps/workers/media-worker/src/services/text-extraction.test.ts \
        apps/workers/media-worker/package.json bun.lock
git commit -m "feat(worker): add anydoc text extraction with an OCR fallback"
```

---

### Task 5: Gemini structured extraction

**Files:**
- Modify: `packages/agents/index.ts`
- Create: `packages/agents/src/invoice-extractor.ts`
- Create: `packages/agents/prompts/extraction.prompt.ts`
- Create: `packages/agents/src/invoice-extractor.test.ts`
- Modify: `packages/agents/package.json`
- Modify: `packages/common/src/environment/schema.ts`
- Modify: `packages/common/src/environment/env.ts`
- Modify: `.env.local` (add `GOOGLE_API_KEY=` and `GEMINI_MODEL=gemini-2.0-flash`)

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `extractInvoice(markdown: string, jsonSchema: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<Record<string, unknown>>`

- [ ] **Step 1: Add the dependency and env**

```bash
cd packages/agents && bun add @langchain/google-genai @langchain/core && cd -
```

Add to `.env.local`, under the Agent variables block:

```
GOOGLE_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
```

- [ ] **Step 2: Write the failing test**

```ts
// packages/agents/src/invoice-extractor.test.ts
import { test, expect, describe } from "bun:test";
import { buildExtractionPrompt } from "./invoice-extractor";

describe("buildExtractionPrompt", () => {
  const schema = {
    type: "object",
    properties: { total: { type: "number" } },
    required: ["total"],
  };

  test("includes the document text", () => {
    const p = buildExtractionPrompt("TOTAL DUE: 2,160.00 GBP", schema);
    expect(p).toContain("2,160.00");
  });

  test("instructs the model not to invent values", () => {
    // A hallucinated total is worse than a null one: null sets needs_review,
    // an invented number enters the books looking correct.
    const p = buildExtractionPrompt("x", schema);
    expect(p.toLowerCase()).toContain("null");
  });

  test("asks for amounts as written on the document", () => {
    const p = buildExtractionPrompt("x", schema);
    expect(p.toLowerCase()).toContain("as written");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test packages/agents/src/invoice-extractor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/agents/prompts/extraction.prompt.ts
const EXTRACTION_PROMPT = `
You extract structured data from invoice documents.

Rules:
- Use only values present in the document. If a field is not present, return
  null for it. Never infer, calculate, or invent a value — a null field is
  flagged for human review, while an invented one enters the accounting
  records looking correct.
- Return amounts exactly as written on the document, including their
  separators. Do not convert currencies or reformat numbers.
- Return the currency as its ISO 4217 code (USD, EUR, GBP, JPY).
- Return dates as YYYY-MM-DD.
- Return line items in the order they appear on the document.
- lineTotal is the amount printed on the line, not quantity x unitPrice.
  If they disagree, return what is printed.
`;

export default EXTRACTION_PROMPT;
```

```ts
// packages/agents/src/invoice-extractor.ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env, AppError } from "common";
import EXTRACTION_PROMPT from "../prompts/extraction.prompt";

const DEFAULT_TIMEOUT_MS = 120_000;

/** Exported for testing: the prompt is the part worth asserting on. */
export const buildExtractionPrompt = (
  markdown: string,
  jsonSchema: Record<string, unknown>,
): string =>
  [
    EXTRACTION_PROMPT,
    "",
    "Extract into this shape:",
    JSON.stringify(jsonSchema, null, 2),
    "",
    "Document:",
    markdown,
  ].join("\n");

/**
 * Structured extraction constrained by the user's own format schema.
 *
 * withStructuredOutput binds the JSON Schema to the request, so the model is
 * constrained rather than merely asked — the difference that makes a small
 * model's output usable. The schema comes from invoice_formats.schema, which
 * is the same definition the mapping engine routes from, so extraction and
 * storage cannot drift apart.
 */
export const extractInvoice = async (
  markdown: string,
  jsonSchema: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<Record<string, unknown>> => {
  if (!env.llm.GOOGLE_API_KEY) {
    throw new AppError(
      "GOOGLE_API_KEY is not configured",
      500,
      "extractInvoice",
    );
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      apiKey: env.llm.GOOGLE_API_KEY,
      model: env.llm.GEMINI_MODEL,
      temperature: 0,
      maxRetries: 0, // BullMQ owns retries; two retry layers compound delays.
    });

    const structured = model.withStructuredOutput(jsonSchema);

    const result = await Promise.race([
      structured.invoke(buildExtractionPrompt(markdown, jsonSchema)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Extraction timed out")),
          opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ),
      ),
    ]);

    return result as Record<string, unknown>;
  } catch (error) {
    throw new AppError(
      "Gemini failed to extract invoice fields",
      500,
      "extractInvoice",
      error,
      { markdownLength: markdown.length },
    );
  }
};
```

```ts
// packages/agents/index.ts — append to the existing file
export * from "./src/invoice-extractor";
```

```ts
// packages/common/src/environment/schema.ts — extend the llm block
  llm: z.object({
    MISTRAL_API_KEY: z.string().nonempty(),
    LLM_MODEL: z.string().nonempty(),
    OLLAMA_HOST: z.string().nonempty(),
    GOOGLE_API_KEY: z.string().default(""),
    GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  }),
```

```ts
// packages/common/src/environment/env.ts — extend the llm block
  llm: {
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    LLM_MODEL: process.env.LLM_MODEL,
    OLLAMA_HOST: process.env.OLLAMA_HOST,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/agents/src/invoice-extractor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verify the whole suite still passes**

Run: `bun run test`
Expected: all prior tests still pass. `GOOGLE_API_KEY` defaults to `""` so a missing key does not break startup — `extractInvoice` fails at call time with a clear message instead.

- [ ] **Step 7: Commit**

```bash
git add packages/agents packages/common/src/environment bun.lock
git commit -m "feat(agents): add Gemini structured invoice extraction"
```

---

### Task 6: Extraction persistence repository

**Files:**
- Create: `apps/api/src/invoices/extraction.repository.ts`
- Create: `apps/api/src/invoices/extraction.repository.test.ts`

**Interfaces:**
- Consumes: `MappedInvoice` from Task 3
- Produces: `persistExtraction(input: { userId: string; documentId: string; mapped: MappedInvoice; confidence: number }): Promise<{ invoiceId: string; vendorId: string | null }>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/invoices/extraction.repository.test.ts
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { db, users, invoices, lineItems, vendors, documents } from "drizzle";
import { eq } from "drizzle-orm";
import type { MappedInvoice } from "common";
import { persistExtraction } from "./extraction.repository";

let userId: string;
let documentId: string;

const mapped = (over: Partial<MappedInvoice> = {}): MappedInvoice => ({
  vendor: { name: "Acme Supplies Ltd", taxId: "GB123", email: null, address: null },
  invoice: {
    invoiceNumber: "INV-2026-001",
    poNumber: null,
    issueDate: "2026-09-01",
    dueDate: null,
    currency: "GBP",
    subtotalMinor: 180000n,
    taxTotalMinor: 36000n,
    discountMinor: null,
    totalMinor: 216000n,
    paymentTerms: "Net 30",
  },
  lineItems: [
    {
      position: 0,
      description: "Consulting hours",
      quantity: "10",
      unitPriceMinor: 15000n,
      lineTotalMinor: 150000n,
      taxRate: "20",
    },
  ],
  data: { costCentre: "ENG-42" },
  issues: [],
  ...over,
});

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `extract-${Math.random().toString(36).slice(2, 8)}@example.com`,
      passwordHash: "x",
    })
    .returning();
  userId = u!.id;

  const [d] = await db
    .insert(documents)
    .values({
      userId,
      bucketName: "invoices",
      objectPath: `invoices/${userId}/${Math.random().toString(36).slice(2)}.pdf`,
      mimeType: "application/pdf",
    })
    .returning();
  documentId = d!.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

describe("persistExtraction", () => {
  test("writes vendor, invoice and line items together", async () => {
    const { invoiceId, vendorId } = await persistExtraction({
      userId,
      documentId,
      mapped: mapped(),
      confidence: 0.9,
    });

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.totalMinor).toBe(216000n);
    expect(inv!.currency).toBe("GBP");
    expect(inv!.source).toBe("extraction");
    expect(inv!.needsReview).toBe(false);
    expect(inv!.data).toEqual({ costCentre: "ENG-42" });

    const lines = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.position).toBe(0);

    const [v] = await db.select().from(vendors).where(eq(vendors.id, vendorId!));
    expect(v!.name).toBe("Acme Supplies Ltd");
  });

  test("reuses an existing vendor rather than duplicating it", async () => {
    const first = await persistExtraction({
      userId,
      documentId,
      mapped: mapped(),
      confidence: 0.9,
    });
    const second = await persistExtraction({
      userId,
      documentId,
      mapped: mapped(),
      confidence: 0.9,
    });

    expect(second.vendorId).toBe(first.vendorId);
  });

  test("flags needs_review when the mapping reported issues", async () => {
    const { invoiceId } = await persistExtraction({
      userId,
      documentId,
      mapped: mapped({ issues: ["No invoice total found"] }),
      confidence: 0.4,
    });

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.needsReview).toBe(true);
    expect(inv!.confidence).toBeCloseTo(0.4, 5);
  });

  test("persists with a null vendor when no vendor name was extracted", async () => {
    const m = mapped();
    m.vendor.name = null;

    const { invoiceId, vendorId } = await persistExtraction({
      userId,
      documentId,
      mapped: m,
      confidence: 0.3,
    });

    expect(vendorId).toBeNull();
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.vendorId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run db:up && bun test apps/api/src/invoices/extraction.repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/invoices/extraction.repository.ts
import { db, invoices, lineItems, vendors, documents, type Executor } from "drizzle";
import { and, eq, sql } from "drizzle-orm";
import type { MappedInvoice } from "common";

export type PersistExtractionInput = {
  userId: string;
  documentId: string;
  mapped: MappedInvoice;
  confidence: number;
};

/**
 * Finds or creates the vendor. The unique index is on
 * (user_id, lower(name), coalesce(tax_id,'')), so onConflictDoNothing plus a
 * follow-up select is a safe upsert: a concurrent insert of the same vendor
 * loses the race and reads the winner's row.
 */
const upsertVendor = async (
  ex: Executor,
  userId: string,
  vendor: MappedInvoice["vendor"],
): Promise<string | null> => {
  if (!vendor.name) return null;

  const [created] = await ex
    .insert(vendors)
    .values({
      userId,
      name: vendor.name,
      taxId: vendor.taxId,
      email: vendor.email,
      address: vendor.address,
    })
    .onConflictDoNothing()
    .returning({ id: vendors.id });

  if (created) return created.id;

  const [existing] = await ex
    .select({ id: vendors.id })
    .from(vendors)
    .where(
      and(
        eq(vendors.userId, userId),
        sql`lower(${vendors.name}) = lower(${vendor.name})`,
        sql`coalesce(${vendors.taxId}, '') = coalesce(${vendor.taxId ?? null}, '')`,
      ),
    )
    .limit(1);

  return existing?.id ?? null;
};

/**
 * Writes an extraction result across three tables in one transaction.
 *
 * All-or-nothing: an invoice whose line items failed to insert would be a
 * silently wrong financial record, which is worse than no record at all.
 */
export const persistExtraction = async (
  input: PersistExtractionInput,
): Promise<{ invoiceId: string; vendorId: string | null }> => {
  const { userId, documentId, mapped, confidence } = input;

  return db.transaction(async (tx) => {
    const vendorId = await upsertVendor(tx, userId, mapped.vendor);

    const [invoice] = await tx
      .insert(invoices)
      .values({
        userId,
        documentId,
        vendorId,
        invoiceNumber: mapped.invoice.invoiceNumber,
        poNumber: mapped.invoice.poNumber,
        issueDate: mapped.invoice.issueDate,
        dueDate: mapped.invoice.dueDate,
        currency: mapped.invoice.currency,
        subtotalMinor: mapped.invoice.subtotalMinor,
        taxTotalMinor: mapped.invoice.taxTotalMinor,
        discountMinor: mapped.invoice.discountMinor,
        totalMinor: mapped.invoice.totalMinor,
        paymentTerms: mapped.invoice.paymentTerms,
        data: mapped.data,
        source: "extraction",
        confidence,
        needsReview: mapped.issues.length > 0,
      })
      .returning({ id: invoices.id });

    if (!invoice) throw new Error("Failed to insert extracted invoice");

    if (mapped.lineItems.length) {
      await tx.insert(lineItems).values(
        mapped.lineItems.map((item) => ({
          invoiceId: invoice.id,
          position: item.position,
          description: item.description,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          lineTotalMinor: item.lineTotalMinor,
          taxRate: item.taxRate,
        })),
      );
    }

    await tx
      .update(documents)
      .set({
        status: "completed",
        processedAt: new Date(),
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    return { invoiceId: invoice.id, vendorId };
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/api/src/invoices/extraction.repository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/invoices/extraction.repository.ts \
        apps/api/src/invoices/extraction.repository.test.ts
git commit -m "feat(api): add transactional extraction persistence"
```

---

### Task 7: Seed the default format on signup

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/__tests__/isolation.test.ts`

**Interfaces:**
- Consumes: `formatsService.seedDefault(userId)` (exists from Plan 1)
- Produces: every new account has exactly one default format

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/__tests__/isolation.test.ts`, inside the existing `describe("regressions", ...)` block:

```ts
  test("a new account is seeded with a default format", async () => {
    // Extraction needs a schema. Seeding was previously manual and called by
    // nothing, so an account that uploaded before visiting settings had no
    // format at all.
    const res = await asUser(alice, "/formats");
    expect(res.status).toBe(200);

    const body = await json(res);
    const defaults = body.data.filter((f: any) => f.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toContain("EN 16931");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/api/src/__tests__/isolation.test.ts`
Expected: FAIL — `defaults` is empty; signup seeds nothing.

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/auth/auth.service.ts`, import the formats service and call it after the user is created, inside `signup`:

```ts
import { formatsService } from "../formats/formats.service";
```

Then, immediately after the user row is created and before the session is issued:

```ts
    // Every account starts with a usable format. Extraction reads the user's
    // default schema, and seeding was otherwise manual — an account that
    // uploaded before visiting settings would have had nothing to extract
    // against. seedDefault is idempotent, so this is safe to call again.
    await formatsService.seedDefault(user.id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/api/src/__tests__/isolation.test.ts`
Expected: PASS — all prior tests plus the new one.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/__tests__/isolation.test.ts
git commit -m "feat(api): seed the default invoice format on signup"
```

---

### Task 8: Route uploads to the document queue

**Files:**
- Modify: `apps/api/src/queues/index.ts`
- Modify: `apps/api/src/storage/controllers/webhook.controller.ts`
- Create: `apps/api/src/storage/webhook-routing.ts`
- Create: `apps/api/src/storage/webhook-routing.test.ts`

**Interfaces:**
- Consumes: `parseInvoiceObjectPath` (Task 2), `QueueNames.DOCUMENT_QUEUE` (Task 1)
- Produces:
  - `documentQueue` exported from `apps/api/src/queues/index.ts`
  - `isExtractableMimeType(mimeType: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/storage/webhook-routing.test.ts
import { test, expect, describe } from "bun:test";
import { isExtractableMimeType } from "./webhook-routing";

describe("isExtractableMimeType", () => {
  test("accepts pdf", () => {
    expect(isExtractableMimeType("application/pdf")).toBe(true);
  });

  test("accepts images, which reach OCR directly", () => {
    expect(isExtractableMimeType("image/png")).toBe(true);
    expect(isExtractableMimeType("image/jpeg")).toBe(true);
  });

  test("accepts office documents anydoc can convert", () => {
    expect(
      isExtractableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  test("rejects video, which belongs to the existing coaching pipeline", () => {
    expect(isExtractableMimeType("video/mp4")).toBe(false);
  });

  test("rejects an empty or unknown type", () => {
    expect(isExtractableMimeType("")).toBe(false);
    expect(isExtractableMimeType("application/zip")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/api/src/storage/webhook-routing.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/storage/webhook-routing.ts

/** Types the extraction pipeline can handle: anydoc's formats, plus images via OCR. */
const EXTRACTABLE = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf",
  "text/csv",
]);

export const isExtractableMimeType = (mimeType: string): boolean => {
  if (!mimeType) return false;
  if (mimeType.startsWith("image/")) return true;
  return EXTRACTABLE.has(mimeType);
};
```

```ts
// apps/api/src/queues/index.ts — replace the file
import { createQueue, QueueNames } from "queues";

export const imageQueue = createQueue(QueueNames.IMAGE_QUEUE);
export const videoQueue = createQueue(QueueNames.VIDEO_QUEUE);
export const documentQueue = createQueue(QueueNames.DOCUMENT_QUEUE);
```

Replace the body of `router.post("/webhook", ...)` in
`apps/api/src/storage/controllers/webhook.controller.ts` with:

```ts
router.post("/webhook", async (c) => {
  const { Key: objectName, Records }: StorageWebhookDto = await c.req.json();
  const fileType = String(
    Records.at(0)?.s3?.object?.["userMetadata"]["content-type"],
  );
  const [bucketName, ...rest] = objectName.split("/");
  const objectPath = rest.join("/");

  if (!bucketName) {
    throw new AppError("Bucket name not found", 400, "storageWebhook");
  }

  // Invoice uploads carry their owner in the path. Anything that does not
  // parse is dropped rather than enqueued: without a verified owner there is
  // no user to attribute the document to, and guessing would be worse than
  // ignoring it.
  const owner = parseInvoiceObjectPath(objectPath);

  if (owner && isExtractableMimeType(fileType)) {
    const user = await usersRepository.findPublicById(owner.userId);
    if (!user) {
      console.warn("Dropping upload for unknown user", { objectPath });
      return c.json({ success: true, data: { job: null } });
    }

    const { document } = await documentsService.register(owner.userId, {
      bucketName,
      objectPath,
      mimeType: fileType,
      originalFilename: owner.filename,
      sizeBytes: null,
    });

    const job = await documentQueue.add("process_document", {
      documentId: document.id,
      userId: owner.userId,
      bucketName,
      objectPath,
      mimeType: fileType,
    });

    return c.json({ success: true, data: { job: { id: job.id } } });
  }

  // Existing discus coaching pipeline, unchanged.
  let job;
  const legacyPath = rest;

  if (fileType?.includes("image")) {
    job = await imageQueue.add("process_image", {
      fileType: "image",
      bucketName,
      objectPath: legacyPath,
    });
  }

  if (fileType?.includes("video")) {
    job = await videoQueue.add("process_video", {
      fileType: "video",
      bucketName,
      objectPath: legacyPath,
    });
  }

  return c.json({ success: true, data: { job } });
});
```

Add these imports at the top of the same file:

```ts
import { AppError, parseInvoiceObjectPath } from "common";
import { imageQueue, videoQueue, documentQueue } from "../../queues";
import { isExtractableMimeType } from "../webhook-routing";
import { documentsService } from "../../documents/documents.service";
import { usersRepository } from "../../auth/users.repository";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/api/src/storage/webhook-routing.test.ts && bun run typecheck`
Expected: PASS (5 tests), 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storage apps/api/src/queues/index.ts
git commit -m "feat(api): route invoice uploads to the document queue"
```

---

### Task 9: The document worker

**Files:**
- Create: `apps/workers/media-worker/src/workers/document.worker.ts`
- Modify: `apps/workers/media-worker/src/index.ts`
- Modify: `apps/workers/media-worker/package.json` (add `drizzle` and `agents` deps)

**Interfaces:**
- Consumes: `extractText` (Task 4), `extractInvoice` (Task 5), `applyMapping` (Task 3), `persistExtraction` (Task 6), `DocumentJobData` (Task 1)
- Produces: a running worker on `DOCUMENT_QUEUE`

- [ ] **Step 1: Add workspace dependencies**

```bash
cd apps/workers/media-worker && bun add drizzle agents && cd -
```

(These resolve to the workspace packages, matching how `minio`, `queues`, and `common` are already declared.)

- [ ] **Step 2: Write the implementation**

```ts
// apps/workers/media-worker/src/workers/document.worker.ts
import path from "path";
import fs from "fs";
import { createWorker, QueueNames, type DocumentJobData } from "queues";
import { db, documents, invoiceFormats } from "drizzle";
import { and, eq } from "drizzle-orm";
import { applyMapping, rewriteMinioUrl, type MappedInvoice } from "common";
import AgentService, { extractInvoice } from "agents";
import { persistExtraction } from "../../../../api/src/invoices/extraction.repository";
import { minioService } from "../services/minio.service";
import { extractText } from "../services/text-extraction.service";
import {
  DEFAULT_INVOICE_SCHEMA,
  DEFAULT_FIELD_MAPPING,
} from "../../../../api/src/formats/default-format";

/**
 * Confidence is derived rather than asked for: a model's self-reported score
 * is not evidence. One issue from the mapping engine is a small penalty, and
 * a missing total is disqualifying on its own.
 */
const scoreConfidence = (mapped: MappedInvoice): number => {
  let score = 1;
  score -= mapped.issues.length * 0.15;
  if (mapped.invoice.totalMinor === null) score -= 0.4;
  if (!mapped.vendor.name) score -= 0.2;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
};

const documentWorker = await createWorker<DocumentJobData>(
  QueueNames.DOCUMENT_QUEUE,
  async (job) => {
    const { documentId, userId, bucketName, objectPath, mimeType } = job.data;

    await db
      .update(documents)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    const workDir = path.join(__dirname, "../assets/input");
    let localPath: string | null = null;

    try {
      // 1. Text. anydoc reads from local disk, so the file comes down first.
      localPath = await minioService.saveObjectToLocation(
        bucketName,
        objectPath,
        workDir,
      );

      const agentService = new AgentService();
      const { text, source } = await extractText(
        localPath,
        mimeType,
        async () => {
          const url = await minioService.getPresignedUrl({
            bucketName,
            objectName: objectPath,
            isFetch: true,
          });
          const ocr = await agentService.processImageUrl(rewriteMinioUrl(url));
          return (ocr?.pages ?? []).map((p) => p?.markdown ?? "").join("\n\n");
        },
      );

      console.log(`[document] text via ${source}`, { documentId });

      // 2. The user's format, falling back to the built-in template.
      const [format] = await db
        .select()
        .from(invoiceFormats)
        .where(
          and(
            eq(invoiceFormats.userId, userId),
            eq(invoiceFormats.isDefault, true),
          ),
        )
        .limit(1);

      const schema =
        format?.schema ??
        (DEFAULT_INVOICE_SCHEMA as unknown as Record<string, unknown>);
      const fieldMapping = format?.fieldMapping ?? DEFAULT_FIELD_MAPPING;

      // 3. Extract, then map.
      const extracted = await extractInvoice(text, schema);
      const mapped = applyMapping(extracted, fieldMapping);

      // 4. Persist. One transaction across vendor, invoice and line items.
      const { invoiceId } = await persistExtraction({
        userId,
        documentId,
        mapped,
        confidence: scoreConfidence(mapped),
      });

      await db
        .update(documents)
        .set({ ocrText: text, updatedAt: new Date() })
        .where(eq(documents.id, documentId));

      console.log("[document] extracted", {
        documentId,
        invoiceId,
        issues: mapped.issues.length,
      });
    } catch (error) {
      // The message reaches the dashboard as a toast, so it says what went
      // wrong in plain language rather than carrying a stack trace.
      const message =
        error instanceof Error ? error.message : "Extraction failed";

      await db
        .update(documents)
        .set({
          status: "failed",
          errorMessage: message,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw error; // let BullMQ record the failure and retry
    } finally {
      if (localPath) {
        await fs.promises.rm(localPath, { force: true }).catch(() => {});
      }
    }
  },
);

console.log("Document Worker started and listening for jobs...");

process.on("SIGTERM", async () => {
  await documentWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await documentWorker.close();
  process.exit(0);
});
```

```ts
// apps/workers/media-worker/src/index.ts — replace the file
import './workers/image.worker'
import './workers/video.worker'
import './workers/document.worker'
```

- [ ] **Step 3: Verify it typechecks and boots**

Run: `bun run typecheck`
Expected: 0 errors in `apps/api`.

Run: `bun run db:up && REDIS_HOST=localhost REDIS_PORT=6377 bun run --filter=worker dev`
Expected: logs `Document Worker started and listening for jobs...` alongside the two existing workers. Stop it with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add apps/workers/media-worker
git commit -m "feat(worker): add the invoice document extraction worker"
```

---

### Task 10: Retry endpoint for failed documents

**Files:**
- Modify: `apps/api/src/documents/documents.controller.ts`
- Modify: `apps/api/src/documents/documents.service.ts`
- Modify: `apps/api/src/__tests__/isolation.test.ts`

**Interfaces:**
- Consumes: `documentQueue` (Task 8)
- Produces: `POST /documents/:id/retry`

- [ ] **Step 1: Write the failing test**

Append to the `describe("regressions", ...)` block in
`apps/api/src/__tests__/isolation.test.ts`:

```ts
  test("a failed document can be retried, and another user's cannot", async () => {
    const created = await asUser(alice, "/documents", {
      method: "POST",
      body: JSON.stringify({
        bucketName: "invoices",
        objectPath: `invoices/${alice.userId}/${unique()}.pdf`,
        mimeType: "application/pdf",
      }),
    });
    const docId = (await json(created)).data.id;

    const retried = await asUser(alice, `/documents/${docId}/retry`, {
      method: "POST",
    });
    expect(retried.status).toBe(200);
    expect((await json(retried)).data.status).toBe("pending");

    // Ownership is checked the same way as every other route: 404, not 403.
    const asMallory = await asUser(mallory, `/documents/${docId}/retry`, {
      method: "POST",
    });
    expect(asMallory.status).toBe(404);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/api/src/__tests__/isolation.test.ts`
Expected: FAIL — 404 on the retry route for Alice (route does not exist).

- [ ] **Step 3: Write minimal implementation**

Add to `apps/api/src/documents/documents.service.ts`:

```ts
import { documentQueue } from "../queues";

  /**
   * Re-enqueues a document for extraction. Used after a failure, so it clears
   * the previous error rather than leaving a stale message on a pending row.
   */
  async retry(id: string, userId: string) {
    const doc = await documentsService.getById(id, userId);

    const [updated] = await db
      .update(documents)
      .set({
        status: "pending",
        errorMessage: null,
        processedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();

    await documentQueue.add("process_document", {
      documentId: doc.id,
      userId,
      bucketName: doc.bucketName,
      objectPath: doc.objectPath,
      mimeType: doc.mimeType,
    });

    return updated!;
  },
```

Add the matching imports to that file if absent:

```ts
import { db, documents } from "drizzle";
import { and, eq } from "drizzle-orm";
```

Add to `apps/api/src/documents/documents.controller.ts`, before the
`DELETE /:id` route:

```ts
/** POST /documents/:id/retry — re-run extraction after a failure. */
router.post("/:id/retry", async (c) => {
  const doc = await documentsService.retry(c.req.param("id"), getUserId(c));
  return c.json(ok(serializeDocument(doc)));
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/api/src/__tests__/isolation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/documents
git commit -m "feat(api): add a retry endpoint for failed documents"
```

---

### Task 11: Presigned upload enforces the user prefix

**Files:**
- Modify: `apps/api/src/storage/controllers/get-pre-signed-url.controller.ts`
- Modify: `apps/api/src/storage/validators/upload-url.dto.ts`
- Create: `apps/api/src/storage/upload-url.test.ts`

**Interfaces:**
- Consumes: `buildInvoiceObjectPath` (Task 2), `requireAuth` (Plan 1)
- Produces: `POST /storage/invoice-upload-url` returning `{ url, objectPath }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/storage/upload-url.test.ts
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { db, users } from "drizzle";
import { eq } from "drizzle-orm";
import app from "../index";

let cookie: string;
let userId: string;

const json = (res: Response) => res.json() as Promise<{ data: any }>;

beforeAll(async () => {
  const email = `upload-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await app.fetch(
    new Request("http://localhost/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "a-sufficiently-long-password" }),
    }),
  );
  userId = (await json(res)).data.user.id;
  cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

describe("POST /storage/invoice-upload-url", () => {
  test("returns a path scoped to the caller", async () => {
    const res = await app.fetch(
      new Request("http://localhost/storage/invoice-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ filename: "invoice.pdf" }),
      }),
    );

    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.objectPath).toStartWith(`invoices/${userId}/`);
    expect(data.url).toBeDefined();
  });

  test("ignores a client-supplied path and keeps the caller's prefix", async () => {
    // The whole attribution scheme rests on the client being unable to choose
    // its own prefix.
    const res = await app.fetch(
      new Request("http://localhost/storage/invoice-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ filename: "../../other-user/evil.pdf" }),
      }),
    );

    const { data } = await json(res);
    expect(data.objectPath).toStartWith(`invoices/${userId}/`);
    expect(data.objectPath).not.toContain("..");
  });

  test("requires authentication", async () => {
    const res = await app.fetch(
      new Request("http://localhost/storage/invoice-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "invoice.pdf" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/api/src/storage/upload-url.test.ts`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write minimal implementation**

Add to `apps/api/src/storage/validators/upload-url.dto.ts`:

```ts
import { z } from 'zod'
import { validate } from 'common'

export const invoiceUploadSchema = z.object({
    filename: z.string().min(1).max(500),
})

export type InvoiceUploadDto = z.infer<typeof invoiceUploadSchema>
export const invoiceUploadValidator = validate('json', invoiceUploadSchema)
```

Add to `apps/api/src/storage/controllers/get-pre-signed-url.controller.ts`:

```ts
import { buildInvoiceObjectPath, env } from "common";
import { requireAuth, getUserId } from "../../auth/middleware/auth.middleware";
import {
  invoiceUploadValidator,
  type InvoiceUploadDto,
} from "../validators/upload-url.dto";

/**
 * POST /storage/invoice-upload-url
 *
 * The object path is derived from the authenticated session, never from the
 * request body. This is what makes the path a trustworthy source of ownership
 * when the MinIO webhook later parses it.
 */
router.post(
  "/invoice-upload-url",
  requireAuth,
  invoiceUploadValidator,
  async (c) => {
    const { filename }: InvoiceUploadDto = c.req.valid("json");
    const objectPath = buildInvoiceObjectPath(getUserId(c), filename);

    const url = await minioService.getPresignedUrl({
      bucketName: "invoices",
      objectName: objectPath,
      expires: env.minio.EXPIRES_IN,
    });

    return c.json({ success: true, data: { url, objectPath } });
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/api/src/storage/upload-url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storage
git commit -m "feat(api): add a presigned invoice upload URL scoped to the caller"
```

---

### Task 12: End-to-end verification

**Files:**
- Create: `apps/api/src/__tests__/extraction-e2e.test.ts`
- Modify: `docs/api-test-console.html`

**Interfaces:**
- Consumes: everything above
- Produces: a passing end-to-end test and console coverage

- [ ] **Step 1: Write the end-to-end test**

```ts
// apps/api/src/__tests__/extraction-e2e.test.ts
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { db, users, documents, invoices, lineItems } from "drizzle";
import { eq } from "drizzle-orm";
import { applyMapping } from "common";
import { persistExtraction } from "../invoices/extraction.repository";
import {
  DEFAULT_FIELD_MAPPING,
} from "../formats/default-format";

/**
 * The pipeline minus the network: a realistic Gemini response is fed through
 * the mapping engine and the persistence layer. The LLM itself is stubbed so
 * the test is deterministic and free; Task 5 covers the prompt separately.
 */
const GEMINI_RESPONSE = {
  vendor: {
    name: "Acme Supplies Ltd",
    taxId: "GB123456789",
    email: "ar@acme.test",
  },
  invoiceNumber: "INV-2026-001",
  issueDate: "2026-09-01",
  dueDate: "2026-10-01",
  currency: "GBP",
  subtotal: 1800,
  taxTotal: 360,
  total: 2160,
  paymentTerms: "Net 30",
  costCentre: "ENG-42",
  lineItems: [
    { description: "Consulting hours", quantity: 10, unitPrice: 150, lineTotal: 1500 },
    { description: "Support retainer", quantity: 1, unitPrice: 300, lineTotal: 300 },
  ],
};

let userId: string;
let documentId: string;

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `e2e-${Math.random().toString(36).slice(2, 8)}@example.com`,
      passwordHash: "x",
    })
    .returning();
  userId = u!.id;

  const [d] = await db
    .insert(documents)
    .values({
      userId,
      bucketName: "invoices",
      objectPath: `invoices/${userId}/${Math.random().toString(36).slice(2)}.pdf`,
      mimeType: "application/pdf",
    })
    .returning();
  documentId = d!.id;
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

describe("extraction end to end", () => {
  test("a Gemini response becomes rows across three tables", async () => {
    const mapped = applyMapping(GEMINI_RESPONSE, DEFAULT_FIELD_MAPPING);
    expect(mapped.issues).toHaveLength(0);

    const { invoiceId, vendorId } = await persistExtraction({
      userId,
      documentId,
      mapped,
      confidence: 1,
    });

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.totalMinor).toBe(216000n);
    expect(inv!.currency).toBe("GBP");
    expect(inv!.needsReview).toBe(false);
    expect(inv!.data).toEqual({ costCentre: "ENG-42" });
    expect(vendorId).not.toBeNull();

    const lines = await db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId));
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.position)).toEqual([0, 1]);

    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    expect(doc!.status).toBe("completed");
    expect(doc!.processedAt).not.toBeNull();
  });

  test("a partial extraction still persists, flagged for review", async () => {
    const [d2] = await db
      .insert(documents)
      .values({
        userId,
        bucketName: "invoices",
        objectPath: `invoices/${userId}/${Math.random().toString(36).slice(2)}.pdf`,
        mimeType: "application/pdf",
      })
      .returning();

    const mapped = applyMapping(
      { vendor: { name: "Partial Co" }, currency: "USD" },
      DEFAULT_FIELD_MAPPING,
    );
    expect(mapped.issues.length).toBeGreaterThan(0);

    const { invoiceId } = await persistExtraction({
      userId,
      documentId: d2!.id,
      mapped,
      confidence: 0.4,
    });

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(inv!.needsReview).toBe(true);
    expect(inv!.totalMinor).toBeNull();
  });
});
```

- [ ] **Step 2: Run the full suite**

Run: `bun run db:up && bun run test`
Expected: all tests pass, including the 58 from Plan 1.

- [ ] **Step 3: Run the typecheck**

Run: `bun run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Add console coverage for the new endpoints**

In `docs/api-test-console.html`, add two cases to the Documents group's
`cases` array, after `D8`:

```js
        { id: "D9", m: "POST", path: "/documents/{documentId}/retry", name: "Retry a failed document",
          desc: "Re-enqueues extraction and clears the previous error, so a stale message never sits on a pending row.",
          expect: "404", check: "404 here because D7 deleted the document; the happy path is covered by the unit suite", as: "alice" },
        { id: "D10", m: "POST", path: "/storage/invoice-upload-url", name: "Get an upload URL scoped to the caller",
          desc: "The object path is derived from the session, never the request body — that is what makes it trustworthy as the source of ownership when the webhook parses it.",
          expect: "200", check: "objectPath starts with invoices/<your user id>/",
          body: { filename: "invoice.pdf" }, as: "alice" },
```

- [ ] **Step 5: Verify the console still runs green**

Run: `bunx serve docs -l 3000` in one terminal, open
`http://localhost:3000/api-test-console`, press Run all.
Expected: all cases pass, including D9 and D10.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/__tests__/extraction-e2e.test.ts docs/api-test-console.html
git commit -m "test: add end-to-end extraction coverage"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Ingestion and attribution | 2, 8, 11 |
| Queue and worker | 1, 9 |
| Text extraction (anydoc + OCR fallback) | 4 |
| Structured extraction (Gemini) | 5 |
| Mapping engine | 3 |
| Persistence (one transaction) | 6 |
| Failure handling and retry | 9, 10 |
| Default format fallback + signup seeding | 5 (fallback in 9), 7 |
| Testing | every task, plus 12 |

**Type consistency:** `MappedInvoice` is defined in Task 3 and consumed by
Tasks 6, 9 and 12 with the same field names. `DocumentJobData` is defined in
Task 1 and used in Tasks 8 and 9. `extractText`'s signature in Task 4 matches
its call in Task 9. `persistExtraction`'s signature in Task 6 matches Tasks 9
and 12.

**Known deferrals, stated rather than hidden:**
- `MINIO_PUBLIC_URL` is a stale ngrok address. The OCR fallback cannot work
  until it points somewhere reachable; digital PDFs are unaffected because
  anydoc reads from local disk. The user has accepted this for now.
- Gemini cost is unbounded per user. A rate limit belongs with the public API
  endpoint in Plan 6.
- Task 9 imports from `apps/api/src` across the workspace boundary. This
  follows the existing worker's pattern of reaching into shared code, but if
  it proves awkward, `persistExtraction` and `default-format` are the two
  things that would move into a shared package.
