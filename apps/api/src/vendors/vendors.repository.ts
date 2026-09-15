import { db, vendors, type Executor } from "drizzle";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import type { CreateVendorDto, ListVendorsDto, UpdateVendorDto } from "common";

const scoped = (userId: string, id: string) =>
  and(eq(vendors.id, id), eq(vendors.userId, userId));

export const vendorsRepository = {
  async list(userId: string, q: ListVendorsDto, ex: Executor = db) {
    const where = q.search
      ? and(eq(vendors.userId, userId), ilike(vendors.name, `%${q.search}%`))
      : eq(vendors.userId, userId);

    const [items, [counted]] = await Promise.all([
      ex
        .select()
        .from(vendors)
        .where(where)
        .orderBy(desc(vendors.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      ex
        .select({ count: sql<number>`count(*)::int` })
        .from(vendors)
        .where(where),
    ]);

    return { items, total: counted?.count ?? 0 };
  },

  async findById(id: string, userId: string, ex: Executor = db) {
    const [vendor] = await ex
      .select()
      .from(vendors)
      .where(scoped(userId, id))
      .limit(1);

    return vendor;
  },

  /** Id-only existence check, used when linking a vendor to an invoice. */
  async existsForUser(id: string, userId: string, ex: Executor = db) {
    const [vendor] = await ex
      .select({ id: vendors.id })
      .from(vendors)
      .where(scoped(userId, id))
      .limit(1);

    return Boolean(vendor);
  },

  /**
   * Returns undefined on conflict rather than throwing. The unique index is on
   * (user_id, lower(name), coalesce(tax_id,'')), so a conflict means this
   * vendor already exists for this user — the service turns that into a 409.
   */
  async create(userId: string, values: CreateVendorDto, ex: Executor = db) {
    const [vendor] = await ex
      .insert(vendors)
      .values({ ...values, userId })
      .onConflictDoNothing()
      .returning();

    return vendor;
  },

  async update(
    id: string,
    userId: string,
    values: UpdateVendorDto,
    ex: Executor = db,
  ) {
    const [vendor] = await ex
      .update(vendors)
      .set({ ...values, updatedAt: new Date() })
      .where(scoped(userId, id))
      .returning();

    return vendor;
  },

  /** Invoices keep their history via ON DELETE SET NULL. */
  async remove(id: string, userId: string, ex: Executor = db) {
    const [vendor] = await ex
      .delete(vendors)
      .where(scoped(userId, id))
      .returning({ id: vendors.id });

    return vendor;
  },
};
