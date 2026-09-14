import { Hono } from "hono";
import { z } from "zod";
import { db, vendors } from "drizzle";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { validate, AppError } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import {
  paginationSchema,
  requireOwned,
  ok,
  okList,
} from "../shared/crud.helpers";

const bankDetailsSchema = z
  .object({
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    iban: z.string().optional(),
    swift: z.string().optional(),
    bankName: z.string().optional(),
    routingNumber: z.string().optional(),
  })
  .optional();

const createVendorSchema = z.object({
  name: z.string().min(1).max(500),
  taxId: z.string().max(100).nullish(),
  email: z.email().nullish(),
  phone: z.string().max(50).nullish(),
  address: z.string().max(2000).nullish(),
  bankDetails: bankDetailsSchema,
});

const updateVendorSchema = createVendorSchema.partial();

const listQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
});

const router = new Hono();
router.use("*", requireAuth);

/** GET /vendors */
router.get("/", validate("query", listQuerySchema), async (c) => {
  const userId = getUserId(c);
  const { limit, offset, search } = c.req.valid("query");

  const where = search
    ? and(eq(vendors.userId, userId), ilike(vendors.name, `%${search}%`))
    : eq(vendors.userId, userId);

  const [items, [counted]] = await Promise.all([
    db
      .select()
      .from(vendors)
      .where(where)
      .orderBy(desc(vendors.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(vendors).where(where),
  ]);

  return c.json(okList(items, counted?.count ?? 0, { limit, offset }));
});

/** GET /vendors/:id */
router.get("/:id", async (c) => {
  const [vendor] = await db
    .select()
    .from(vendors)
    .where(
      and(eq(vendors.id, c.req.param("id")), eq(vendors.userId, getUserId(c))),
    )
    .limit(1);

  return c.json(ok(requireOwned(vendor, "Vendor", "getVendor")));
});

/** POST /vendors */
router.post("/", validate("json", createVendorSchema), async (c) => {
  const userId = getUserId(c);
  const body = c.req.valid("json");

  const [vendor] = await db
    .insert(vendors)
    .values({ ...body, userId })
    .onConflictDoNothing()
    .returning();

  // The unique index is on (user_id, lower(name), coalesce(tax_id,'')), so a
  // conflict means this vendor already exists for this user.
  if (!vendor) {
    throw new AppError(
      "A vendor with that name and tax id already exists",
      409,
      "createVendor",
    );
  }

  return c.json(ok(vendor), 201);
});

/** PATCH /vendors/:id */
router.patch("/:id", validate("json", updateVendorSchema), async (c) => {
  const body = c.req.valid("json");

  const [vendor] = await db
    .update(vendors)
    .set({ ...body, updatedAt: new Date() })
    .where(
      and(eq(vendors.id, c.req.param("id")), eq(vendors.userId, getUserId(c))),
    )
    .returning();

  return c.json(ok(requireOwned(vendor, "Vendor", "updateVendor")));
});

/** DELETE /vendors/:id — invoices keep their history via ON DELETE SET NULL. */
router.delete("/:id", async (c) => {
  const [vendor] = await db
    .delete(vendors)
    .where(
      and(eq(vendors.id, c.req.param("id")), eq(vendors.userId, getUserId(c))),
    )
    .returning({ id: vendors.id });

  requireOwned(vendor, "Vendor", "deleteVendor");
  return c.json(ok({ deleted: true }));
});

export default router;
