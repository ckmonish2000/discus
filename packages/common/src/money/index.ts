/**
 * Money is stored as integer minor units (cents, pence, paise) alongside an
 * ISO 4217 currency code — never as a float. Binary floating point cannot
 * represent most decimal fractions exactly, and the error compounds when
 * summing line items.
 *
 * The integer alone is meaningless: 2000 is $20.00 in USD but ¥2,000 in JPY.
 * The currency code supplies the divisor.
 */

const DEFAULT_DIVISOR = 100;

const divisorCache = new Map<string, number>();

/**
 * Returns 10 ** (decimal places for the currency), per ISO 4217.
 *
 * Intl carries ISO 4217 data via ICU, so this needs no hand-maintained table.
 * Most currencies are 2 decimals; JPY/KRW are 0, KWD/BHD are 3.
 * Unknown codes fall back to 2 rather than throwing — an invoice with an
 * unrecognised currency should be flagged for review, not crash the pipeline.
 */
export const getDivisor = (currency: string): number => {
  const code = currency.toUpperCase();
  const cached = divisorCache.get(code);
  if (cached !== undefined) return cached;

  let divisor = DEFAULT_DIVISOR;
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
    }).resolvedOptions().maximumFractionDigits;
    divisor = 10 ** (digits ?? 2);
  } catch {
    divisor = DEFAULT_DIVISOR;
  }

  divisorCache.set(code, divisor);
  return divisor;
};

/** Number of decimal places the currency uses (2 for USD, 0 for JPY). */
export const getCurrencyDecimals = (currency: string): number =>
  Math.round(Math.log10(getDivisor(currency)));

/** 19.99 USD -> 1999n. Rounds to the nearest minor unit. */
export const toMinorUnits = (amount: number, currency: string): bigint => {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`Cannot convert non-finite amount: ${amount}`);
  }
  return BigInt(Math.round(amount * getDivisor(currency)));
};

/**
 * 1999n USD -> 19.99. Lossy by nature — use only for display or for handing
 * a value to something that requires a Number. Never round-trip arithmetic
 * through this.
 */
export const fromMinorUnits = (minor: bigint, currency: string): number =>
  Number(minor) / getDivisor(currency);

/** 1999n USD -> "$19.99". Locale-aware. */
export const formatMoney = (
  minor: bigint,
  currency: string,
  locale = "en-US",
): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(fromMinorUnits(minor, currency));

/**
 * Parses an amount as written on a document into minor units.
 *
 * Extraction differs from an API integration: the text comes off a scanned
 * invoice, where "1.234,56" is European for 1234.56 and parseFloat would
 * yield 1.234 — a 1000x error. The separator convention is inferred from
 * which mark appears last.
 *
 * Returns null when the text cannot be parsed confidently, so the caller can
 * set needs_review rather than persist a guess.
 */
export const parseAmount = (
  raw: string,
  currency: string,
): bigint | null => {
  if (typeof raw !== "string") return null;

  // Strip currency symbols, codes, and whitespace; keep digits and separators.
  const cleaned = raw.replace(/[^\d.,\-]/g, "").trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  // A zero-decimal currency (JPY, KRW) has no decimal mark at all, so any
  // separator present can only be a thousands grouping mark. Treating a
  // trailing comma as a decimal point here would understate by 1000x.
  if (getCurrencyDecimals(currency) === 0) {
    const grouped = cleaned.replace(/[.,]/g, "");
    const groupedValue = Number(grouped);
    return Number.isFinite(groupedValue)
      ? toMinorUnits(groupedValue, currency)
      : null;
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalised: string;
  if (lastComma === -1 && lastDot === -1) {
    normalised = cleaned;
  } else if (lastComma > lastDot) {
    // A lone separator followed by exactly three digits ("1,234") is a
    // thousands group, not a decimal mark — the decimal case would be
    // "1,23" or "1,2345". Ambiguous by nature; this picks the far more
    // common reading.
    if (lastDot === -1 && /^-?\d{1,3}(,\d{3})+$/.test(cleaned)) {
      normalised = cleaned.replace(/,/g, "");
    } else {
      // European: "1.234,56" — comma is the decimal mark.
      normalised = cleaned.replace(/\./g, "").replace(",", ".");
    }
  } else {
    // Anglo: "1,234.56" — dot is the decimal mark.
    normalised = cleaned.replace(/,/g, "");
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;

  return toMinorUnits(value, currency);
};
