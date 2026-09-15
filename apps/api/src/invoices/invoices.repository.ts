import { db, invoices, type Executor, type Invoice } from "drizzle";
import { eq, and, desc, sql, gte, lte, type SQL } from "drizzle-orm";
import type { ListInvoicesDto } from "common";

/**
 * All invoice SQL lives here. Every method takes an optional executor so the
 * service can run several of them inside one transaction; when omitted they
 * run on the pool directly.
 *
 * Every query is scoped by userId. That scoping is not optional and not a
 * caller's responsibility — an unscoped finder would be one forgotten `where`
 * away from cross-tenant data exposure.
 */

export type InvoiceInsert = {
  userId: string;
  vendorId: string | null;
  documentId: string | null;
  invoiceNumber: string | null;
  poNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotalMinor: bigint | null;
  taxTotalMinor: bigint | null;
  discountMinor: bigint | null;
  totalMinor: bigint | null;
  status: Invoice["status"];
  paymentTerms: string | null;
  data: Record<string, unknown>;
  source: Invoice["source"];
};

export type InvoiceUpdate = Partial<Omit<InvoiceInsert, "userId" | "source">>;

const scoped = (userId: string, extra: SQL[] = []) =>
  and(eq(invoices.userId, userId), ...extra);

/** Translates list filters into a WHERE clause. */
const listFilters = (userId: string, q: ListInvoicesDto) => {
  const filters: SQL[] = [];
  if (q.status) filters.push(eq(invoices.status, q.status));
  if (q.vendorId) filters.push(eq(invoices.vendorId, q.vendorId));
  if (q.needsReview) {
    filters.push(eq(invoices.needsReview, q.needsReview === "true"));
  }
  if (q.issuedAfter) filters.push(gte(invoices.issueDate, q.issuedAfter));
  if (q.issuedBefore) filters.push(lte(invoices.issueDate, q.issuedBefore));
  return scoped(userId, filters);
};

export const invoicesRepository = {
  /** Returns one page of invoices plus the total matching count. */
  async list(userId: string, q: ListInvoicesDto, ex: Executor = db) {
    const where = listFilters(userId, q);

    const [items, [counted]] = await Promise.all([
      ex
        .select()
        .from(invoices)
        .where(where)
        .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      ex
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(where),
    ]);

    return { items, total: counted?.count ?? 0 };
  },

  async findById(id: string, userId: string, ex: Executor = db) {
    const [invoice] = await ex
      .select()
      .from(invoices)
      .where(scoped(userId, [eq(invoices.id, id)]))
      .limit(1);

    return invoice;
  },

  async create(values: InvoiceInsert, ex: Executor = db) {
    const [invoice] = await ex.insert(invoices).values(values).returning();
    return invoice;
  },

  async update(
    id: string,
    userId: string,
    values: InvoiceUpdate,
    ex: Executor = db,
  ) {
    const [invoice] = await ex
      .update(invoices)
      .set({ ...values, updatedAt: new Date() })
      .where(scoped(userId, [eq(invoices.id, id)]))
      .returning();

    return invoice;
  },

  /** Line items cascade via the foreign key. */
  async remove(id: string, userId: string, ex: Executor = db) {
    const [invoice] = await ex
      .delete(invoices)
      .where(scoped(userId, [eq(invoices.id, id)]))
      .returning({ id: invoices.id });

    return invoice;
  },
};
