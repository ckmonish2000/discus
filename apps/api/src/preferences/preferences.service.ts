import { AppError, type UpsertPreferenceDto } from "common";
import { requireOwned } from "../shared/crud.helpers";
import { preferencesRepository } from "./preferences.repository";

export const preferencesService = {
  list(userId: string) {
    return preferencesRepository.listForUser(userId);
  },

  async getByKey(userId: string, key: string) {
    return requireOwned(
      await preferencesRepository.findByKey(userId, key),
      "Preference",
      "getPreference",
    );
  },

  async upsert(userId: string, key: string, body: UpsertPreferenceDto) {
    const pref = await preferencesRepository.upsert(userId, key, {
      value: body.value ?? null,
      metadata: body.metadata ?? null,
    });

    if (!pref) {
      throw new AppError("Failed to save preference", 500, "upsertPreference");
    }

    return pref;
  },

  async remove(userId: string, key: string) {
    requireOwned(
      await preferencesRepository.remove(userId, key),
      "Preference",
      "deletePreference",
    );
  },
};
