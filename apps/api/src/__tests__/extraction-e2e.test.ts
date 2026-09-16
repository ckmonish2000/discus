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
