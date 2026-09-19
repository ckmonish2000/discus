/** Types the extraction pipeline can handle: anydoc's formats, plus images via OCR. */
const EXTRACTABLE = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/rtf",
  "text/csv",
]);

export const isExtractableMimeType = (mimeType: string): boolean => {
  if (!mimeType) return false;
  if (mimeType.startsWith("image/")) return true;
  return EXTRACTABLE.has(mimeType);
};
