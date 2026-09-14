import { db, lineItems, type Executor } from "drizzle";
import { eq } from "drizzle-orm";

/**
 * Line items are always reached through their invoice, so these methods scope
 * by invoiceId rather than userId — the service checks invoice ownership
 * before calling any of them.
 */

export type LineItemInsert = {
  invoiceId: string;
  position: number;
  description: string | null;
  quantity: string | null;
  unitPriceMinor: bigint | null;
  lineTotalMinor: bigint | null;
  taxRate: string | null;
};

export const lineItemsRepository = {
  /** In document order — SQL rows have no inherent order. */
  async findByInvoice(invoiceId: string, ex: Executor = db) {
    return ex
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId))
      .orderBy(lineItems.position);
  },

  async createMany(values: LineItemInsert[], ex: Executor = db) {
    if (!values.length) return [];
    return ex.insert(lineItems).values(values).returning();
  },

  async deleteByInvoice(invoiceId: string, ex: Executor = db) {
    await ex.delete(lineItems).where(eq(lineItems.invoiceId, invoiceId));
  },

  /**
   * Wholesale replacement. A PATCH carrying `lineItems` means "these are now
   * the lines", so the old set goes and the new set is written in one step —
   * the caller must already be inside a transaction.
   */
  async replaceForInvoice(
    invoiceId: string,
    values: LineItemInsert[],
    ex: Executor = db,
  ) {
    await this.deleteByInvoice(invoiceId, ex);
    return this.createMany(values, ex);
  },
};
