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

const SAME_ORIGIN_HEADERS = {
  Origin: BASE_URL,
  Referer: BASE_URL,
};

test.describe("lesson completion gating", () => {
  test("reading-only lesson can be completed after reading confirmation", async () => {
    const studentContext = await signInStudent();
    const readResponse = await studentContext.post(`/api/lessons/${LESSON_READING_ONLY}/read`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(readResponse.status()).toBe(200);

    const completeResponse = await studentContext.post(`/api/lessons/${LESSON_READING_ONLY}/complete`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(completeResponse.status()).toBe(200);
    const body = (await completeResponse.json()) as { success?: boolean };
    expect(body.success).toBe(true);
    await studentContext.dispose();
  });

  test("lesson with closed + open exercises cannot be completed without reading confirmation", async () => {
    const studentContext = await signInStudent();
    const response = await studentContext.post(`/api/lessons/${LESSON_CLOSED_PLUS_OPEN}/complete`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(response.status()).toBe(409);
    await studentContext.dispose();
  });

  test("server rejects completion when closed exercises are unsolved even after reading confirmation", async () => {
    const studentContext = await signInStudent();
    const readResponse = await studentContext.post(`/api/lessons/${LESSON_CLOSED_PLUS_OPEN}/read`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(readResponse.status()).toBe(200);

    const response = await studentContext.post(`/api/lessons/${LESSON_CLOSED_PLUS_OPEN}/complete`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(response.status()).toBe(409);
    await studentContext.dispose();
  });

  test("lesson can be completed after solving closed exercise and confirming reading", async () => {
    const studentContext = await signInStudent();
    const verifyResponse = await studentContext.post("/api/exercises/verify", {
      data: {
        exercise_id: "00000000-0000-0000-0000-000000000043",
        answer: "She has too little money.",
      },
      headers: {
        Origin: BASE_URL,
        Referer: `${BASE_URL}/lessons/${LESSON_CLOSED_PLUS_OPEN}`,
      },
    });
    expect(verifyResponse.status()).toBe(200);
    const verifyBody = (await verifyResponse.json()) as { correct?: boolean };
    expect(verifyBody.correct).toBe(true);

    const readResponse = await studentContext.post(`/api/lessons/${LESSON_CLOSED_PLUS_OPEN}/read`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(readResponse.status()).toBe(200);

    const completeResponse = await studentContext.post(`/api/lessons/${LESSON_CLOSED_PLUS_OPEN}/complete`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(completeResponse.status()).toBe(200);
    const completeBody = (await completeResponse.json()) as { success?: boolean };
    expect(completeBody.success).toBe(true);
    await studentContext.dispose();
  });

  test("completion is idempotent", async () => {
    const studentContext = await signInStudent();
    const firstComplete = await studentContext.post(`/api/lessons/${LESSON_READING_ONLY}/complete`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(firstComplete.status()).toBe(200);
    const secondComplete = await studentContext.post(`/api/lessons/${LESSON_READING_ONLY}/complete`, {
      headers: SAME_ORIGIN_HEADERS,
    });
    expect(secondComplete.status()).toBe(200);
    await studentContext.dispose();
  });
});
