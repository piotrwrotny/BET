import { expect, test, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

const STUDENT_EMAIL = "student@bet.local";
const STUDENT_PASSWORD = "student-pass";
const BASE_URL = "http://localhost:4321";

const LESSON_READING_ONLY = "00000000-0000-0000-0000-000000000032";
const LESSON_WITH_SOLVED_CLOSED = "00000000-0000-0000-0000-000000000034";

async function signInStudent(): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext({ baseURL: BASE_URL });
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

test.describe("lesson reading confirmation and completion", () => {
  test.describe.configure({ mode: "serial" });

  test("rejects cross-origin reading confirmation", async () => {
    const context = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const response = await context.post(`/api/lessons/${LESSON_READING_ONLY}/read`, {
      headers: { origin: "https://evil.com" },
    });
    expect(response.status()).toBe(403);
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    expect(body.error).toBe("Invalid origin");
    await context.dispose();
  });

  test("rejects anonymous reading confirmation", async () => {
    const context = await playwrightRequest.newContext({ baseURL: BASE_URL });
    const response = await context.post(`/api/lessons/${LESSON_READING_ONLY}/read`, {
      headers: { origin: BASE_URL },
    });
    expect(response.status()).toBe(401);
    await context.dispose();
  });

  test("student can confirm reading for accessible lesson", async () => {
    const context = await signInStudent();
    const response = await context.post(`/api/lessons/${LESSON_READING_ONLY}/read`, {
      headers: { origin: BASE_URL },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { success?: boolean };
    expect(body.success).toBe(true);
    await context.dispose();
  });

  test("student cannot complete lesson without reading confirmation", async () => {
    const context = await signInStudent();
    // Lesson 034 has one closed exercise already solved in seed, but no reading confirmation.
    const response = await context.post(`/api/lessons/${LESSON_WITH_SOLVED_CLOSED}/complete`, {
      headers: { origin: BASE_URL },
    });
    expect(response.status()).toBe(409);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBe("Potwierdź przeczytanie lekcji.");
    await context.dispose();
  });

  test("student can complete reading-only lesson after confirming reading", async () => {
    const context = await signInStudent();
    const readResponse = await context.post(`/api/lessons/${LESSON_READING_ONLY}/read`, {
      headers: { origin: BASE_URL },
    });
    expect(readResponse.status()).toBe(200);

    const completeResponse = await context.post(`/api/lessons/${LESSON_READING_ONLY}/complete`, {
      headers: { origin: BASE_URL },
    });
    expect(completeResponse.status()).toBe(200);
    const body = (await completeResponse.json()) as { success?: boolean };
    expect(body.success).toBe(true);
    await context.dispose();
  });

  test("completing an already completed lesson is idempotent", async () => {
    const context = await signInStudent();
    const response = await context.post(`/api/lessons/${LESSON_READING_ONLY}/complete`, {
      headers: { origin: BASE_URL },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { success?: boolean };
    expect(body.success).toBe(true);
    await context.dispose();
  });
});
