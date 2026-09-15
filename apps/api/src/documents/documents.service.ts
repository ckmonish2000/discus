import { AppError, type CreateDocumentDto, type ListDocumentsDto } from "common";
import { requireOwned } from "../shared/crud.helpers";
import { documentsRepository } from "./documents.repository";

export const documentsService = {
  list(userId: string, query: ListDocumentsDto) {
    return documentsRepository.list(userId, query);
  },

  async getById(id: string, userId: string) {
    return requireOwned(
      await documentsRepository.findById(id, userId),
      "Document",
      "getDocument",
    );
  },

  /**
   * Registering an uploaded object is idempotent: the (bucket_name,
   * object_path) unique index means a repeat registration returns the existing
   * row rather than creating a duplicate.
   *
   * `created` tells the controller whether to answer 201 or 200.
   */
  async register(userId: string, body: CreateDocumentDto) {
    const doc = await documentsRepository.create(userId, body);
    if (doc) return { document: doc, created: true as const };

    const existing = await documentsRepository.findByObject(
      body.bucketName,
      body.objectPath,
      userId,
    );

    // The object exists but belongs to someone else.
    if (!existing) {
      throw new AppError(
        "That object is already registered",
        409,
        "createDocument",
      );
    }

    return { document: existing, created: false as const };
  },

  async remove(id: string, userId: string) {
    requireOwned(
      await documentsRepository.remove(id, userId),
      "Document",
      "deleteDocument",
    );
  },
};
