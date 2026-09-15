import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env, AppError } from "common";
import EXTRACTION_PROMPT from "../prompts/extraction.prompt";

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

    const result = await Promise.race([
      structured.invoke(buildExtractionPrompt(markdown, jsonSchema)),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Extraction timed out")),
          opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ),
      ),
    ]);

    return result as Record<string, unknown>;
  } catch (error) {
    throw new AppError(
      "Gemini failed to extract invoice fields",
      500,
      "extractInvoice",
      error,
      { markdownLength: markdown.length },
    );
  }
};
