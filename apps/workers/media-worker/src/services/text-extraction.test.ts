import { test, expect, describe } from "bun:test";
import { extractText } from "./text-extraction.service";

/**
 * anydoc is a document converter, not an OCR engine. It throws
 * `code: "needsOcr"` on a scanned PDF and `code: "unsupported"` on an image;
 * both must route to the OCR fallback rather than fail the document.
 */
const throwing = (code: string) => {
  const err = new Error(`anydoc: ${code}`) as Error & { code: string };
  err.code = code;
  throw err;
};

describe("extractText", () => {
  test("uses the OCR fallback for an image, without calling anydoc", async () => {
    let ocrCalled = false;
    const result = await extractText("/tmp/scan.png", "image/png", async () => {
      ocrCalled = true;
      return "text from ocr";
    });

    expect(ocrCalled).toBe(true);
    expect(result.source).toBe("ocr");
    expect(result.text).toBe("text from ocr");
  });

  test("falls back to OCR when anydoc reports needsOcr", async () => {
    const result = await extractText(
      "/tmp/scanned.pdf",
      "application/pdf",
      async () => "ocr text",
      async () => throwing("needsOcr"),
    );
    expect(result.source).toBe("ocr");
  });

  test("falls back to OCR when anydoc reports unsupported", async () => {
    const result = await extractText(
      "/tmp/weird.pdf",
      "application/pdf",
      async () => "ocr text",
      async () => throwing("unsupported"),
    );
    expect(result.source).toBe("ocr");
  });

  test("returns anydoc output for a digital pdf", async () => {
    const result = await extractText(
      "/tmp/digital.pdf",
      "application/pdf",
      async () => "should not be used",
      async () => "# INVOICE\n\n|Item|Total|\n|---|---|",
    );
    expect(result.source).toBe("anydoc");
    expect(result.text).toContain("INVOICE");
  });

  test("propagates an unexpected anydoc error instead of masking it as OCR", async () => {
    // A disk error is not a "needs OCR" condition; silently falling back
    // would turn a bug into a slow, expensive, wrong success.
    await expect(
      extractText(
        "/tmp/x.pdf",
        "application/pdf",
        async () => "ocr",
        async () => throwing("io"),
      ),
    ).rejects.toThrow();
  });
});
