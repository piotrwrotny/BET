import { test, expect, type Page } from "@playwright/test";

// M3L5 debug drill: reproduces a swallowed-error bug in the lesson completion endpoint.
// Symptom: marking a lesson as "Przeczytano" returns 200, but after reload the lesson is not completed.
// Risk: write failures in `lesson_progress` are silently swallowed instead of propagated.

test.use({ storageState: "playwright/.auth/admin.json" });

test.setTimeout(60000);

const CHAPTER_ID = "00000000-0000-0000-0000-000000000020";

let lessonId = "";
let lessonTitle = "";

test.afterEach(async ({ browser }) => {
  if (!lessonId) return;

  const adminContext = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
  try {
    const res = await adminContext.request.delete(`/api/admin/lessons/${lessonId}`, {
      headers: { Origin: "http://localhost:4321" },
    });
    if (!res.ok()) {
      console.warn("cleanup delete failed for lesson", lessonId, res.status());
    }
  } finally {
    await adminContext.close();
  }
});

async function createLessonViaApi(adminPage: Page): Promise<string> {
  lessonTitle = `E2E completion ${Date.now()}`;
  const content = "# E2E\nCompletion persistence test.";

  await adminPage.goto(`/admin/lessons/new?chapter_id=${CHAPTER_ID}`);

  const result = await adminPage.evaluate(
    async ({ chapterId, title, content: lessonContent }) => {
      const form = new FormData();
      form.append("chapter_id", chapterId);
      form.append("title", title);
      form.append("content", lessonContent);
      const res = await fetch("/api/admin/lessons", {
        method: "POST",
        headers: { Origin: "http://localhost:4321" },
        body: form,
        redirect: "follow",
      });
      return { status: res.status, url: res.url };
    },
    { chapterId: CHAPTER_ID, title: lessonTitle, content },
  );

  if (result.status !== 200) {
    throw new Error(`Lesson creation failed: ${result.status} ${result.url}`);
  }

  await adminPage.goto(result.url);
  const row = adminPage.getByRole("row").filter({ hasText: lessonTitle });
  await expect(row).toBeVisible();
  const exercisesLink = row.getByRole("link", { name: "Ćwiczenia" });
  await expect(exercisesLink).toBeVisible();
  const href = await exercisesLink.getAttribute("href");
  if (!href) throw new Error("Lesson exercises link missing href");

  return href.replace("/admin/exercises?lesson_id=", "");
}

test("marking a lesson as read persists after page reload", async ({ page, browser }) => {
  lessonId = await createLessonViaApi(page);

  const studentContext = await browser.newContext({ storageState: "playwright/.auth/student.json" });
  const studentPage = await studentContext.newPage();

  try {
    await studentPage.goto(`/lessons/${lessonId}`);

    const markReadButton = studentPage.getByRole("button", { name: "Przeczytano" });
    await expect(markReadButton).toBeEnabled();
    await markReadButton.click();

    const completionBadge = studentPage.getByRole("main").getByText("✓ Ukończona");
    await expect(completionBadge).toBeVisible();

    // Core assertion: the persisted completion survives a full reload.
    await studentPage.reload();
    await expect(completionBadge).toBeVisible();
  } finally {
    await studentContext.close();
  }
});
