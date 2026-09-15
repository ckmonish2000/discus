import { Hono } from "hono";
import { StorageWebhookDto } from "../validators/webhook.dto";

import { AppError, parseInvoiceObjectPath } from "common";
import { imageQueue, videoQueue, documentQueue } from "../../queues";
import { isExtractableMimeType } from "../webhook-routing";
import { documentsService } from "../../documents/documents.service";
import { usersRepository } from "../../auth/users.repository";

const router = new Hono();

/**
 * POST /webhook
 * Handle incoming webhooks from MinIO for bucket events
 */
router.post("/webhook", async (c) => {
  const { Key: objectName, Records }: StorageWebhookDto = await c.req.json();
  const fileType = String(
    Records.at(0)?.s3?.object?.["userMetadata"]["content-type"],
  );
  const [bucketName, ...rest] = objectName.split("/");
  const objectPath = rest.join("/");

  if (!bucketName) {
    throw new AppError("Bucket name not found", 400, "storageWebhook");
  }

  // Invoice uploads carry their owner in the path. Anything that does not
  // parse is dropped rather than enqueued: without a verified owner there is
  // no user to attribute the document to, and guessing would be worse than
  // ignoring it.
  const owner = parseInvoiceObjectPath(objectPath);

  if (owner && isExtractableMimeType(fileType)) {
    const user = await usersRepository.findPublicById(owner.userId);
    if (!user) {
      console.warn("Dropping upload for unknown user", { objectPath });
      return c.json({ success: true, data: { job: null } });
    }

    const { document } = await documentsService.register(owner.userId, {
      bucketName,
      objectPath,
      mimeType: fileType,
      originalFilename: owner.filename,
      sizeBytes: null,
    });

    const job = await documentQueue.add("process_document", {
      documentId: document.id,
      userId: owner.userId,
      bucketName,
      objectPath,
      mimeType: fileType,
    });

    return c.json({ success: true, data: { job: { id: job.id } } });
  }

  // Existing discus coaching pipeline, unchanged.
  let job;
  const legacyPath = rest;

  if (fileType?.includes("image")) {
    job = await imageQueue.add("process_image", {
      fileType: "image",
      bucketName,
      objectPath: legacyPath,
    });
  }

  if (fileType?.includes("video")) {
    job = await videoQueue.add("process_video", {
      fileType: "video",
      bucketName,
      objectPath: legacyPath,
    });
  }

  return c.json({ success: true, data: { job } });
});

export default router;
