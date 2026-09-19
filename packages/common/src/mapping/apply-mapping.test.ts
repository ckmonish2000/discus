import { test, expect, describe } from "bun:test";
import { applyMapping, getByPath } from "./apply-mapping";

const EN16931_MAPPING = {
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
} as const;

const ACME = {
  vendor: { name: "Acme Supplies Ltd", taxId: "GB123456789" },
  invoiceNumber: "INV-2026-001",
  issueDate: "2026-09-01",
  currency: "GBP",
  subtotal: 1800,
  taxTotal: 360,
  total: 2160,
  costCentre: "ENG-42",
  lineItems: [
    { description: "Consulting hours", quantity: 10, unitPrice: 150, lineTotal: 1500 },
  ],
};

describe("getByPath", () => {
  test("reads a nested value", () => {
    expect(getByPath({ a: { b: "x" } }, "a.b")).toBe("x");
  });

  test("returns undefined for a missing path rather than throwing", () => {
    expect(getByPath({ a: {} }, "a.b.c")).toBeUndefined();
  });
});

describe("applyMapping — core fields", () => {
  test("routes mapped fields to the vendor and invoice", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.vendor.name).toBe("Acme Supplies Ltd");
    expect(m.vendor.taxId).toBe("GB123456789");
    expect(m.invoice.invoiceNumber).toBe("INV-2026-001");
    expect(m.invoice.issueDate).toBe("2026-09-01");
  });

  test("converts money to minor units in the invoice's currency", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.invoice.currency).toBe("GBP");
    expect(m.invoice.totalMinor).toBe(216000n);
    expect(m.invoice.subtotalMinor).toBe(180000n);
  });

  test("a zero-decimal currency is not divided by 100", () => {
    // Currency must be resolved before amounts. If it were not, 5000 JPY
    // would be stored as 50 — a 100x error, not a rounding one.
    const m = applyMapping(
      { ...ACME, currency: "JPY", total: 5000 },
      EN16931_MAPPING,
    );
    expect(m.invoice.totalMinor).toBe(5000n);
  });

  test("unmapped fields fall through to data", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.data.costCentre).toBe("ENG-42");
    expect(m.invoice).not.toHaveProperty("costCentre");
  });

  test("maps line items with their document order preserved", () => {
    const m = applyMapping(ACME, EN16931_MAPPING);
    expect(m.lineItems).toHaveLength(1);
    expect(m.lineItems[0]!.position).toBe(0);
    expect(m.lineItems[0]!.description).toBe("Consulting hours");
    expect(m.lineItems[0]!.lineTotalMinor).toBe(150000n);
  });

  test("a differently shaped format produces the same core columns", () => {
    // The property that makes cross-user queries possible: Bob's German
    // fields land in the same typed columns as Acme's English ones.
    const bob = {
      lieferant: { name: "Müller GmbH" },
      gesamt: 2400,
      waehrung: "EUR",
      lieferschein: "LS-9982",
    };
    const m = applyMapping(bob, {
      "lieferant.name": "vendorName",
      gesamt: "total",
      waehrung: "currency",
      lieferschein: null,
    });

    expect(m.vendor.name).toBe("Müller GmbH");
    expect(m.invoice.totalMinor).toBe(240000n);
    expect(m.data.lieferschein).toBe("LS-9982");
  });

  test("defaults to USD and records an issue when no currency is mapped", () => {
    const m = applyMapping({ total: 10 }, { total: "total" });
    expect(m.invoice.currency).toBe("USD");
    expect(m.issues.join(" ")).toContain("currency");
  });

  test("unmapped sub-fields of a partially mapped object survive into data", () => {
    // vendor.name is mapped; email and phone are not. Dropping them would be
    // silent data loss — Task 6 persists `data`, so what is missing here never
    // reaches the database.
    const m = applyMapping(
      {
        vendor: { name: "Acme", email: "ar@acme.test", phone: "555" },
        total: 10,
        currency: "USD",
      },
      { "vendor.name": "vendorName", total: "total", currency: "currency" },
    );

    expect(m.vendor.name).toBe("Acme");
    expect(m.data).toEqual({ vendor: { email: "ar@acme.test", phone: "555" } });
  });

  test("a fully mapped object leaves no empty shell in data", () => {
    const m = applyMapping(
      { vendor: { name: "Acme" }, total: 10, currency: "USD" },
      { "vendor.name": "vendorName", total: "total", currency: "currency" },
    );
    expect(m.data).toEqual({});
  });
});

describe("applyMapping — ambiguity", () => {
  test("leaves an unparseable amount null and records an issue", () => {
    const m = applyMapping(
      { ...ACME, total: "N/A" },
      EN16931_MAPPING,
    );
    expect(m.invoice.totalMinor).toBeNull();
    expect(m.issues.some((i) => i.includes("total"))).toBe(true);
  });

  test("parses a european decimal written as a string", () => {
    // parseFloat("1.234,56") is 1.234 — a 1000x error this guards against.
    const m = applyMapping(
      { ...ACME, currency: "EUR", total: "1.234,56" },
      EN16931_MAPPING,
    );
    expect(m.invoice.totalMinor).toBe(123456n);
  });

  test("leaves an unparseable date null and records an issue", () => {
    const m = applyMapping({ ...ACME, issueDate: "last tuesday" }, EN16931_MAPPING);
    expect(m.invoice.issueDate).toBeNull();
    expect(m.issues.some((i) => i.includes("issueDate"))).toBe(true);
  });

  test("an empty extraction produces issues rather than throwing", () => {
    const m = applyMapping({}, EN16931_MAPPING);
    expect(m.issues.length).toBeGreaterThan(0);
    expect(m.vendor.name).toBeNull();
  });
});
