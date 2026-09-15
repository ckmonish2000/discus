import { test, expect, describe } from "bun:test";
import { buildExtractionPrompt } from "./invoice-extractor";

describe("buildExtractionPrompt", () => {
  const schema = {
    type: "object",
    properties: { total: { type: "number" } },
    required: ["total"],
  };

  test("includes the document text", () => {
    const p = buildExtractionPrompt("TOTAL DUE: 2,160.00 GBP", schema);
    expect(p).toContain("2,160.00");
  });

  test("instructs the model not to invent values", () => {
    // A hallucinated total is worse than a null one: null sets needs_review,
    // an invented number enters the books looking correct.
    const p = buildExtractionPrompt("x", schema);
    expect(p.toLowerCase()).toContain("null");
  });

  test("asks for amounts as written on the document", () => {
    const p = buildExtractionPrompt("x", schema);
    expect(p.toLowerCase()).toContain("as written");
  });
});
