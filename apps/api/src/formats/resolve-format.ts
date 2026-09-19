import { formatsRepository } from "./formats.repository";
import { DEFAULT_INVOICE_SCHEMA, DEFAULT_FIELD_MAPPING } from "./default-format";
import type { FieldMapping } from "drizzle";

export type ResolvedFormat = {
  schema: Record<string, unknown>;
  fieldMapping: FieldMapping;
  /** Null when no default row exists and the built-in template was used. */
  formatId: string | null;
};

/**
 * The extraction format for a user: their default row, or the built-in
 * template when they have none.
 *
 * The fallback is not dead code. seedDefault runs at signup, but a user can
 * delete every format, and accounts created before seeding existed have none.
 * Extraction must still work rather than fail on a missing row.
 */
export const resolveExtractionFormat = async (
  userId: string,
): Promise<ResolvedFormat> => {
  const format = await formatsRepository.findDefault(userId);

  if (!format) {
    return {
      schema: DEFAULT_INVOICE_SCHEMA as unknown as Record<string, unknown>,
      fieldMapping: DEFAULT_FIELD_MAPPING,
      formatId: null,
    };
  }

  return {
    schema: format.schema,
    fieldMapping: format.fieldMapping,
    formatId: format.id,
  };
};
