import type { FieldMapping } from "drizzle";

/**
 * The out-of-the-box format for new accounts, so onboarding does not start at
 * an empty builder.
 *
 * Field semantics follow EN 16931 / UBL — the European standard invoice
 * model that most real invoicing systems implement — rather than an invented
 * shape. That means the fields are already well defined, cover the large
 * majority of real invoices, and map cleanly onto the core columns.
 *
 * This doubles as the JSON Schema handed to the LLM for structured output.
 */
export const DEFAULT_INVOICE_SCHEMA = {
  type: "object",
  title: "Standard Invoice",
  properties: {
    vendor: {
      type: "object",
      description: "The party issuing the invoice (the seller).",
      properties: {
        name: { type: "string", description: "Legal name of the seller" },
        taxId: {
          type: "string",
          description: "VAT/GST/tax registration number",
        },
        email: { type: "string" },
        address: { type: "string" },
      },
      required: ["name"],
    },
    buyer: {
      type: "object",
      description: "The party being billed.",
      properties: {
        name: { type: "string" },
        address: { type: "string" },
        taxId: { type: "string" },
      },
    },
    invoiceNumber: {
      type: "string",
      description: "The seller's unique invoice identifier",
    },
    poNumber: {
      type: "string",
      description: "Buyer's purchase order reference, if quoted",
    },
    issueDate: { type: "string", format: "date", description: "YYYY-MM-DD" },
    dueDate: { type: "string", format: "date", description: "YYYY-MM-DD" },
    currency: {
      type: "string",
      description: "ISO 4217 code, e.g. USD, EUR, JPY",
      minLength: 3,
      maxLength: 3,
    },
    lineItems: {
      type: "array",
      description: "Billed lines in the order they appear on the document.",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          lineTotal: {
            type: "number",
            description: "As printed on the invoice, not recomputed",
          },
          taxRate: { type: "number", description: "Percentage, e.g. 20 for 20%" },
        },
      },
    },
    subtotal: { type: "number", description: "Total before tax and discount" },
    taxTotal: { type: "number" },
    discount: { type: "number" },
    total: { type: "number", description: "Final amount payable" },
    paymentTerms: {
      type: "string",
      description: "e.g. 'Net 30', 'Due on receipt'",
    },
  },
  required: ["vendor", "total", "currency"],
} as const;

/**
 * Maps schema fields onto core invoice columns. Anything absent here falls
 * through to invoices.data, where the GIN index keeps it queryable.
 */
export const DEFAULT_FIELD_MAPPING: FieldMapping = {
  "vendor.name": "vendorName",
  "vendor.taxId": "vendorTaxId",
  "vendor.email": "vendorEmail",
  "vendor.address": "vendorAddress",
  invoiceNumber: "invoiceNumber",
  poNumber: "poNumber",
  issueDate: "issueDate",
  dueDate: "dueDate",
  currency: "currency",
  subtotal: "subtotal",
  taxTotal: "taxTotal",
  discount: "discount",
  total: "total",
  paymentTerms: "paymentTerms",
  lineItems: "lineItems",
  // buyer.* is intentionally unmapped: the buyer is the account holder, held
  // in preferences. Keeping the extracted value in data allows verification
  // that the invoice was actually addressed to them.
  "buyer.name": null,
  "buyer.address": null,
  "buyer.taxId": null,
};

export const DEFAULT_FORMAT_NAME = "Standard Invoice (EN 16931)";

export const DEFAULT_FORMAT_DESCRIPTION =
  "General-purpose format based on the EN 16931 / UBL semantic model. Covers most commercial invoices; clone it to add custom fields.";
