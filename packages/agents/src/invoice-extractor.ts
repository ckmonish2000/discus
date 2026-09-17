import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env, AppError } from "common";
import EXTRACTION_PROMPT from "../prompts/extraction.prompt";
import SUMMARY_PROMPT from "../prompts/summary.prompt";

const DEFAULT_TIMEOUT_MS = 120_000;

/** Exported for testing: the prompt is the part worth asserting on. */
export const buildExtractionPrompt = (
  markdown: string,
  jsonSchema: Record<string, unknown>,
): string =>
  [
    EXTRACTION_PROMPT,
    "",
    "Extract into this shape:",
    JSON.stringify(jsonSchema, null, 2),
    "",
    "Document:",
    markdown,
  ].join("\n");

/**
 * Structured extraction constrained by the user's own format schema.
 *
 * withStructuredOutput binds the JSON Schema to the request, so the model is
 * constrained rather than merely asked — the difference that makes a small
 * model's output usable. The schema comes from invoice_formats.schema, which
 * is the same definition the mapping engine routes from, so extraction and
 * storage cannot drift apart.
 */
export const extractInvoice = async (
  markdown: string,
  jsonSchema: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<Record<string, unknown>> => {
  if (!env.llm.GOOGLE_API_KEY) {
    throw new AppError(
      "GOOGLE_API_KEY is not configured",
      500,
      "extractInvoice",
    );
  }

  try {
    const model = new ChatGoogleGenerativeAI({
      apiKey: env.llm.GOOGLE_API_KEY,
      model: env.llm.GEMINI_MODEL,
      temperature: 0,
      maxRetries: 0, // BullMQ owns retries; two retry layers compound delays.
    });

    const structured = model.withStructuredOutput(jsonSchema);

    // The timer is cleared on every exit path. Promise.race abandons the
    // loser rather than cancelling it, so without this a fast success leaves
    // a two-minute timer pending — once per document, on a worker that runs
    // continuously.
    let timer: ReturnType<typeof setTimeout> | undefined;

    const result = await Promise.race([
      structured.invoke(buildExtractionPrompt(markdown, jsonSchema)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Extraction timed out")),
          opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });

    return result as Record<string, unknown>;
  } catch (error) {
    // The underlying reason goes in the message, not just the cause. This
    // surfaces in documents.errorMessage and therefore in the dashboard
    // toast, where "Gemini failed to extract invoice fields" alone gives a
    // user nothing to act on — a stale model name and a revoked key read
    // identically.
    const detail = error instanceof Error ? error.message : String(error);

    throw new AppError(
      `Gemini failed to extract invoice fields: ${detail}`,
      500,
      "extractInvoice",
      error,
      { markdownLength: markdown.length, model: env.llm.GEMINI_MODEL },
    );
  }
};

/**
 * One-sentence factual summary for the documents list and the full-text
 * index. Failure is non-fatal: a missing summary degrades search, while a
 * thrown error here would fail an otherwise successful extraction.
 */
export const summariseDocument = async (
  markdown: string,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> => {
  if (!env.llm.GOOGLE_API_KEY) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const model = new ChatGoogleGenerativeAI({
      apiKey: env.llm.GOOGLE_API_KEY,
      model: env.llm.GEMINI_MODEL,
      temperature: 0,
      maxRetries: 0,
    });

    const result = await Promise.race([
      model.invoke(`${SUMMARY_PROMPT}\n${markdown}`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Summarisation timed out")),
          opts.timeoutMs ?? 30_000,
        );
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });

    const text = String((result as { content?: unknown }).content ?? "").trim();
    return text ? text.slice(0, 500) : null;
  } catch (error) {
    console.warn("Summarisation failed; continuing without one", error);
    return null;
  }
};
