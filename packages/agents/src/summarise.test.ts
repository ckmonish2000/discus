import { test, expect, describe } from "bun:test";
import { summariseDocument } from "./invoice-extractor";

describe("summariseDocument without a key", () => {
  test("returns null rather than throwing", async () => {
    // GOOGLE_API_KEY is empty in this environment. A throw here would fail an
    // otherwise successful extraction over a nice-to-have field.
    const result = await summariseDocument("# INVOICE\n\nTOTAL 2,160.00 GBP");
    expect(result).toBeNull();
  });
});
