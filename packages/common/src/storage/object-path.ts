import { randomUUID } from "crypto";

export const INVOICE_PREFIX = "invoices";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Invoice objects live at `invoices/<userId>/<uuid>.<ext>`.
 *
 * MinIO's webhook carries no user context — only a bucket and a key — so the
 * path is the only place attribution can come from. The presigned-URL
 * endpoint derives the prefix from the authenticated session rather than
 * accepting it from the client, which is what makes the path trustworthy.
 */
export const buildInvoiceObjectPath = (
  userId: string,
  filename: string,
): string => {
  // Keep only the extension from the client-supplied name; the rest is
  // replaced by a uuid so a crafted name cannot escape the prefix.
  const base = filename.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).replace(/[^.A-Za-z0-9]/g, "") : "";
  return `${INVOICE_PREFIX}/${userId}/${randomUUID()}${ext}`;
};

/** Returns null for anything that is not a well-formed invoice path. */
export const parseInvoiceObjectPath = (
  objectPath: string,
): { userId: string; filename: string } | null => {
  if (typeof objectPath !== "string" || !objectPath) return null;

  const parts = objectPath.split("/");
  if (parts.length !== 3) return null;

  const [prefix, userId, filename] = parts;
  if (prefix !== INVOICE_PREFIX) return null;
  if (!userId || !UUID_RE.test(userId)) return null;
  if (!filename) return null;

  return { userId, filename };
};
