import { expect, test, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

const STUDENT_EMAIL = "student@bet.local";
const STUDENT_PASSWORD = "student-pass";
const STUDENT_ID = "00000000-0000-0000-0000-000000000002";
const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const BOOK_ID = "00000000-0000-0000-0000-000000000010";
const BASE_URL = "http://localhost:4321";

async function signInStudent(): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext({
    baseURL: BASE_URL,
  });
  const response = await context.post("/api/auth/signin", {
    form: {
      email: STUDENT_EMAIL,
      password: STUDENT_PASSWORD,
    },
    headers: {
      Origin: BASE_URL,
      Referer: `${BASE_URL}/auth/signin`,
    },
  });
  expect([200, 302].includes(response.status())).toBe(true);
  return context;
}

test.describe("admin user access boundary", () => {
  test("admin can list students", async ({ request }) => {
    const response = await request.get("/api/admin/users");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { users?: unknown[] };
    expect(body.users).toBeDefined();
  });

  test("student cannot list students", async () => {
    const studentContext = await signInStudent();
    const response = await studentContext.get("/api/admin/users");
    expect(response.status()).toBe(403);
    await studentContext.dispose();
  });

  test("anonymous cannot list students", async () => {
    const anonymousContext = await playwrightRequest.newContext({
      baseURL: BASE_URL,
    });
    const response = await anonymousContext.get("/api/admin/users");
    expect(response.status()).toBe(403);
    await anonymousContext.dispose();
  });

  test("cross-origin grant request is rejected", async ({ request }) => {
    const response = await request.post(`/api/admin/users/${STUDENT_ID}/grant`, {
      headers: { origin: "https://evil.com" },
      data: { book_id: BOOK_ID },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Invalid origin");
  });

  test("grant rejects invalid UUID param", async ({ request }) => {
    const response = await request.post("/api/admin/users/not-a-uuid/grant", {
      data: { book_id: BOOK_ID },
    });
    expect(response.status()).toBe(400);
  });

  test("grant rejects missing book_id", async ({ request }) => {
    const response = await request.post(`/api/admin/users/${STUDENT_ID}/grant`, {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  test("grant rejects admin target user", async ({ request }) => {
    const response = await request.post(`/api/admin/users/${ADMIN_ID}/grant`, {
      data: { book_id: BOOK_ID },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Target user is not a student");
  });

  test("revoke rejects invalid UUID param", async ({ request }) => {
    const response = await request.delete("/api/admin/users/not-a-uuid/revoke?book_id=" + BOOK_ID);
    expect(response.status()).toBe(400);
  });

  test("revoke rejects missing book_id", async ({ request }) => {
    const response = await request.delete(`/api/admin/users/${STUDENT_ID}/revoke`);
    expect(response.status()).toBe(400);
  });

  test("revoke rejects admin target user", async ({ request }) => {
    const response = await request.delete(`/api/admin/users/${ADMIN_ID}/revoke?book_id=${BOOK_ID}`);
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Target user is not a student");
  });
});
