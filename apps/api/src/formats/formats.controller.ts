import { Hono } from "hono";
import { z } from "zod";
import { db, invoiceFormats } from "drizzle";
import { eq, and, desc, ne } from "drizzle-orm";
import { validate, AppError } from "common";
import { requireAuth, getUserId } from "../auth/middleware/auth.middleware";
import { requireOwned, ok } from "../shared/crud.helpers";
import {
  DEFAULT_INVOICE_SCHEMA,
  DEFAULT_FIELD_MAPPING,
  DEFAULT_FORMAT_NAME,
  DEFAULT_FORMAT_DESCRIPTION,
} from "./default-format";

const CORE_FIELDS = [
  "invoiceNumber",
  "poNumber",
  "issueDate",
  "dueDate",
  "currency",
  "subtotal",
  "taxTotal",
  "discount",
  "total",
  "paymentTerms",
  "vendorName",
  "vendorTaxId",
  "vendorEmail",
  "vendorAddress",
  "lineItems",
] as const;

const createFormatSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  schema: z.record(z.string(), z.unknown()),
  fieldMapping: z.record(z.string(), z.enum(CORE_FIELDS).nullable()).default({}),
  isDefault: z.boolean().default(false),
});

const updateFormatSchema = createFormatSchema.partial();

const router = new Hono();
router.use("*", requireAuth);

/** Clears any existing default so the partial unique index is never violated. */
const clearOtherDefaults = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  exceptId?: string,
) => {
  await tx
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
};

/** GET /formats */
router.get("/", async (c) => {
  const items = await db
    .select()
    .from(invoiceFormats)
    .where(eq(invoiceFormats.userId, getUserId(c)))
    .orderBy(desc(invoiceFormats.isDefault), desc(invoiceFormats.createdAt));

  return c.json(ok(items));
});

/**
 * GET /formats/template — the built-in starting point.
 *
 * Unauthenticated-safe in the sense that it is identical for everyone; it is
 * behind requireAuth only because the whole router is.
 */
router.get("/template", (c) =>
  c.json(
    ok({
      name: DEFAULT_FORMAT_NAME,
      description: DEFAULT_FORMAT_DESCRIPTION,
      schema: DEFAULT_INVOICE_SCHEMA,
      fieldMapping: DEFAULT_FIELD_MAPPING,
    }),
  ),
);

/** GET /formats/:id */
router.get("/:id", async (c) => {
  const [format] = await db
    .select()
    .from(invoiceFormats)
    .where(
      and(
        eq(invoiceFormats.id, c.req.param("id")),
        eq(invoiceFormats.userId, getUserId(c)),
      ),
    )
    .limit(1);

  return c.json(ok(requireOwned(format, "Format", "getFormat")));
});

/** POST /formats */
router.post("/", validate("json", createFormatSchema), async (c) => {
  const userId = getUserId(c);
  const body = c.req.valid("json");

  const created = await db.transaction(async (tx) => {
    if (body.isDefault) await clearOtherDefaults(tx, userId);

    const [format] = await tx
      .insert(invoiceFormats)
      .values({
        userId,
        name: body.name,
        description: body.description ?? null,
        schema: body.schema,
        fieldMapping: body.fieldMapping,
        isDefault: body.isDefault,
      })
      .returning();

    return format;
  });

  if (!created) {
    throw new AppError("Failed to create format", 500, "createFormat");
  }

  return c.json(ok(created), 201);
});

/**
 * POST /formats/seed-default — installs the EN 16931 template for a new
 * account. Idempotent: returns the existing default if one is already set.
 */
router.post("/seed-default", async (c) => {
  const userId = getUserId(c);

  const [existing] = await db
    .select()
    .from(invoiceFormats)
    .where(
      and(eq(invoiceFormats.userId, userId), eq(invoiceFormats.isDefault, true)),
    )
    .limit(1);

  if (existing) return c.json(ok(existing));

  const [format] = await db
    .insert(invoiceFormats)
    .values({
      userId,
      name: DEFAULT_FORMAT_NAME,
      description: DEFAULT_FORMAT_DESCRIPTION,
      schema: DEFAULT_INVOICE_SCHEMA as unknown as Record<string, unknown>,
      fieldMapping: DEFAULT_FIELD_MAPPING,
      isDefault: true,
    })
    .returning();

  return c.json(ok(format), 201);
});

/** PATCH /formats/:id */
router.patch("/:id", validate("json", updateFormatSchema), async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updated = await db.transaction(async (tx) => {
    if (body.isDefault) await clearOtherDefaults(tx, userId, id);

    const [format] = await tx
      .update(invoiceFormats)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.schema !== undefined && { schema: body.schema }),
        ...(body.fieldMapping !== undefined && {
          fieldMapping: body.fieldMapping,
        }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
        updatedAt: new Date(),
      })
      .where(
        and(eq(invoiceFormats.id, id), eq(invoiceFormats.userId, userId)),
      )
      .returning();

    return format;
  });

  return c.json(ok(requireOwned(updated, "Format", "updateFormat")));
});

/** DELETE /formats/:id */
router.delete("/:id", async (c) => {
  const [format] = await db
    .delete(invoiceFormats)
    .where(
      and(
        eq(invoiceFormats.id, c.req.param("id")),
        eq(invoiceFormats.userId, getUserId(c)),
      ),
    )
    .returning({ id: invoiceFormats.id });

  requireOwned(format, "Format", "deleteFormat");
  return c.json(ok({ deleted: true }));
});

export default router;
