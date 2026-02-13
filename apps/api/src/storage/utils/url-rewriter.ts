import { env } from "common";
/**
 * Rewrites MinIO internal URLs to public-facing URLs
 *
 * MinIO generates presigned URLs using the internal Docker network hostname (e.g., "minio:9000")
 * but browsers need to access URLs using the public hostname (e.g., "localhost:9000" or "yourdomain.com")
 *
 * This function replaces the internal hostname with the public one while preserving
 * the path, query parameters, and signature.
 */
export function rewriteMinioUrl(internalUrl: string): string {
  // Get the public URL from environment (what users/browsers should use)
  const publicBaseUrl = env.MINIO_PUBLIC_URL || "http://localhost:9000";
  
  try {
    const url = new URL(internalUrl);
    const publicUrl = new URL(publicBaseUrl);

    // Replace the host and protocol with the public ones
    url.protocol = publicUrl.protocol;
    url.hostname = publicUrl.hostname;
    url.port = publicUrl.port;

    return url.toString();
  } catch (error) {
    console.error("Failed to rewrite MinIO URL:", error);
    // If URL parsing fails, return original URL as fallback
    return internalUrl;
  }
}
