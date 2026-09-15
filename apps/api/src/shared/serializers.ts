import { fromMinorUnits } from "common";

/**
 * Money is stored as BigInt minor units, which JSON.stringify cannot
 * serialize. Every response carrying money goes through here, so the
 * conversion lives at the API boundary rather than in each handler.
 *
 * Amounts are returned as decimals in the invoice's own currency: a client
 * sees 19.99, not 1999, and never has to know the divisor.
 */

type MoneyFields<T> = { [K in keyof T]: T[K] };

const toDecimal = (
  minor: bigint | null | undefined,
  currency: string,
): number | null =>
  minor === null || minor === undefined ? null : fromMinorUnits(minor, currency);

export const serializeInvoice = <
  T extends {
    currency: string;
    subtotalMinor?: bigint | null;
    taxTotalMinor?: bigint | null;
    discountMinor?: bigint | null;
    totalMinor?: bigint | null;
  },
>(
  invoice: T,
) => {
  const {
    subtotalMinor,
    taxTotalMinor,
    discountMinor,
    totalMinor,
    ...rest
  } = invoice;

  return {
    ...(rest as Omit<
      MoneyFields<T>,
      "subtotalMinor" | "taxTotalMinor" | "discountMinor" | "totalMinor"
    >),
    currency: invoice.currency,
    subtotal: toDecimal(subtotalMinor, invoice.currency),
    taxTotal: toDecimal(taxTotalMinor, invoice.currency),
    discount: toDecimal(discountMinor, invoice.currency),
    total: toDecimal(totalMinor, invoice.currency),
  };
};

export const serializeLineItem = <
  T extends {
    unitPriceMinor?: bigint | null;
    lineTotalMinor?: bigint | null;
    quantity?: string | null;
    taxRate?: string | null;
  },
>(
  item: T,
  currency: string,
) => {
  const { unitPriceMinor, lineTotalMinor, quantity, taxRate, ...rest } = item;

  return {
    ...rest,
    // numeric columns come back from pg as strings to preserve precision.
    quantity: quantity === null || quantity === undefined ? null : Number(quantity),
    taxRate: taxRate === null || taxRate === undefined ? null : Number(taxRate),
    unitPrice: toDecimal(unitPriceMinor, currency),
    lineTotal: toDecimal(lineTotalMinor, currency),
  };
};

/** documents.size_bytes is also BigInt. */
export const serializeDocument = <T extends { sizeBytes?: bigint | null }>(
  doc: T,
) => ({
  ...doc,
  sizeBytes:
    doc.sizeBytes === null || doc.sizeBytes === undefined
      ? null
      : Number(doc.sizeBytes),
});
