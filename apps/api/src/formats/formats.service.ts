import { db, type Executor } from "drizzle";
import { AppError, type CreateFormatDto, type UpdateFormatDto } from "common";
import { requireOwned } from "../shared/crud.helpers";
import { formatsRepository } from "./formats.repository";
import {
  DEFAULT_INVOICE_SCHEMA,
  DEFAULT_FIELD_MAPPING,
  DEFAULT_FORMAT_NAME,
  DEFAULT_FORMAT_DESCRIPTION,
} from "./default-format";

/**
 * At most one format per user may be the default, enforced by a partial unique
 * index. Any write that sets `isDefault` must therefore clear the previous
 * default in the same transaction, or the index rejects it.
 */
export const formatsService = {
  list(userId: string) {
    return formatsRepository.list(userId);
  },

  async getById(id: string, userId: string) {
    return requireOwned(
      await formatsRepository.findById(id, userId),
      "Format",
      "getFormat",
    );
  },

  /** The built-in starting point. Identical for every user. */
  template() {
    return {
      name: DEFAULT_FORMAT_NAME,
      description: DEFAULT_FORMAT_DESCRIPTION,
      schema: DEFAULT_INVOICE_SCHEMA,
      fieldMapping: DEFAULT_FIELD_MAPPING,
    };
  },

  async create(userId: string, body: CreateFormatDto) {
    const created = await db.transaction(async (tx) => {
      if (body.isDefault) await formatsRepository.clearDefaults(userId, undefined, tx);

      return formatsRepository.create(
        {
          userId,
          name: body.name,
          description: body.description ?? null,
          schema: body.schema,
          fieldMapping: body.fieldMapping,
          isDefault: body.isDefault,
        },
        tx,
      );
    });

    if (!created) {
      throw new AppError("Failed to create format", 500, "createFormat");
    }

    return created;
  },

  /**
   * Installs the EN 16931 template for a new account. Idempotent: returns the
   * existing default if one is already set.
   */
  async seedDefault(userId: string, ex: Executor = db) {
    const existing = await formatsRepository.findDefault(userId, ex);
    if (existing) return { format: existing, created: false as const };

    const format = await formatsRepository.create(
      {
        userId,
        name: DEFAULT_FORMAT_NAME,
        description: DEFAULT_FORMAT_DESCRIPTION,
        schema: DEFAULT_INVOICE_SCHEMA as unknown as Record<string, unknown>,
        fieldMapping: DEFAULT_FIELD_MAPPING,
        isDefault: true,
      },
      ex,
    );

    if (!format) {
      throw new AppError("Failed to seed default format", 500, "seedDefault");
    }

    return { format, created: true as const };
  },

  async update(id: string, userId: string, body: UpdateFormatDto) {
    const updated = await db.transaction(async (tx) => {
      if (body.isDefault) await formatsRepository.clearDefaults(userId, id, tx);

      return formatsRepository.update(
        id,
        userId,
        {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && {
            description: body.description,
          }),
          ...(body.schema !== undefined && { schema: body.schema }),
          ...(body.fieldMapping !== undefined && {
            fieldMapping: body.fieldMapping,
          }),
          ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
        },
        tx,
      );
    });

    return requireOwned(updated, "Format", "updateFormat");
  },

  async remove(id: string, userId: string) {
    requireOwned(
      await formatsRepository.remove(id, userId),
      "Format",
      "deleteFormat",
    );
  },
};
