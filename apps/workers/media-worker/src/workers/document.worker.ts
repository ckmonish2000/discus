import path from "path";
import fs from "fs";
import { createWorker, QueueNames, type DocumentJobData } from "queues";
import { db, documents, invoiceFormats } from "drizzle";
import { and, eq } from "drizzle-orm";
import { applyMapping, rewriteMinioUrl, type MappedInvoice } from "common";
import AgentService, { extractInvoice, summariseDocument } from "agents";
import { persistExtraction } from "../../../../api/src/invoices/extraction.repository";
import { minioService } from "../services/minio.service";
import { extractText } from "../services/text-extraction.service";
import {
  DEFAULT_INVOICE_SCHEMA,
  DEFAULT_FIELD_MAPPING,
} from "../../../../api/src/formats/default-format";

/**
 * Confidence is derived rather than asked for: a model's self-reported score
 * is not evidence. One issue from the mapping engine is a small penalty, and
 * a missing total is disqualifying on its own.
 */
const scoreConfidence = (mapped: MappedInvoice): number => {
  let score = 1;
  score -= mapped.issues.length * 0.15;
  if (mapped.invoice.totalMinor === null) score -= 0.4;
  if (!mapped.vendor.name) score -= 0.2;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
};

const documentWorker = await createWorker<DocumentJobData>(
  QueueNames.DOCUMENT_QUEUE,
  async (job) => {
    const { documentId, userId, bucketName, objectPath, mimeType } = job.data;

    // The webhook sets both fields from the same validated upload, so this
    // should never fire — but persistExtraction filters its document update
    // by id alone, so a mismatched pair would let one user's extraction
    // overwrite another user's document. Cheap indexed read, permanent guard.
    const [owned] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .limit(1);

    if (!owned) {
      console.warn("Dropping job: document does not belong to user", {
        documentId,
        userId,
      });
      return;
    }

    await db
      .update(documents)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    const workDir = path.join(__dirname, "../assets/input");
    let localPath: string | null = null;

    try {
      // 1. Text. anydoc reads from local disk, so the file comes down first.
      localPath = await minioService.saveObjectToLocation(
        bucketName,
        objectPath,
        workDir,
      );

      const agentService = new AgentService();
      const { text, source } = await extractText(
        localPath,
        mimeType,
        async () => {
          const url = await minioService.getPresignedUrl({
            bucketName,
            objectName: objectPath,
            isFetch: true,
          });
          const ocr = await agentService.processImageUrl(rewriteMinioUrl(url));
          return (ocr?.pages ?? []).map((p) => p?.markdown ?? "").join("\n\n");
        },
      );

      console.log(`[document] text via ${source}`, { documentId });

      // 2. The user's format, falling back to the built-in template.
      const [format] = await db
        .select()
        .from(invoiceFormats)
        .where(
          and(
            eq(invoiceFormats.userId, userId),
            eq(invoiceFormats.isDefault, true),
          ),
        )
        .limit(1);

      const schema =
        format?.schema ??
        (DEFAULT_INVOICE_SCHEMA as unknown as Record<string, unknown>);
      const fieldMapping = format?.fieldMapping ?? DEFAULT_FIELD_MAPPING;

      // 3. Extract, then map.
      const extracted = await extractInvoice(text, schema);
      const mapped = applyMapping(extracted, fieldMapping);

      // 4. Persist. One transaction across vendor, invoice and line items.
      const { invoiceId } = await persistExtraction({
        userId,
        documentId,
        mapped,
        confidence: scoreConfidence(mapped),
      });

      await db
        .update(documents)
        .set({
          ocrText: text,
          // Feeds the documents list and the full-text index. Returns null
          // rather than throwing when it fails or no key is configured, so a
          // missing summary never costs a successful extraction.
          summary: await summariseDocument(text),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      console.log("[document] extracted", {
        documentId,
        invoiceId,
        issues: mapped.issues.length,
      });
    } catch (error) {
      // The message reaches the dashboard as a toast, so it says what went
      // wrong in plain language rather than carrying a stack trace.
      const message =
        error instanceof Error ? error.message : "Extraction failed";

      await db
        .update(documents)
        .set({
          status: "failed",
          errorMessage: message,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(documents.id, documentId));

      throw error; // let BullMQ record the failure and retry
    } finally {
      if (localPath) {
        await fs.promises.rm(localPath, { force: true }).catch(() => {});
      }
    }
  },
);

console.log("Document Worker started and listening for jobs...");

process.on("SIGTERM", async () => {
  await documentWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await documentWorker.close();
  process.exit(0);
});
