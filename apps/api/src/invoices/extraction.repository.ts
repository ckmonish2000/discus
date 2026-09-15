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
