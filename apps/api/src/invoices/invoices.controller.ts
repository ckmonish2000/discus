import { Hono } from "hono";
import { z } from "zod";
import { db, invoices, lineItems, vendors } from "drizzle";
import { eq, and, desc, sql, gte, lte, type SQL } from "drizzle-orm";
import { validate, toMinorUnits, AppError } from "common";
import {
  requireAuthOrApiKey,
  getUserId,
} from "../auth/middleware/auth.middleware";
import {
  paginationSchema,
  requireOwned,
  ok,
  okList,
} from "../shared/crud.helpers";
import { serializeInvoice, serializeLineItem } from "../shared/serializers";

/**
 * Amounts arrive as decimals (19.99) and are converted to minor units on the
 * way in, so the currency must be known before any amount is parsed.
 */
const lineItemSchema = z.object({
  description: z.string().max(2000).nullish(),
  quantity: z.number().nullish(),
  unitPrice: z.number().nullish(),
  lineTotal: z.number().nullish(),
  taxRate: z.number().min(0).max(100).nullish(),
});

const createInvoiceSchema = z.object({
  vendorId: z.string().uuid().nullish(),
  documentId: z.string().uuid().nullish(),
  invoiceNumber: z.string().max(200).nullish(),
  poNumber: z.string().max(200).nullish(),
  issueDate: z.string().date().nullish(),
  dueDate: z.string().date().nullish(),
  currency: z.string().length(3).default("USD"),
  subtotal: z.number().nullish(),
  taxTotal: z.number().nullish(),
  discount: z.number().nullish(),
  total: z.number().nullish(),
  status: z
    .enum(["draft", "pending", "approved", "paid", "void"])
    .default("draft"),
  paymentTerms: z.string().max(1000).nullish(),
  data: z.record(z.string(), z.unknown()).default({}),
  lineItems: z.array(lineItemSchema).default([]),
});

const updateInvoiceSchema = createInvoiceSchema.partial();

const listQuerySchema = paginationSchema.extend({
  status: z.enum(["draft", "pending", "approved", "paid", "void"]).optional(),
  vendorId: z.string().uuid().optional(),
  needsReview: z.enum(["true", "false"]).optional(),
  issuedAfter: z.string().date().optional(),
  issuedBefore: z.string().date().optional(),
});

const router = new Hono();
// Accepts a session cookie or an API key — the public invoice-creation
// endpoint and the dashboard share these routes.
router.use("*", requireAuthOrApiKey);

const toMinor = (v: number | null | undefined, currency: string) =>
  v === null || v === undefined ? null : toMinorUnits(v, currency);

/** Verifies a referenced vendor belongs to the caller before linking it. */
const assertVendorOwned = async (vendorId: string, userId: string) => {
  const [vendor] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.userId, userId)))
    .limit(1);

  if (!vendor) {
    throw new AppError("Vendor not found", 404, "assertVendorOwned");
  }
};

/** GET /invoices */
router.get("/", validate("query", listQuerySchema), async (c) => {
  const userId = getUserId(c);
  const q = c.req.valid("query");

  const filters: SQL[] = [eq(invoices.userId, userId)];
  if (q.status) filters.push(eq(invoices.status, q.status));
  if (q.vendorId) filters.push(eq(invoices.vendorId, q.vendorId));
  if (q.needsReview) {
    filters.push(eq(invoices.needsReview, q.needsReview === "true"));
  }
  if (q.issuedAfter) filters.push(gte(invoices.issueDate, q.issuedAfter));
  if (q.issuedBefore) filters.push(lte(invoices.issueDate, q.issuedBefore));

  const where = and(...filters);

  const [items, [counted]] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
      .limit(q.limit)
      .offset(q.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(invoices).where(where),
  ]);

  return c.json(
    okList(items.map(serializeInvoice), counted?.count ?? 0, {
      limit: q.limit,
      offset: q.offset,
    }),
  );
});

/** GET /invoices/:id — includes line items in document order. */
router.get("/:id", async (c) => {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.id, c.req.param("id")), eq(invoices.userId, getUserId(c))),
    )
    .limit(1);

  requireOwned(invoice, "Invoice", "getInvoice");

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, invoice!.id))
    .orderBy(lineItems.position);

  return c.json(
    ok({
      ...serializeInvoice(invoice!),
      lineItems: items.map((item) => serializeLineItem(item, invoice!.currency)),
    }),
  );
});

/** POST /invoices */
router.post("/", validate("json", createInvoiceSchema), async (c) => {
  const userId = getUserId(c);
  const body = c.req.valid("json");
  const currency = body.currency.toUpperCase();

  if (body.vendorId) await assertVendorOwned(body.vendorId, userId);

  // Invoice and its line items are written together: a half-inserted invoice
  // with missing lines would be a silently wrong financial record.
  const created = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        userId,
        vendorId: body.vendorId ?? null,
        documentId: body.documentId ?? null,
        invoiceNumber: body.invoiceNumber ?? null,
        poNumber: body.poNumber ?? null,
        issueDate: body.issueDate ?? null,
        dueDate: body.dueDate ?? null,
        currency,
        subtotalMinor: toMinor(body.subtotal, currency),
        taxTotalMinor: toMinor(body.taxTotal, currency),
        discountMinor: toMinor(body.discount, currency),
        totalMinor: toMinor(body.total, currency),
        status: body.status,
        paymentTerms: body.paymentTerms ?? null,
        data: body.data,
        source: c.get("authMethod") === "api_key" ? "api" : "dashboard",
      })
      .returning();

    if (!invoice) {
      throw new AppError("Failed to create invoice", 500, "createInvoice");
    }

    if (body.lineItems.length) {
      await tx.insert(lineItems).values(
        body.lineItems.map((item, index) => ({
          invoiceId: invoice.id,
          position: index,
          description: item.description ?? null,
          quantity: item.quantity?.toString() ?? null,
          unitPriceMinor: toMinor(item.unitPrice, currency),
          lineTotalMinor: toMinor(item.lineTotal, currency),
          taxRate: item.taxRate?.toString() ?? null,
        })),
      );
    }

    return invoice;
  });

  return c.json(ok(serializeInvoice(created)), 201);
});

/** PATCH /invoices/:id — replaces line items wholesale when provided. */
router.patch("/:id", validate("json", updateInvoiceSchema), async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
    .limit(1);

  requireOwned(existing, "Invoice", "updateInvoice");

  const currency = (body.currency ?? existing!.currency).toUpperCase();
  if (body.vendorId) await assertVendorOwned(body.vendorId, userId);

  const updated = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .update(invoices)
      .set({
        ...(body.vendorId !== undefined && { vendorId: body.vendorId }),
        ...(body.documentId !== undefined && { documentId: body.documentId }),
        ...(body.invoiceNumber !== undefined && {
          invoiceNumber: body.invoiceNumber,
        }),
        ...(body.poNumber !== undefined && { poNumber: body.poNumber }),
        ...(body.issueDate !== undefined && { issueDate: body.issueDate }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
        ...(body.currency !== undefined && { currency }),
        ...(body.subtotal !== undefined && {
          subtotalMinor: toMinor(body.subtotal, currency),
        }),
        ...(body.taxTotal !== undefined && {
          taxTotalMinor: toMinor(body.taxTotal, currency),
        }),
        ...(body.discount !== undefined && {
          discountMinor: toMinor(body.discount, currency),
        }),
        ...(body.total !== undefined && {
          totalMinor: toMinor(body.total, currency),
        }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.paymentTerms !== undefined && {
          paymentTerms: body.paymentTerms,
        }),
        ...(body.data !== undefined && { data: body.data }),
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, id), eq(invoices.userId, userId)))
      .returning();

    if (body.lineItems !== undefined) {
      await tx.delete(lineItems).where(eq(lineItems.invoiceId, id));
      if (body.lineItems.length) {
        await tx.insert(lineItems).values(
          body.lineItems.map((item, index) => ({
            invoiceId: id,
            position: index,
            description: item.description ?? null,
            quantity: item.quantity?.toString() ?? null,
            unitPriceMinor: toMinor(item.unitPrice, currency),
            lineTotalMinor: toMinor(item.lineTotal, currency),
            taxRate: item.taxRate?.toString() ?? null,
          })),
        );
      }
    }

    return invoice;
  });

  return c.json(ok(serializeInvoice(updated!)));
});

/** DELETE /invoices/:id — line items cascade. */
router.delete("/:id", async (c) => {
  const [invoice] = await db
    .delete(invoices)
    .where(
      and(eq(invoices.id, c.req.param("id")), eq(invoices.userId, getUserId(c))),
    )
    .returning({ id: invoices.id });

  requireOwned(invoice, "Invoice", "deleteInvoice");
  return c.json(ok({ deleted: true }));
});

export default router;
