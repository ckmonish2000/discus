import { Hono } from "hono";
import { minioService } from "../services/minio.service";
import {
  storageObjectValidator,
  StorageObjectDto,
} from "../validators/download-url.dto";
import { env, rewriteMinioUrl } from "common";

const router = new Hono();

/**
 * POST /object/download
 * Generate a presigned URL for downloading an object from MinIO
 */
router.post("/object/download", storageObjectValidator, async (c) => {
  try {
    const { bucketName, objectName }: StorageObjectDto = await c.req.json();
    const response = await minioService.getPresignedUrl({
      bucketName,
      objectName,
      isFetch: true, // Download URL
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
