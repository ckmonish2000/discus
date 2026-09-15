import { db, type Executor, type Invoice, type LineItem } from "drizzle";
import {
  AppError,
  toMinorUnits,
  type CreateInvoiceDto,
  type UpdateInvoiceDto,
  type ListInvoicesDto,
  type LineItemDto,
} from "common";
import { requireOwned } from "../shared/crud.helpers";
import { vendorsRepository } from "../vendors/vendors.repository";
import { invoicesRepository } from "./invoices.repository";
import {
  lineItemsRepository,
  type LineItemInsert,
} from "./line-items.repository";

/**
 * Invoice business rules: money conversion, vendor ownership, and the
 * atomicity of an invoice and its lines. No SQL and no HTTP live here.
 */

/** Amounts cross the boundary as decimals; storage is BIGINT minor units. */
const toMinor = (v: number | null | undefined, currency: string) =>
  v === null || v === undefined ? null : toMinorUnits(v, currency);

/** Position is the array index: the client's order is the document order. */
const toLineItemRows = (
  invoiceId: string,
  items: LineItemDto[],
  currency: string,
): LineItemInsert[] =>
  items.map((item, index) => ({
    invoiceId,
    position: index,
    description: item.description ?? null,
    // numeric columns round-trip as strings to preserve precision.
    quantity: item.quantity?.toString() ?? null,
    unitPriceMinor: toMinor(item.unitPrice, currency),
    lineTotalMinor: toMinor(item.lineTotal, currency),
    taxRate: item.taxRate?.toString() ?? null,
  }));

/** A referenced vendor must belong to the caller before it can be linked. */
const assertVendorOwned = async (
  vendorId: string,
  userId: string,
  ex?: Executor,
) => {
  const owned = await vendorsRepository.existsForUser(vendorId, userId, ex);
  if (!owned) {
    throw new AppError("Vendor not found", 404, "assertVendorOwned");
  }
};

export const invoicesService = {
  list(userId: string, query: ListInvoicesDto) {
    return invoicesRepository.list(userId, query);
  },

  /** Detail view: the invoice plus its lines in document order. */
  async getById(
    id: string,
    userId: string,
  ): Promise<{ invoice: Invoice; lineItems: LineItem[] }> {
    const invoice = requireOwned(
      await invoicesRepository.findById(id, userId),
      "Invoice",
      "getInvoice",
    );

    return {
      invoice,
      lineItems: await lineItemsRepository.findByInvoice(invoice.id),
    };
  },

  /**
   * Invoice and its line items are written together: a half-inserted invoice
   * with missing lines would be a silently wrong financial record.
   */
  async create(
    userId: string,
    body: CreateInvoiceDto,
    source: Invoice["source"],
  ): Promise<Invoice> {
    const currency = body.currency.toUpperCase();

    if (body.vendorId) await assertVendorOwned(body.vendorId, userId);

    return db.transaction(async (tx) => {
      const invoice = await invoicesRepository.create(
        {
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
          source,
        },
        tx,
      );

      if (!invoice) {
        throw new AppError("Failed to create invoice", 500, "createInvoice");
      }

      await lineItemsRepository.createMany(
        toLineItemRows(invoice.id, body.lineItems, currency),
        tx,
      );

      return invoice;
    });
  },

  /**
   * Line items are replaced wholesale when the field is present, and left
   * untouched when it is absent — hence the `undefined` check rather than a
   * truthiness test, which would make `[]` a no-op instead of "clear them".
   */
  async update(
    id: string,
    userId: string,
    body: UpdateInvoiceDto,
  ): Promise<Invoice> {
    const existing = requireOwned(
      await invoicesRepository.findById(id, userId),
      "Invoice",
      "updateInvoice",
    );

    const currency = (body.currency ?? existing.currency).toUpperCase();
    if (body.vendorId) await assertVendorOwned(body.vendorId, userId);

    return db.transaction(async (tx) => {
      const invoice = await invoicesRepository.update(
        id,
        userId,
        {
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
        },
        tx,
      );

      if (!invoice) {
        throw new AppError("Failed to update invoice", 500, "updateInvoice");
      }

      if (body.lineItems !== undefined) {
        await lineItemsRepository.replaceForInvoice(
          id,
          toLineItemRows(id, body.lineItems, currency),
          tx,
        );
      }

      return invoice;
    });
  },

  async remove(id: string, userId: string): Promise<void> {
    requireOwned(
      await invoicesRepository.remove(id, userId),
      "Invoice",
      "deleteInvoice",
    );
  },
};
