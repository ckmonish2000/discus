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
 * Removes the previous extraction for this document, if any.
 *
 * Deliberately a delete rather than a "skip if one exists" check. Retry
 * exists precisely because the previous result was wrong — skipping the
 * insert would make the button do nothing and leave the bad invoice in
 * place. Re-extraction also produces a different number of line items each
 * time, which a skip has no way to reconcile.
 *
 * Only extraction-sourced rows are superseded: an invoice the user typed by
 * hand, or one created through the API, is theirs to keep even if it
 * references the same document. Line items cascade.
 *
 * Safe because the caller runs it inside a transaction — if the re-insert
 * fails, the delete rolls back with it and the old invoice survives.
 */
const supersedePreviousExtraction = (
  ex: Executor,
  userId: string,
  documentId: string,
) =>
  ex
    .delete(invoices)
    .where(
      and(
        eq(invoices.documentId, documentId),
        eq(invoices.userId, userId),
        eq(invoices.source, "extraction"),
      ),
    );

/** Inserts the invoice header and returns its id. */
const insertInvoice = async (
  ex: Executor,
  userId: string,
  documentId: string,
  vendorId: string | null,
  mapped: MappedInvoice,
  confidence: number,
): Promise<string> => {
  const [invoice] = await ex
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
      // Anything the mapping engine could not place is a human's call.
      needsReview: mapped.issues.length > 0,
    })
    .returning({ id: invoices.id });

  if (!invoice) throw new Error("Failed to insert extracted invoice");
  return invoice.id;
};

/** Inserts line items in document order. No-op when there are none. */
const insertLineItems = async (
  ex: Executor,
  invoiceId: string,
  items: MappedInvoice["lineItems"],
) => {
  if (!items.length) return;

  await ex.insert(lineItems).values(
    items.map((item) => ({
      invoiceId,
      position: item.position,
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
      taxRate: item.taxRate,
    })),
  );
};

/** Marks the document done and clears any error left by a previous attempt. */
const markDocumentCompleted = (ex: Executor, documentId: string) =>
  ex
    .update(documents)
    .set({
      status: "completed",
      processedAt: new Date(),
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId));

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
    await supersedePreviousExtraction(tx, userId, documentId);

    const vendorId = await upsertVendor(tx, userId, mapped.vendor);
    const invoiceId = await insertInvoice(
      tx,
      userId,
      documentId,
      vendorId,
      mapped,
      confidence,
    );

    await insertLineItems(tx, invoiceId, mapped.lineItems);
    await markDocumentCompleted(tx, documentId);

    return { invoiceId, vendorId };
  });
};
