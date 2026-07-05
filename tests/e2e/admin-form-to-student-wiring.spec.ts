import { test, expect, type Page, type Browser } from "@playwright/test";

test.setTimeout(60000);

// Risk #3 from context/foundation/test-plan.md:
// "New exercise-type wiring fails between admin form and student component"
// Contract: an exercise created through the admin form is visible, solvable,
// and correctly scored by the student component.

test.use({ storageState: "playwright/.auth/admin.json" });

const CHAPTER_ID = "00000000-0000-0000-0000-000000000020";
const BOOK_ID = "00000000-0000-0000-0000-000000000010";
const STUDENT_ID = "00000000-0000-0000-0000-000000000002";

let lessonId = "";
let lessonTitle = "";

test.beforeAll(async ({ browser }) => {
  const adminContext = await browser.newContext({ storageState: "playwright/.auth/admin.json" });
  try {
    const res = await adminContext.request.post(`/api/admin/users/${STUDENT_ID}/grant`, {
      data: { book_id: BOOK_ID },
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:4321",
        Referer: "http://localhost:4321/admin/users",
      },
    });
    expect([200, 409].includes(res.status())).toBe(true);
  } finally {
    await adminContext.close();
  }
});

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
  lessonTitle = `E2E wiring ${Date.now()}`;
  const content = "# E2E\nWiring test.";

  // Establish an origin for relative fetch calls.
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

async function createTrueFalseExercise(adminPage: Page, prompt: string, key: "true" | "false") {
  await adminPage.goto(`/admin/exercises/new?lesson_id=${lessonId}`);
  await adminPage.waitForLoadState("networkidle");

  const typeSelect = adminPage.getByRole("combobox", { name: "Typ ćwiczenia *" });
  await typeSelect.selectOption({ label: "Prawda / Fałsz (True/False)" });
  await typeSelect.evaluate((el: HTMLSelectElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, "true_false");
  await expect(adminPage.getByText("Poprawna odpowiedź *")).toBeVisible();

  await adminPage.getByRole("textbox", { name: "Treść ćwiczenia *" }).fill(prompt);
  const radio = adminPage.getByRole("radio", { name: key === "true" ? "Prawda" : "Fałsz" });
  await radio.check();
  await adminPage.getByRole("button", { name: "Utwórz ćwiczenie" }).click();

  await expect(adminPage.getByRole("row").filter({ hasText: prompt })).toBeVisible();
}

async function solveAsStudent(browser: Browser, lessonId: string, prompt: string, answerLabel: "Prawda" | "Fałsz") {
  const studentContext = await browser.newContext({ storageState: "playwright/.auth/student.json" });
  const studentPage = await studentContext.newPage();

  try {
    await studentPage.goto(`/lessons/${lessonId}`);
    await expect(studentPage.getByText(prompt)).toBeVisible();

    // The student radio inputs are visually hidden; click their visible labels.
    await studentPage.getByText(answerLabel).first().click();
    await studentPage.getByRole("button", { name: "Sprawdź" }).click();

    await expect(studentPage.getByText("✓ Poprawnie!")).toBeVisible();

    await expect(studentPage.getByRole("button", { name: "Przeczytano" })).toBeEnabled();
    await studentPage.getByRole("button", { name: "Przeczytano" }).click();
    await expect(studentPage.getByText("✓ Ukończona")).toBeVisible();
  } finally {
    await studentContext.close();
  }
}

test("true/false exercise created in admin form is solvable by a student", async ({ page, browser }) => {
  const prompt = "The E2E wiring test statement is true.";

  // Setup: create an isolated lesson via admin API.
  lessonId = await createLessonViaApi(page);

  // Action: create the exercise through the admin UI form.
  await createTrueFalseExercise(page, prompt, "true");

  // Assertion: the student sees the exercise, solves it correctly, and can complete the lesson.
  await solveAsStudent(browser, lessonId, prompt, "Prawda");
});
