import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "playwright/.auth/student.json" });

const BOOK_TITLE = "FCE Practice Book 1";
const BOOK_ID = "00000000-0000-0000-0000-000000000010";
const STUDENT_ID = "00000000-0000-0000-0000-000000000002";
const CHAPTER_1_TITLE = "Chapter 1: Tenses Review";
const LESSON_1_ID = "00000000-0000-0000-0000-000000000030";
const LESSON_IDS = [
  "00000000-0000-0000-0000-000000000030",
  "00000000-0000-0000-0000-000000000031",
  "00000000-0000-0000-0000-000000000032",
  "00000000-0000-0000-0000-000000000033",
  "00000000-0000-0000-0000-000000000034",
];

test.describe.configure({ mode: "serial" });

const SEED_CLOSED_ANSWERS: Record<string, { exerciseId: string; answer: string }[]> = {
  "00000000-0000-0000-0000-000000000030": [{ exerciseId: "00000000-0000-0000-0000-000000000040", answer: "A: went" }],
  "00000000-0000-0000-0000-000000000031": [{ exerciseId: "00000000-0000-0000-0000-000000000041", answer: "went" }],
  "00000000-0000-0000-0000-000000000033": [{ exerciseId: "00000000-0000-0000-0000-000000000042", answer: "true" }],
  "00000000-0000-0000-0000-000000000034": [
    { exerciseId: "00000000-0000-0000-0000-000000000043", answer: "She has too little money." },
  ],
};

async function completeLesson(page: Page, lessonId: string) {
  const origin = "http://localhost:4321";
  const exercises = SEED_CLOSED_ANSWERS[lessonId] ?? [];
  const result = await page.evaluate<
    { status: number; body: string },
    { id: string; origin: string; exercises: { exerciseId: string; answer: string }[] }
  >(
    async ({ id, origin: o, exercises: exs }) => {
      const headers = { Origin: o, Referer: o };
      for (const { exerciseId, answer } of exs) {
        const verifyResponse = await fetch("/api/exercises/verify", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ exercise_id: exerciseId, answer }),
        });
        if (!verifyResponse.ok) {
          return { status: verifyResponse.status, body: await verifyResponse.text() };
        }
      }
      const readResponse = await fetch(`/api/lessons/${id}/read`, { method: "POST", headers });
      if (!readResponse.ok && readResponse.status !== 409) {
        return { status: readResponse.status, body: await readResponse.text() };
      }
      const completeResponse = await fetch(`/api/lessons/${id}/complete`, { method: "POST", headers });
      return { status: completeResponse.status, body: await completeResponse.text() };
    },
    { id: lessonId, origin, exercises },
  );
  expect(result.status).toBe(200);
}

test.describe("student profile", () => {
  test.beforeAll(async ({ browser }) => {
    const adminContext = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin/users");
    await expect(adminPage.getByRole("main").getByRole("heading", { name: "Użytkownicy" })).toBeVisible();

    const grantResponse = await adminContext.request.post(`/api/admin/users/${STUDENT_ID}/grant`, {
      data: { book_id: BOOK_ID },
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4321",
        Referer: "http://localhost:4321/admin/users",
      },
    });
    expect(grantResponse.status()).toBe(200);

    await adminContext.close();
  });

  test("redirects anonymous users to sign in", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();

    await page.goto("/student/profile");
    await expect(page).toHaveURL("/auth/signin");

    await context.close();
  });

  test("shows student email and books", async ({ page }) => {
    await page.goto("/student/profile");
    await expect(page.getByRole("heading", { name: "Profil", level: 1 })).toBeVisible();

    await expect(page.getByRole("paragraph").filter({ hasText: "student@bet.local" })).toBeVisible();
    await expect(page.getByRole("heading", { name: BOOK_TITLE, level: 2 })).toBeVisible();
  });

  test("shows progress bars and percentages after completing a lesson", async ({ page }) => {
    await page.goto("/student/profile");
    await completeLesson(page, LESSON_1_ID);
    await page.reload();

    await expect(page.getByText(/Postęp w książce/)).toBeVisible();
    await expect(page.getByText(/\d+%/)).toBeVisible();
    await expect(page.getByText(CHAPTER_1_TITLE)).toBeVisible();
  });

  test("shows completed lessons as links to /lessons/{id}", async ({ page }) => {
    await page.goto("/student/profile");

    const lessonLink = page.getByRole("link", { name: "Lekcja 1" }).first();
    await expect(lessonLink).toBeVisible();
    await expect(lessonLink).toHaveAttribute("href", `/lessons/${LESSON_1_ID}`);

    await lessonLink.click();
    await page.waitForURL(`/lessons/${LESSON_1_ID}`);
    await expect(page).toHaveURL(`/lessons/${LESSON_1_ID}`);
  });

  test("shows book completion message when all lessons are completed", async ({ page }) => {
    await page.goto("/student/profile");
    for (const lessonId of LESSON_IDS) {
      await completeLesson(page, lessonId);
    }
    await page.reload();

    await expect(page.getByText("Gratulacje, książka ukończona!")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
  });
});
