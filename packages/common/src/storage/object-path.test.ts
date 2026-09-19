import { test, expect, describe } from "bun:test";
import {
  buildInvoiceObjectPath,
  parseInvoiceObjectPath,
  INVOICE_PREFIX,
} from "./object-path";

const USER = "22222222-2222-2222-2222-222222222222";

describe("buildInvoiceObjectPath", () => {
  test("puts the user id in the path", () => {
    const p = buildInvoiceObjectPath(USER, "invoice.pdf");
    expect(p).toStartWith(`${INVOICE_PREFIX}/${USER}/`);
    expect(p).toEndWith(".pdf");
  });

  test("generates a unique name per call so uploads never collide", () => {
    const a = buildInvoiceObjectPath(USER, "invoice.pdf");
    const b = buildInvoiceObjectPath(USER, "invoice.pdf");
    expect(a).not.toBe(b);
  });

  test("strips directory traversal from the supplied filename", () => {
    // A client-supplied name must never escape its own prefix.
    const p = buildInvoiceObjectPath(USER, "../../etc/passwd");
    expect(p).toStartWith(`${INVOICE_PREFIX}/${USER}/`);
    expect(p).not.toContain("..");
  });
});

describe("parseInvoiceObjectPath", () => {
  test("round-trips a built path", () => {
    const p = buildInvoiceObjectPath(USER, "invoice.pdf");
    expect(parseInvoiceObjectPath(p)?.userId).toBe(USER);
  });

  test("rejects a path with no user segment", () => {
    expect(parseInvoiceObjectPath("invoices/invoice.pdf")).toBeNull();
  });

  test("rejects a non-uuid user segment", () => {
    // Refusing to parse is what stops a crafted path from attributing an
    // upload to an arbitrary string.
    expect(parseInvoiceObjectPath("invoices/not-a-uuid/x.pdf")).toBeNull();
  });

  test("rejects a different prefix", () => {
    expect(parseInvoiceObjectPath(`other/${USER}/x.pdf`)).toBeNull();
  });

  test("rejects an empty or malformed path", () => {
    expect(parseInvoiceObjectPath("")).toBeNull();
    expect(parseInvoiceObjectPath("invoices")).toBeNull();
  });
});
