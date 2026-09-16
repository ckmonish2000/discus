import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { db, users, documents } from "drizzle";
import { eq } from "drizzle-orm";
import { documentsService } from "../documents/documents.service";
import { isExtractableMimeType } from "./webhook-routing";

describe("isExtractableMimeType", () => {
  test("accepts pdf", () => {
    expect(isExtractableMimeType("application/pdf")).toBe(true);
  });

  test("accepts images, which reach OCR directly", () => {
    expect(isExtractableMimeType("image/png")).toBe(true);
    expect(isExtractableMimeType("image/jpeg")).toBe(true);
  });

  test("accepts office documents anydoc can convert", () => {
    expect(
      isExtractableMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  test("rejects video, which belongs to the existing coaching pipeline", () => {
    expect(isExtractableMimeType("video/mp4")).toBe(false);
  });

  test("rejects an empty or unknown type", () => {
    expect(isExtractableMimeType("")).toBe(false);
    expect(isExtractableMimeType("application/zip")).toBe(false);
  });
});

describe("duplicate webhook delivery", () => {
  let userId: string;
  const objectPath = `invoices/dup/${Math.random().toString(36).slice(2)}.pdf`;

  beforeAll(async () => {
    const [u] = await db
      .insert(users)
      .values({
        email: `dup-${Math.random().toString(36).slice(2, 8)}@example.com`,
        passwordHash: "x",
      })
      .returning();
    userId = u!.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  test("register reports created=false on redelivery, so the webhook can skip enqueuing", async () => {
    // MinIO can deliver the same event twice. The document row is idempotent,
    // but enqueuing twice would run extraction twice and write a second
    // invoice for one upload — a double-booked payable. The webhook relies on
    // this flag to tell the two cases apart.
    const dto = {
      bucketName: "invoices",
      objectPath,
      mimeType: "application/pdf",
      originalFilename: "x.pdf",
      sizeBytes: null,
    };

    const first = await documentsService.register(userId, dto);
    const second = await documentsService.register(userId, dto);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.document.id).toBe(first.document.id);

    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.objectPath, objectPath));
    expect(rows).toHaveLength(1);
  });
});
