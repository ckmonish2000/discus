import { Hono } from "hono";
import { minioService } from "../services/minio.service";
import {
  storageObjectValidator,
  StorageObjectDto,
  invoiceUploadValidator,
  type InvoiceUploadDto,
} from "../validators/upload-url.dto";
import { AppError, buildInvoiceObjectPath, env, rewriteMinioUrl } from "common";
import { requireAuth, getUserId } from "../../auth/middleware/auth.middleware";

const router = new Hono();

/** Invoice objects live under the shared bucket; the path carries the owner. */
const DEFAULT_BUCKET = "discus";

/**
 * POST /object
 * Generate a presigned URL for uploading an object to MinIO.
 *
 * Requires authentication, and refuses to mint a URL under the `invoices/`
 * prefix: the MinIO webhook trusts that prefix as proof of ownership, so an
 * arbitrary caller-supplied objectName under it would let a caller forge an
 * upload attributed to another user. Invoice uploads must go through
 * /invoice-upload-url, which derives the prefix from the session instead.
 */
router.post("/object", requireAuth, storageObjectValidator, async (c) => {
  try {
    const { bucketName, objectName }: StorageObjectDto = await c.req.json();

    if (objectName.startsWith("invoices/")) {
      throw new AppError(
        "Use /storage/invoice-upload-url for invoice uploads",
        400,
        "presignedObject",
      );
    }

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

/**
 * POST /invoice-upload-url
 *
 * The object path is derived from the authenticated session, never from the
 * request body. This is what makes the path a trustworthy source of ownership
 * when the MinIO webhook later parses it.
 */
router.post(
  "/invoice-upload-url",
  requireAuth,
  invoiceUploadValidator,
  async (c) => {
    const { filename }: InvoiceUploadDto = c.req.valid("json");
    const objectPath = buildInvoiceObjectPath(getUserId(c), filename);

    // The "discus" bucket, not "invoices": buildInvoiceObjectPath already
    // starts the key with the invoices/ prefix, and the webhook reconstructs
    // <bucket>/<path> from MinIO's Key field. Uploading into a bucket of the
    // same name yields invoices/invoices/<userId>/..., which
    // parseInvoiceObjectPath rejects as malformed — the upload would land in
    // storage and never be extracted.
    const presigned = await minioService.getPresignedUrl({
      bucketName: DEFAULT_BUCKET,
      objectName: objectPath,
      expires: env.minio.EXPIRES_IN,
    });

    // MinIO signs against its internal hostname (minio:9000), which a browser
    // cannot resolve. The rewrite swaps in MINIO_PUBLIC_URL's host while
    // preserving the path and signature. /object already did this; this route
    // did not, so every browser upload here failed to connect.
    return c.json({
      success: true,
      data: { url: rewriteMinioUrl(presigned), objectPath },
    });
  },
);

export default router;
