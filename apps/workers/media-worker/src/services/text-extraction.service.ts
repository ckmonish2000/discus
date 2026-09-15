import { toMarkdown } from "@firecrawl/anydoc";

export type ExtractedText = {
  text: string;
  source: "anydoc" | "ocr";
};

/** anydoc error codes that mean "this needs OCR", not "this is broken". */
const OCR_CODES = new Set(["needsOcr", "unsupported"]);

const isOcrSignal = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  OCR_CODES.has(String((err as { code?: unknown }).code));

/**
 * Two paths, in cost order.
 *
 * A digital PDF or Office file converts locally in about 12ms and keeps the
 * document off the network entirely — which also means the Mistral fallback's
 * public-URL requirement does not apply to the common case. anydoc preserves
 * line-item tables as markdown tables, which an LLM reads far more reliably
 * than reflowed prose.
 *
 * Images never reach anydoc: it is a document converter and rejects them.
 *
 * `converter` is injectable so tests can exercise the fallback branches
 * without fixture files.
 */
export const extractText = async (
  localPath: string,
  mimeType: string,
  ocrFallback: (path: string) => Promise<string>,
  converter: (path: string) => Promise<string> = toMarkdown,
): Promise<ExtractedText> => {
  if (mimeType.startsWith("image/")) {
    return { text: await ocrFallback(localPath), source: "ocr" };
  }

  try {
    return { text: await converter(localPath), source: "anydoc" };
  } catch (err) {
    if (!isOcrSignal(err)) throw err;
    return { text: await ocrFallback(localPath), source: "ocr" };
  }
};
