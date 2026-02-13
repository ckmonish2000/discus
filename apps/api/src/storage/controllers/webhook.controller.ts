import { Hono } from "hono";
import { StorageWebhookDto } from "../validators/webhook.dto";

import { imageQueue, videoQueue } from "../../queues";

const router = new Hono();

/**
 * POST /webhook
 * Handle incoming webhooks from MinIO for bucket events
 */
router.post("/webhook", async (c) => {
  try {
    let job;
    const { Key: objectName, Records }: StorageWebhookDto = await c.req.json();
    const fileType = String(
      Records.at(0)?.s3?.object?.["userMetadata"]["content-type"],
    );
    const [bucketName, ...objectPath] = objectName.split("/");

    if (!bucketName) {
      throw new Error("Bucket name not found");
    }

    if (fileType?.includes("image")) {
      job = await imageQueue.add("process_image", {
        fileType: "image",
        bucketName,
        objectPath,
      });
    }

    if (fileType?.includes("video")) {
      job = await videoQueue.add("process_video", {
        fileType: "video",
        bucketName,
        objectPath,
      });
    }

    return c.json({ success: true, data: { job } });
  } catch (error) {
    console.log(error);
    throw error;
  }
});

export default router;
