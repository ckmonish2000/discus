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

  test("re-extracting the same document replaces, rather than duplicates", async () => {
    // A user pressing Retry, or BullMQ retrying after a post-commit failure,
    // would otherwise book the same payable twice — with no dedup and no way
    // for the user to merge them.
    const [doc] = await db
      .insert(documents)
      .values({
        userId,
        bucketName: "invoices",
        objectPath: `invoices/${userId}/${Math.random().toString(36).slice(2)}.pdf`,
        mimeType: "application/pdf",
      })
      .returning();

    await persistExtraction({
      userId,
      documentId: doc!.id,
      mapped: mapped(),
      confidence: 1,
    });
    const second = await persistExtraction({
      userId,
      documentId: doc!.id,
      mapped: mapped(),
      confidence: 1,
    });

    const rows = await db
      .select()
      .from(invoices)
      .where(eq(invoices.documentId, doc!.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(second.invoiceId);
  });

  test("re-extraction leaves a manually entered invoice alone", async () => {
    // Only extraction-sourced rows are superseded. An invoice the user typed
    // by hand is theirs to keep, even against the same document.
    const [doc] = await db
      .insert(documents)
      .values({
        userId,
        bucketName: "invoices",
        objectPath: `invoices/${userId}/${Math.random().toString(36).slice(2)}.pdf`,
        mimeType: "application/pdf",
      })
      .returning();

    const [manual] = await db
      .insert(invoices)
      .values({
        userId,
        documentId: doc!.id,
        currency: "GBP",
        totalMinor: 999n,
        source: "dashboard",
      })
      .returning();

    await persistExtraction({
      userId,
      documentId: doc!.id,
      mapped: mapped(),
      confidence: 1,
    });

    const [survivor] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, manual!.id));

    expect(survivor).toBeDefined();
    expect(survivor!.totalMinor).toBe(999n);
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
