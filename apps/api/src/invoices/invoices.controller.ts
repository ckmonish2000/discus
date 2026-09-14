import { Hono } from "hono";
import {
  validate,
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoicesSchema,
} from "common";
import {
  requireAuthOrApiKey,
  getUserId,
} from "../auth/middleware/auth.middleware";
import { ok, okList } from "../shared/crud.helpers";
import { serializeInvoice, serializeLineItem } from "../shared/serializers";
import { invoicesService } from "./invoices.service";

/**
 * HTTP only: parse the request, call the service, serialize the response.
 * Business rules live in invoices.service, SQL in the repositories.
 */
const router = new Hono();
// Accepts a session cookie or an API key — the public invoice-creation
// endpoint and the dashboard share these routes.
router.use("*", requireAuthOrApiKey);

/** GET /invoices */
router.get("/", validate("query", listInvoicesSchema), async (c) => {
  const q = c.req.valid("query");
  const { items, total } = await invoicesService.list(getUserId(c), q);

  return c.json(
    okList(items.map(serializeInvoice), total, {
      limit: q.limit,
      offset: q.offset,
    }),
  );
});

/** GET /invoices/:id — includes line items in document order. */
router.get("/:id", async (c) => {
  const { invoice, lineItems } = await invoicesService.getById(
    c.req.param("id"),
    getUserId(c),
  );

  return c.json(
    ok({
      ...serializeInvoice(invoice),
      lineItems: lineItems.map((item) =>
        serializeLineItem(item, invoice.currency),
      ),
    }),
  );
});

/** POST /invoices */
router.post("/", validate("json", createInvoiceSchema), async (c) => {
  const invoice = await invoicesService.create(
    getUserId(c),
    c.req.valid("json"),
    c.get("authMethod") === "api_key" ? "api" : "dashboard",
  );

  return c.json(ok(serializeInvoice(invoice)), 201);
});

/** PATCH /invoices/:id — replaces line items wholesale when provided. */
router.patch("/:id", validate("json", updateInvoiceSchema), async (c) => {
  const invoice = await invoicesService.update(
    c.req.param("id"),
    getUserId(c),
    c.req.valid("json"),
  );

  return c.json(ok(serializeInvoice(invoice)));
});

/** DELETE /invoices/:id — line items cascade. */
router.delete("/:id", async (c) => {
  await invoicesService.remove(c.req.param("id"), getUserId(c));
  return c.json(ok({ deleted: true }));
});

export default router;
