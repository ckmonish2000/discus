import {
  db,
  invoiceFormats,
  type Executor,
  type FieldMapping,
} from "drizzle";
import { eq, and, desc, ne } from "drizzle-orm";

/**
 * `fieldMapping` is the Drizzle column type rather than a looser
 * Record<string, string | null>: the values must be core field names, and
 * widening them here would let an invalid mapping reach the database.
 */
export type FormatInsert = {
  userId: string;
  name: string;
  description: string | null;
  schema: Record<string, unknown>;
  fieldMapping: FieldMapping;
  isDefault: boolean;
};

export type FormatUpdate = Partial<Omit<FormatInsert, "userId">>;

const scoped = (userId: string, id: string) =>
  and(eq(invoiceFormats.id, id), eq(invoiceFormats.userId, userId));

export const formatsRepository = {
  /** Default first, then newest. */
  async list(userId: string, ex: Executor = db) {
    return ex
      .select()
      .from(invoiceFormats)
      .where(eq(invoiceFormats.userId, userId))
      .orderBy(desc(invoiceFormats.isDefault), desc(invoiceFormats.createdAt));
  },

  async findById(id: string, userId: string, ex: Executor = db) {
    const [format] = await ex
      .select()
      .from(invoiceFormats)
      .where(scoped(userId, id))
      .limit(1);

    return format;
  },

  async findDefault(userId: string, ex: Executor = db) {
    const [format] = await ex
      .select()
      .from(invoiceFormats)
      .where(
        and(
          eq(invoiceFormats.userId, userId),
          eq(invoiceFormats.isDefault, true),
        ),
      )
      .limit(1);

    return format;
  },

  /**
   * Clears any existing default so the partial unique index is never violated.
   * `exceptId` spares the row that is itself becoming the default.
   */
  async clearDefaults(userId: string, exceptId?: string, ex: Executor = db) {
    await ex
      .update(invoiceFormats)
      .set({ isDefault: false })
      .where(
        exceptId
          ? and(
              eq(invoiceFormats.userId, userId),
              eq(invoiceFormats.isDefault, true),
              ne(invoiceFormats.id, exceptId),
            )
          : and(
              eq(invoiceFormats.userId, userId),
              eq(invoiceFormats.isDefault, true),
            ),
      );
  },

  async create(values: FormatInsert, ex: Executor = db) {
    const [format] = await ex.insert(invoiceFormats).values(values).returning();
    return format;
  },

  async update(
    id: string,
    userId: string,
    values: FormatUpdate,
    ex: Executor = db,
  ) {
    const [format] = await ex
      .update(invoiceFormats)
      .set({ ...values, updatedAt: new Date() })
      .where(scoped(userId, id))
      .returning();

    return format;
  },

  async remove(id: string, userId: string, ex: Executor = db) {
    const [format] = await ex
      .delete(invoiceFormats)
      .where(scoped(userId, id))
      .returning({ id: invoiceFormats.id });

    return format;
  },
};
