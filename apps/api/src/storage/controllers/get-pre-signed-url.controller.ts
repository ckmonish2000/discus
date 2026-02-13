import { Hono } from "hono";
import { minioService } from "../services/minio.service";
import {
  storageObjectValidator,
  StorageObjectDto,
} from "../validators/upload-url.dto";
import { env, rewriteMinioUrl } from "common";

const router = new Hono();

/**
 * POST /object
 * Generate a presigned URL for uploading an object to MinIO
 */
router.post("/object", storageObjectValidator, async (c) => {
  try {
    const { bucketName, objectName }: StorageObjectDto = await c.req.json();
    const response = await minioService.getPresignedUrl({
      bucketName,
      objectName,
      isFetch: false, // Upload URL
      expires: env.minio.EXPIRES_IN, // 7 days
    });

    const publickURL = rewriteMinioUrl(response);
    return c.json({ success: true, data: { url: publickURL } });
  } catch (error) {
    console.log(error);
    throw error;
  }
});

export default router;
