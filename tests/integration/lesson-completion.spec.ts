import { expect, test, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

const STUDENT_EMAIL = "student@bet.local";
const STUDENT_PASSWORD = "student-pass";
const BASE_URL = "http://localhost:4321";

// Seeded lessons (see supabase/seed.sql):
// - 032 reading-only: zero exercises
// - 034 closed + open: one sentence_transformation + one open_ended
const LESSON_READING_ONLY = "00000000-0000-0000-0000-000000000032";
const LESSON_CLOSED_PLUS_OPEN = "00000000-0000-0000-0000-000000000034";

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

test.describe.configure({ mode: "serial" });

test.describe("lesson completion gating", () => {
  test("reading-only lesson can be completed without exercises", async () => {
    const studentContext = await signInStudent();
    const response = await studentContext.post(`/api/lessons/${LESSON_READING_ONLY}/complete`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { success?: boolean };
    expect(body.success).toBe(true);
    await studentContext.dispose();
  });

  test("lesson with closed + open exercises can be completed without solving (current server behaviour)", async () => {
    const studentContext = await signInStudent();
    const response = await studentContext.post(`/api/lessons/${LESSON_CLOSED_PLUS_OPEN}/complete`);
    // Server currently trusts the client; this test documents the gap described in Risk #6.
    expect(response.status()).toBe(200);
    await studentContext.dispose();
  });

  test("completion is idempotent", async () => {
    const studentContext = await signInStudent();
    const first = await studentContext.post(`/api/lessons/${LESSON_READING_ONLY}/complete`);
    expect(first.status()).toBe(200);
    const second = await studentContext.post(`/api/lessons/${LESSON_READING_ONLY}/complete`);
    expect(second.status()).toBe(200);
    await studentContext.dispose();
  });

  test.skip("server rejects completion when closed exercises are unsolved", () => {
    // Filled in once Risk #6 server-side gating is implemented.
  });
});
