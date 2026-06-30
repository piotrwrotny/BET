import { test, expect, type Page } from "@playwright/test";

test.setTimeout(60000);

const CHAPTER_ID = "00000000-0000-0000-0000-000000000020";
const createdLessonIds: string[] = [];

test.afterEach(async ({ browser }) => {
  const adminContext = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
  for (const lessonId of createdLessonIds) {
    const res = await adminContext.request.delete(`/api/admin/lessons/${lessonId}`, {
      headers: { Origin: "http://localhost:4321" },
    });
    if (!res.ok()) {
      console.warn("cleanup delete failed for lesson", lessonId, res.status());
    }
  }
  createdLessonIds.length = 0;
  await adminContext.close();
});

async function createTestLesson(adminPage: Page): Promise<string> {
  const timestamp = Date.now();
  const title = `S07 Lesson ${timestamp}`;
  const content = "# S07E2E\nSentence transformation and open-ended exercises.";

  await adminPage.goto(`/admin/lessons/new?chapter_id=${CHAPTER_ID}`);

  const result = await adminPage.evaluate(
    async ({ chapterId, title: lessonTitle, content: lessonContent }) => {
      const form = new FormData();
      form.append("chapter_id", chapterId);
      form.append("title", lessonTitle);
      form.append("content", lessonContent);
      const res = await fetch("/api/admin/lessons", {
        method: "POST",
        headers: { Origin: "http://localhost:4321" },
        body: form,
        redirect: "follow",
      });
      return { status: res.status, url: res.url };
    },
    { chapterId: CHAPTER_ID, title, content },
  );

  if (result.status !== 200) {
    throw new Error(`Lesson creation failed: ${result.status} ${result.url}`);
  }

  await adminPage.goto(result.url);
  const row = adminPage.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  const exercisesLink = row.getByRole("link", { name: "Ćwiczenia" });
  await expect(exercisesLink).toBeVisible();
  const href = await exercisesLink.getAttribute("href");
  if (!href) throw new Error("Lesson exercises link missing href");
  const lessonId = href.replace("/admin/exercises?lesson_id=", "");
  createdLessonIds.push(lessonId);
  return lessonId;
}

async function createSentenceTransformation(adminPage: Page, lessonId: string) {
  const result = await adminPage.evaluate(
    async ({ lesson_id }) => {
      const res = await fetch("/api/admin/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:4321" },
        body: JSON.stringify({
          lesson_id,
          type: "sentence_transformation",
          prompt: "Transform the sentence keeping the meaning the same.",
          payload: { original: "She doesn't have enough money." },
          keys: ["She has too little money.", "She lacks enough money."],
        }),
      });
      return { status: res.status, text: await res.text() };
    },
    { lesson_id: lessonId },
  );

  if (result.status !== 200) {
    throw new Error(`Sentence transformation creation failed: ${result.status} ${result.text}`);
  }
}

async function createOpenEnded(adminPage: Page, lessonId: string) {
  const result = await adminPage.evaluate(
    async ({ lesson_id }) => {
      const res = await fetch("/api/admin/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:4321" },
        body: JSON.stringify({
          lesson_id,
          type: "open_ended",
          prompt: "Describe your typical morning routine in 3-4 sentences (use Present Simple).",
          payload: {},
          keys: ["I usually wake up at 7 AM and drink coffee."],
        }),
      });
      return { status: res.status, text: await res.text() };
    },
    { lesson_id: lessonId },
  );

  if (result.status !== 200) {
    throw new Error(`Open-ended creation failed: ${result.status} ${result.text}`);
  }
}

test.describe.configure({ mode: "serial" });

test.describe("sentence transformation and open-ended exercises", () => {
  test("admin creates S-07 exercises and student solves the lesson", async ({ page, browser }) => {
    const lessonId = await createTestLesson(page);
    await createSentenceTransformation(page, lessonId);
    await createOpenEnded(page, lessonId);

    await page.goto(`/admin/exercises?lesson_id=${lessonId}`);
    await expect(page.getByText("Transform the sentence keeping the meaning the same.", { exact: true })).toBeVisible();
    await expect(page.getByText("Describe your typical morning routine")).toBeVisible();

    const studentContext = await browser.newContext({
      storageState: "playwright/.auth/student.json",
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/lessons/${lessonId}`);
    await studentPage.waitForLoadState("networkidle");

    const stPrompt = "Transform the sentence keeping the meaning the same.";
    const oePrompt = "Describe your typical morning routine in 3-4 sentences (use Present Simple).";
    await expect(studentPage.getByText(stPrompt, { exact: true })).toBeVisible();
    await expect(studentPage.getByText(oePrompt, { exact: true })).toBeVisible();

    const markRead = studentPage.getByRole("button", { name: "Przeczytano" });
    await expect(markRead).toBeDisabled();

    const transformInput = studentPage.getByPlaceholder("Wpisz przekształcone zdanie");
    await transformInput.fill("This is wrong");
    await studentPage.getByRole("button", { name: "Sprawdź" }).first().click();
    await expect(studentPage.getByText("✗ Niepoprawnie — spróbuj ponownie.", { exact: true })).toBeVisible();

    await transformInput.fill("She has too little money.");
    await studentPage.getByRole("button", { name: "Sprawdź" }).first().click();
    await expect(studentPage.getByText("✓ Poprawnie!", { exact: true })).toBeVisible();

    await studentPage.getByRole("button", { name: "Pokaż wzorzec" }).click();
    await expect(studentPage.getByText("I usually wake up at 7 AM and drink coffee.", { exact: true })).toBeVisible();

    await expect(markRead).toBeEnabled();
    await markRead.click();
    await expect(studentPage.getByText("✓ Ukończona")).toBeVisible();

    await studentContext.close();
  });
});
