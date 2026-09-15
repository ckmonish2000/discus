import { parseAmount, toMinorUnits } from "../money";

export type MappedVendor = {
  name: string | null;
  taxId: string | null;
  email: string | null;
  address: string | null;
};

export type MappedInvoiceFields = {
  invoiceNumber: string | null;
  poNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotalMinor: bigint | null;
  taxTotalMinor: bigint | null;
  discountMinor: bigint | null;
  totalMinor: bigint | null;
  paymentTerms: string | null;
};

export type MappedLineItem = {
  position: number;
  description: string | null;
  quantity: string | null;
  unitPriceMinor: bigint | null;
  lineTotalMinor: bigint | null;
  taxRate: string | null;
};

export type MappedInvoice = {
  vendor: MappedVendor;
  invoice: MappedInvoiceFields;
  lineItems: MappedLineItem[];
  data: Record<string, unknown>;
  issues: string[];
};

/** Reads "vendor.name" out of a nested object, undefined if absent. */
export const getByPath = (
  obj: Record<string, unknown>,
  path: string,
): unknown =>
  path.split(".").reduce<unknown>(
    (acc, key) =>
      acc && typeof acc === "object"
        ? (acc as Record<string, unknown>)[key]
        : undefined,
    obj,
  );

const MONEY_FIELDS = ["subtotal", "taxTotal", "discount", "total"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const asText = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

/**
 * Amounts may arrive as numbers or as strings written in any locale, so a
 * string goes through parseAmount rather than Number(): parseFloat("1.234,56")
 * yields 1.234, a 1000x error on a real invoice.
 */
const asMoney = (
  v: unknown,
  currency: string,
  field: string,
  issues: string[],
): bigint | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return toMinorUnits(v, currency);
  }
  const parsed = parseAmount(String(v), currency);
  if (parsed === null) {
    issues.push(`Could not read an amount for ${field}: ${JSON.stringify(v)}`);
  }
  return parsed;
};

const asDate = (
  v: unknown,
  field: string,
  issues: string[],
): string | null => {
  const text = asText(v);
  if (text === null) return null;
  if (ISO_DATE.test(text)) return text;

  const d = new Date(text);
  if (Number.isNaN(d.getTime())) {
    issues.push(`Could not read a date for ${field}: ${JSON.stringify(v)}`);
    return null;
  }
  return d.toISOString().slice(0, 10);
};

/**
 * Routes an extracted object onto the core columns, leaving anything without
 * a mapping in `data`.
 *
 * Nothing here touches the database or the network, so the web app can call
 * it to preview a format before anything is saved.
 */
export const applyMapping = (
  extracted: Record<string, unknown>,
  fieldMapping: Record<string, string | null>,
): MappedInvoice => {
  const issues: string[] = [];

  // Invert the mapping so a core field can be looked up by name.
  const pathFor = new Map<string, string>();
  for (const [path, core] of Object.entries(fieldMapping)) {
    if (core) pathFor.set(core, path);
  }

  const read = (core: string): unknown => {
    const path = pathFor.get(core);
    return path ? getByPath(extracted, path) : undefined;
  };

  // Currency first: every amount below needs its divisor.
  const rawCurrency = asText(read("currency"));
  let currency = "USD";
  if (rawCurrency && /^[A-Za-z]{3}$/.test(rawCurrency)) {
    currency = rawCurrency.toUpperCase();
  } else {
    issues.push(
      rawCurrency
        ? `Unrecognised currency ${JSON.stringify(rawCurrency)}, defaulted to USD`
        : "No currency found, defaulted to USD",
    );
  }

  const vendor: MappedVendor = {
    name: asText(read("vendorName")),
    taxId: asText(read("vendorTaxId")),
    email: asText(read("vendorEmail")),
    address: asText(read("vendorAddress")),
  };
  if (!vendor.name) issues.push("No vendor name found");

  const money: Record<string, bigint | null> = {};
  for (const field of MONEY_FIELDS) {
    money[field] = asMoney(read(field), currency, field, issues);
  }

  const invoice: MappedInvoiceFields = {
    invoiceNumber: asText(read("invoiceNumber")),
    poNumber: asText(read("poNumber")),
    issueDate: asDate(read("issueDate"), "issueDate", issues),
    dueDate: asDate(read("dueDate"), "dueDate", issues),
    currency,
    subtotalMinor: money.subtotal ?? null,
    taxTotalMinor: money.taxTotal ?? null,
    discountMinor: money.discount ?? null,
    totalMinor: money.total ?? null,
    paymentTerms: asText(read("paymentTerms")),
  };
  if (invoice.totalMinor === null) issues.push("No invoice total found");

  const rawLines = read("lineItems");
  const lineItems: MappedLineItem[] = Array.isArray(rawLines)
    ? rawLines.map((raw, index) => {
        const item = (raw ?? {}) as Record<string, unknown>;
        return {
          position: index,
          description: asText(item.description),
          quantity:
            item.quantity === null || item.quantity === undefined
              ? null
              : String(item.quantity),
          unitPriceMinor: asMoney(
            item.unitPrice,
            currency,
            `lineItems[${index}].unitPrice`,
            issues,
          ),
          lineTotalMinor: asMoney(
            item.lineTotal,
            currency,
            `lineItems[${index}].lineTotal`,
            issues,
          ),
          taxRate:
            item.taxRate === null || item.taxRate === undefined
              ? null
              : String(item.taxRate),
        };
      })
    : [];

  // Anything the format did not map to a core column stays queryable in the
  // JSONB column rather than being dropped.
  const mappedTopLevel = new Set(
    Object.entries(fieldMapping)
      .filter(([, core]) => core !== null)
      .map(([path]) => path.split(".")[0]!),
  );
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (!mappedTopLevel.has(key)) data[key] = value;
  }

  return { vendor, invoice, lineItems, data, issues };
};
