import { test, expect, describe } from "bun:test";
import { QueueNames, type DocumentJobData } from "./types";

describe("DOCUMENT_QUEUE", () => {
  test("is registered with a stable name", () => {
    expect(QueueNames.DOCUMENT_QUEUE).toBe("document_queue");
  });

  test("does not collide with the existing queues", () => {
    const names = Object.values(QueueNames);
    expect(new Set(names).size).toBe(names.length);
  });

  test("job data carries the document id and its owner", () => {
    // The worker must never re-derive the owner from the path: the webhook
    // already validated it, and re-parsing would be a second chance to get
    // attribution wrong.
    const job: DocumentJobData = {
      documentId: "11111111-1111-1111-1111-111111111111",
      userId: "22222222-2222-2222-2222-222222222222",
      bucketName: "invoices",
      objectPath: "invoices/22222222-2222-2222-2222-222222222222/abc.pdf",
      mimeType: "application/pdf",
    };
    expect(job.documentId).toBeDefined();
    expect(job.userId).toBeDefined();
  });
});
