import { test, expect, describe } from "bun:test";
import {
  getDivisor,
  getCurrencyDecimals,
  toMinorUnits,
  fromMinorUnits,
  formatMoney,
  parseAmount,
} from "./index";

describe("getDivisor", () => {
  test("two-decimal currencies", () => {
    expect(getDivisor("USD")).toBe(100);
    expect(getDivisor("EUR")).toBe(100);
    expect(getDivisor("GBP")).toBe(100);
    expect(getDivisor("INR")).toBe(100);
  });

  test("zero-decimal currencies", () => {
    expect(getDivisor("JPY")).toBe(1);
    expect(getDivisor("KRW")).toBe(1);
  });

  test("three-decimal currencies", () => {
    expect(getDivisor("KWD")).toBe(1000);
    expect(getDivisor("BHD")).toBe(1000);
  });

  test("is case insensitive", () => {
    expect(getDivisor("usd")).toBe(getDivisor("USD"));
    expect(getDivisor("jpy")).toBe(getDivisor("JPY"));
  });

  test("falls back to 2 decimals for unknown codes rather than throwing", () => {
    expect(getDivisor("ZZZ")).toBe(100);
  });
});

describe("getCurrencyDecimals", () => {
  test("derives decimal count from the divisor", () => {
    expect(getCurrencyDecimals("USD")).toBe(2);
    expect(getCurrencyDecimals("JPY")).toBe(0);
    expect(getCurrencyDecimals("KWD")).toBe(3);
  });
});

describe("toMinorUnits", () => {
  test("converts by currency, not a fixed 100", () => {
    expect(toMinorUnits(19.99, "USD")).toBe(1999n);
    expect(toMinorUnits(2000, "JPY")).toBe(2000n);
    expect(toMinorUnits(1.999, "KWD")).toBe(1999n);
  });

  test("the same amount differs across currencies", () => {
    expect(toMinorUnits(20, "USD")).toBe(2000n);
    expect(toMinorUnits(20, "JPY")).toBe(20n);
  });

  test("rounds to nearest minor unit", () => {
    expect(toMinorUnits(19.994, "USD")).toBe(1999n);
    expect(toMinorUnits(19.995, "USD")).toBe(2000n);
  });

  test("handles negative amounts (credit notes)", () => {
    expect(toMinorUnits(-19.99, "USD")).toBe(-1999n);
  });

  test("rejects non-finite input", () => {
    expect(() => toMinorUnits(NaN, "USD")).toThrow();
    expect(() => toMinorUnits(Infinity, "USD")).toThrow();
  });

  test("avoids the float accumulation error", () => {
    // 0.1 + 0.2 !== 0.3 in binary float; summing minor units is exact.
    const sum = toMinorUnits(0.1, "USD") + toMinorUnits(0.2, "USD");
    expect(sum).toBe(30n);
    expect(fromMinorUnits(sum, "USD")).toBe(0.3);
  });

  test("500 line items sum without drift", () => {
    let total = 0n;
    for (let i = 0; i < 500; i++) total += toMinorUnits(0.07, "USD");
    expect(total).toBe(3500n);
    expect(fromMinorUnits(total, "USD")).toBe(35);
  });
});

describe("fromMinorUnits", () => {
  test("round-trips through minor units", () => {
    for (const [amount, currency] of [
      [19.99, "USD"],
      [2000, "JPY"],
      [1.999, "KWD"],
    ] as const) {
      expect(fromMinorUnits(toMinorUnits(amount, currency), currency)).toBe(
        amount,
      );
    }
  });
});

describe("formatMoney", () => {
  test("formats with the correct decimal count", () => {
    expect(formatMoney(1999n, "USD")).toBe("$19.99");
    expect(formatMoney(2000n, "JPY")).toBe("¥2,000");
  });
});

describe("parseAmount", () => {
  test("parses anglo separators", () => {
    expect(parseAmount("1,234.56", "USD")).toBe(123456n);
    expect(parseAmount("$1,234.56", "USD")).toBe(123456n);
  });

  test("parses european separators", () => {
    // The bug this exists to prevent: parseFloat("1.234,56") === 1.234
    expect(parseAmount("1.234,56", "EUR")).toBe(123456n);
  });

  test("parses plain numbers", () => {
    expect(parseAmount("1234.56", "USD")).toBe(123456n);
    expect(parseAmount("1234", "USD")).toBe(123400n);
  });

  test("respects currency decimals", () => {
    // JPY has no decimal mark, so the comma must be a thousands separator.
    // Reading it as a decimal point would understate by 1000x.
    expect(parseAmount("5,000", "JPY")).toBe(5000n);
    expect(parseAmount("1.234", "JPY")).toBe(1234n);
  });

  test("reads a lone 3-digit group as thousands, not a decimal", () => {
    expect(parseAmount("1,234", "USD")).toBe(123400n);
    expect(parseAmount("1,234,567", "USD")).toBe(123456700n);
    // but a non-3-digit tail is a decimal mark
    expect(parseAmount("1,23", "EUR")).toBe(123n);
  });

  test("strips currency symbols and codes", () => {
    expect(parseAmount("EUR 1.234,56", "EUR")).toBe(123456n);
    expect(parseAmount("  £19.99  ", "GBP")).toBe(1999n);
  });

  test("returns null for unparseable text so callers can flag review", () => {
    expect(parseAmount("", "USD")).toBeNull();
    expect(parseAmount("N/A", "USD")).toBeNull();
    expect(parseAmount("—", "USD")).toBeNull();
  });
});
