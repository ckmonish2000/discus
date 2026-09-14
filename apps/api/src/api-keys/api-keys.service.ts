import { AppError, type CreateApiKeyDto } from "common";
import { requireOwned } from "../shared/crud.helpers";
import { generateApiKey } from "../auth/services/crypto.service";
import { apiKeysRepository } from "./api-keys.repository";

export const apiKeysService = {
  /** Never returns key material. */
  list(userId: string) {
    return apiKeysRepository.listForUser(userId);
  },

  /**
   * The plaintext key is returned exactly once, from here. Only its SHA-256 is
   * stored, so it cannot be recovered afterwards — a lost key must be revoked
   * and replaced.
   */
  async create(userId: string, body: CreateApiKeyDto) {
    const { plaintext, hash, prefix } = generateApiKey();

    const key = await apiKeysRepository.create({
      userId,
      name: body.name,
      keyHash: hash,
      prefix,
    });

    if (!key) {
      throw new AppError("Failed to create API key", 500, "createApiKey");
    }

    return {
      ...key,
      key: plaintext,
      warning: "Store this key now — it cannot be retrieved again.",
    };
  },

  async revoke(id: string, userId: string) {
    return requireOwned(
      await apiKeysRepository.revoke(id, userId),
      "API key",
      "revokeApiKey",
    );
  },
};
