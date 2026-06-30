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

interface ExerciseFixture {
  type: string;
  prompt: string;
  answer: string;
  fillForm: (page: Page) => Promise<void>;
  solve: (page: Page) => Promise<void>;
}

async function createTestLesson(adminPage: Page): Promise<string> {
  const timestamp = Date.now();
  const title = `S06 Lesson ${timestamp}`;
  const content = "# S06E2E\nSolve all exercises.";

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

async function createExercise(adminPage: Page, lessonId: string, fixture: ExerciseFixture) {
  const payload =
    fixture.type === "matching"
      ? { pairs: [
          { left: "cat", right: "kot" },
          { left: "dog", right: "pies" },
        ] }
      : {};
  const keys =
    fixture.type === "fill_in_blank"
      ? ["went"]
      : fixture.type === "true_false"
        ? [fixture.answer]
        : [fixture.answer];

  const result = await adminPage.evaluate(
    async ({ lesson_id, type, prompt, payload: p, keys: k }) => {
      const res = await fetch("/api/admin/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:4321" },
        body: JSON.stringify({ lesson_id, type, prompt, payload: p, keys: k }),
      });
      return { status: res.status, text: await res.text() };
    },
    { lesson_id: lessonId, type: fixture.type, prompt: fixture.prompt, payload, keys },
  );

  if (result.status !== 200) {
    throw new Error(`Exercise creation failed: ${result.status} ${result.text}`);
  }
}

const FIB_FIXTURE: ExerciseFixture = {
  type: "fill_in_blank",
  prompt: "She _____ to school yesterday.",
  answer: "went",
  fillForm: async (page) => {
    await page.getByPlaceholder("Odpowiedź 1").waitFor();
    await page.getByPlaceholder("Odpowiedź 1").fill("went");
  },
  solve: async (page) => {
    const input = page.getByPlaceholder("Wpisz brakujące słowo").first();
    await input.fill("went");
    await input.press("Tab");
    const submit = page.getByRole("button", { name: "Sprawdź" }).first();
    await expect(submit).toBeEnabled();
    await submit.click();
  },
};

const TF_FIXTURE: ExerciseFixture = {
  type: "true_false",
  prompt: "The Present Perfect describes actions that continue into the present.",
  answer: "true",
  fillForm: async (page) => {
    await page.getByRole("radio", { name: "Prawda" }).check();
  },
  solve: async (page) => {
    await page.getByText("Prawda").first().click();
    const submit = page.getByRole("button", { name: "Sprawdź" }).first();
    await expect(submit).toBeEnabled();
    await submit.click();
  },
};

const MATCHING_FIXTURE: ExerciseFixture = {
  type: "matching",
  prompt: "Match the words.",
  answer: '{"0":"1","1":"0"}',
  fillForm: async (page) => {
    const leftInputs = page.getByPlaceholder(/Lewa \d/);
    const rightInputs = page.getByPlaceholder(/Prawa \d/);
    await leftInputs.nth(0).fill("cat");
    await rightInputs.nth(0).fill("kot");
    await leftInputs.nth(1).fill("dog");
    await rightInputs.nth(1).fill("pies");
    await page.getByLabel(/Poprawna mapa/).fill('{"0":"1","1":"0"}');
  },
  solve: async (page) => {
    const connect = async (left: string, right: string) => {
      await page.getByRole("button", { name: left }).first().click();
      await page.getByRole("button", { name: right }).first().click();
      const connectBtn = page.getByRole("button", { name: /Połącz:/ }).first();
      await expect(connectBtn).toBeVisible();
      await connectBtn.click();
    };
    await connect("cat", "pies");
    await expect(page.getByText("cat ↔ pies")).toBeVisible();
    await connect("dog", "kot");
    await expect(page.getByText("dog ↔ kot")).toBeVisible();
    const submit = page.getByRole("button", { name: "Sprawdź" }).first();
    await expect(submit).toBeEnabled();
    await submit.click();
  },
};

async function solveAll(studentPage: Page, fixtures: ExerciseFixture[]) {
  for (const fixture of fixtures) {
    await expect(studentPage.getByText(fixture.prompt).first()).toBeVisible();
    await fixture.solve(studentPage);
    await expect(studentPage.getByText("✓ Poprawnie!").first()).toBeVisible();
  }
}

test.describe("closed exercise types", () => {
  let lessonId: string;
  let fixtures: ExerciseFixture[];

  test("admin creates fill-in-blank, true/false and matching exercises", async ({ page, browser }) => {
    fixtures = [FIB_FIXTURE, TF_FIXTURE, MATCHING_FIXTURE];
    lessonId = await createTestLesson(page);

    for (const fixture of fixtures) {
      await createExercise(page, lessonId, fixture);
    }

    // Verify all three appear in the exercise list
    await page.goto(`/admin/exercises?lesson_id=${lessonId}`);
    for (const fixture of fixtures) {
      await expect(page.getByText(fixture.prompt.slice(0, 40))).toBeVisible();
    }

    // Student solves the lesson in a fresh browser context
    const studentContext = await browser.newContext({
      storageState: "playwright/.auth/student.json",
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/lessons/${lessonId}`);
    await studentPage.waitForLoadState("networkidle");

    await solveAll(studentPage, fixtures);

    const markRead = studentPage.getByRole("button", { name: "Przeczytano" });
    await expect(markRead).toBeEnabled();
    await markRead.click();
    await expect(studentPage.getByText("✓ Ukończona")).toBeVisible();

    // Review mode: correct answers are visible
    await studentPage.reload();
    for (const fixture of fixtures) {
      await expect(studentPage.getByText(fixture.prompt, { exact: true })).toBeVisible();
    }

    await studentContext.close();
  });

  test("lesson does not complete before all closed exercises are solved", async ({ page, browser }) => {
    const partialFixtures = [FIB_FIXTURE, TF_FIXTURE];
    const partialLessonId = await createTestLesson(page);

    for (const fixture of partialFixtures) {
      await createExercise(page, partialLessonId, fixture);
    }

    const studentContext = await browser.newContext({
      storageState: "playwright/.auth/student.json",
    });
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/lessons/${partialLessonId}`);
    await studentPage.waitForLoadState("networkidle");

    // Solve only the first exercise
    await expect(studentPage.getByText(FIB_FIXTURE.prompt).first()).toBeVisible();
    await FIB_FIXTURE.solve(studentPage);

    // Completion should be blocked until every closed exercise is solved
    await expect(studentPage.getByRole("button", { name: "Przeczytano" })).toBeDisabled();

    await studentContext.close();
  });
});
