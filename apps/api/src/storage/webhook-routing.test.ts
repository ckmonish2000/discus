import { test, expect, describe } from "bun:test";
import { isExtractableMimeType } from "./webhook-routing";

describe("isExtractableMimeType", () => {
  test("accepts pdf", () => {
    expect(isExtractableMimeType("application/pdf")).toBe(true);
  });

  test("accepts images, which reach OCR directly", () => {
    expect(isExtractableMimeType("image/png")).toBe(true);
    expect(isExtractableMimeType("image/jpeg")).toBe(true);
  });

  test("accepts office documents anydoc can convert", () => {
    expect(
      isExtractableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  test("rejects video, which belongs to the existing coaching pipeline", () => {
    expect(isExtractableMimeType("video/mp4")).toBe(false);
  });

  test("rejects an empty or unknown type", () => {
    expect(isExtractableMimeType("")).toBe(false);
    expect(isExtractableMimeType("application/zip")).toBe(false);
  });
});
