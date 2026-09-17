import {
  AppError,
  rewriteMinioUrl,
  type CreateDocumentDto,
  type ListDocumentsDto,
} from "common";
import { db, documents } from "drizzle";
import { and, eq } from "drizzle-orm";
import { documentQueue } from "../queues";
import { requireOwned } from "../shared/crud.helpers";
import { documentsRepository } from "./documents.repository";
import { minioService } from "../storage/services/minio.service";

/** Short-lived: a preview URL is for opening now, not for sharing. */
const PREVIEW_URL_TTL_SECONDS = 300;

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

  /**
   * A time-limited URL for viewing the original file.
   *
   * Goes through getById first, so a document belonging to another user 404s
   * before any URL is minted. The generic /storage/object/download route
   * takes a caller-supplied bucket and path and checks nothing, so it must
   * not be what the dashboard uses to open an invoice.
   */
  async previewUrl(id: string, userId: string) {
    const doc = await documentsService.getById(id, userId);

    const url = await minioService.getPresignedUrl({
      bucketName: doc.bucketName,
      objectName: doc.objectPath,
      isFetch: true,
      expires: PREVIEW_URL_TTL_SECONDS,
    });

    return { url: rewriteMinioUrl(url), mimeType: doc.mimeType };
  },

  async remove(id: string, userId: string) {
    requireOwned(
      await documentsRepository.remove(id, userId),
      "Document",
      "deleteDocument",
    );
  },

  /**
   * Re-enqueues a document for extraction. Used after a failure, so it clears
   * the previous error rather than leaving a stale message on a pending row.
   */
  async retry(id: string, userId: string) {
    const doc = await documentsService.getById(id, userId);

    const [updated] = await db
      .update(documents)
      .set({
        status: "pending",
        errorMessage: null,
        processedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning();

    await documentQueue.add("process_document", {
      documentId: doc.id,
      userId,
      bucketName: doc.bucketName,
      objectPath: doc.objectPath,
      mimeType: doc.mimeType,
    });

    return updated!;
  },
};
