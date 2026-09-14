import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { db, users } from "drizzle";
import { eq, inArray } from "drizzle-orm";
import app from "../index";

/**
 * Cross-user isolation. Every resource must be invisible to a user who does
 * not own it, and must return 404 rather than 403 — a 403 confirms the id is
 * real, which lets an attacker enumerate other users' invoices and documents.
 *
 * Requires a running database (docker compose up -d db).
 */

const unique = () => Math.random().toString(36).slice(2, 10);

type Session = { cookie: string; userId: string; email: string };

const request = (path: string, init: RequestInit = {}) =>
  app.fetch(new Request(`http://localhost${path}`, init));

/** res.json() is typed unknown; tests assert on shapes they just created. */
type ApiResponse = { success: boolean; data: any };
const json = (res: Response): Promise<ApiResponse> =>
  res.json() as Promise<ApiResponse>;

const signup = async (): Promise<Session> => {
  const email = `iso-${unique()}@example.com`;
  const res = await request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "a-sufficiently-long-password" }),
  });

  expect(res.status).toBe(201);
  const body = await json(res);

  const cookies = res.headers.getSetCookie?.() ?? [];
  const access = cookies
    .map((c) => c.split(";")[0])
    .filter((c) => c?.startsWith("discus_"))
    .join("; ");

  return { cookie: access, userId: body.data.user.id, email };
};

const asUser = (session: Session, path: string, init: RequestInit = {}) =>
  request(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Cookie: session.cookie,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

let alice: Session;
let mallory: Session;
let aliceInvoiceId: string;
let aliceVendorId: string;
let aliceDocumentId: string;

beforeAll(async () => {
  alice = await signup();
  mallory = await signup();

  const vendorRes = await asUser(alice, "/vendors", {
    method: "POST",
    body: JSON.stringify({ name: `Acme ${unique()}`, taxId: unique() }),
  });
  aliceVendorId = (await json(vendorRes)).data.id;

  const docRes = await asUser(alice, "/documents", {
    method: "POST",
    body: JSON.stringify({
      bucketName: "invoices",
      objectPath: `${unique()}/doc.pdf`,
      mimeType: "application/pdf",
    }),
  });
  aliceDocumentId = (await json(docRes)).data.id;

  const invRes = await asUser(alice, "/invoices", {
    method: "POST",
    body: JSON.stringify({
      vendorId: aliceVendorId,
      invoiceNumber: "SECRET-001",
      currency: "USD",
      total: 4200.5,
      lineItems: [{ description: "Confidential", quantity: 1, lineTotal: 4200.5 }],
    }),
  });
  aliceInvoiceId = (await json(invRes)).data.id;
});

afterAll(async () => {
  await db
    .delete(users)
    .where(inArray(users.id, [alice.userId, mallory.userId]));
});

describe("unauthenticated access", () => {
  for (const path of [
    "/invoices",
    "/vendors",
    "/documents",
    "/preferences",
    "/formats",
    "/api-keys",
  ]) {
    test(`${path} requires authentication`, async () => {
      expect((await request(path)).status).toBe(401);
    });
  }
});

describe("cross-user reads", () => {
  test("another user's invoice is 404, not 403", async () => {
    const res = await asUser(mallory, `/invoices/${aliceInvoiceId}`);
    expect(res.status).toBe(404);
  });

  test("another user's vendor is 404", async () => {
    expect((await asUser(mallory, `/vendors/${aliceVendorId}`)).status).toBe(404);
  });

  test("another user's document is 404", async () => {
    expect((await asUser(mallory, `/documents/${aliceDocumentId}`)).status).toBe(
      404,
    );
  });

  test("listings are scoped to the caller", async () => {
    const res = await asUser(mallory, "/invoices");
    const body = await json(res);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.pagination.total).toBe(0);
  });
});

describe("cross-user writes", () => {
  test("cannot update another user's invoice", async () => {
    const res = await asUser(mallory, `/invoices/${aliceInvoiceId}`, {
      method: "PATCH",
      body: JSON.stringify({ total: 1 }),
    });
    expect(res.status).toBe(404);
  });

  test("cannot delete another user's invoice", async () => {
    const res = await asUser(mallory, `/invoices/${aliceInvoiceId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  test("cannot link another user's vendor to an own invoice", async () => {
    const res = await asUser(mallory, "/invoices", {
      method: "POST",
      body: JSON.stringify({
        vendorId: aliceVendorId,
        currency: "USD",
        total: 1,
      }),
    });
    expect(res.status).toBe(404);
  });

  test("the victim's data is unchanged after all attempts", async () => {
    const res = await asUser(alice, `/invoices/${aliceInvoiceId}`);
    const body = await json(res);
    expect(body.data.invoiceNumber).toBe("SECRET-001");
    expect(body.data.total).toBe(4200.5);
  });
});

describe("money round-trip", () => {
  test("decimals in, decimals out, minor units stored", async () => {
    const res = await asUser(alice, `/invoices/${aliceInvoiceId}`);
    const body = await json(res);
    expect(body.data.total).toBe(4200.5);
    expect(body.data.lineItems[0].lineTotal).toBe(4200.5);
  });

  test("a zero-decimal currency is not divided by 100", async () => {
    const res = await asUser(alice, "/invoices", {
      method: "POST",
      body: JSON.stringify({
        currency: "JPY",
        total: 5000,
        invoiceNumber: "JPY-001",
      }),
    });
    const body = await json(res);
    expect(body.data.total).toBe(5000);
  });
});

describe("api keys", () => {
  test("a key authenticates and is revocable", async () => {
    const created = await asUser(alice, "/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "test key" }),
    });
    const { data } = await json(created);
    const key: string = data.key;

    const used = await request("/invoices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currency: "USD", total: 10, invoiceNumber: "K-1" }),
    });
    expect(used.status).toBe(201);
    expect((await json(used)).data.source).toBe("api");

    await asUser(alice, `/api-keys/${data.id}`, { method: "DELETE" });

    const afterRevoke = await request("/invoices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currency: "USD", total: 10 }),
    });
    expect(afterRevoke.status).toBe(401);
  });

  test("an api key cannot mint another api key", async () => {
    const created = await asUser(alice, "/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: "escalation test" }),
    });
    const key: string = (await json(created)).data.key;

    const res = await request("/api-keys", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "escalated" }),
    });
    expect(res.status).toBe(401);
  });
});
