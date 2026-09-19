import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { db, users } from "drizzle";
import { eq } from "drizzle-orm";
import app from "../index";

let cookie: string;
let userId: string;

const json = (res: Response) => res.json() as Promise<{ data: any }>;

beforeAll(async () => {
  const email = `upload-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await app.fetch(
    new Request("http://localhost/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "a-sufficiently-long-password" }),
    }),
  );
  userId = (await json(res)).data.user.id;
  cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

describe("POST /storage/invoice-upload-url", () => {
  test("returns a path scoped to the caller", async () => {
    const res = await app.fetch(
      new Request("http://localhost/storage/invoice-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ filename: "invoice.pdf" }),
      }),
    );

    expect(res.status).toBe(200);
    const { data } = await json(res);
    expect(data.objectPath).toStartWith(`invoices/${userId}/`);
    expect(data.url).toBeDefined();
  });

  test("ignores a client-supplied path and keeps the caller's prefix", async () => {
    // The whole attribution scheme rests on the client being unable to choose
    // its own prefix.
    const res = await app.fetch(
      new Request("http://localhost/storage/invoice-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ filename: "../../other-user/evil.pdf" }),
      }),
    );

    const { data } = await json(res);
    expect(data.objectPath).toStartWith(`invoices/${userId}/`);
    expect(data.objectPath).not.toContain("..");
  });

  test("requires authentication", async () => {
    const res = await app.fetch(
      new Request("http://localhost/storage/invoice-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "invoice.pdf" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /object requires authentication", async () => {
    const res = await app.fetch(
      new Request("http://localhost/storage/object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucketName: "invoices", objectName: "x.pdf" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /object refuses to mint a URL under the invoices prefix", async () => {
    // Otherwise a caller could write into another user's folder and forge
    // attribution, since the webhook trusts the path.
    const res = await app.fetch(
      new Request("http://localhost/storage/object", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          bucketName: "invoices",
          objectName: "invoices/00000000-0000-0000-0000-000000000000/evil.pdf",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
