import { test, expect, type APIRequestContext } from "@playwright/test";

const BOOK_ID = "00000000-0000-0000-0000-000000000010";
const BOOK_TITLE = "FCE Practice Book 1";

interface UserWithAccess {
  id: string;
  email: string;
  role: string;
  books: { book_id: string; title: string }[];
}

async function findFirstStudent(request: APIRequestContext): Promise<UserWithAccess> {
  const response = await request.get("/api/admin/users?page=1&per_page=100", {
    headers: { Origin: "http://localhost:4321" },
  });
  const payload = (await response.json()) as { users?: UserWithAccess[] };
  const user = payload.users?.find((u) => u.role === "student");
  if (!user) {
    throw new Error("No student found in users list");
  }
  return user;
}

async function revokeBook(request: APIRequestContext, userId: string) {
  return request.delete(`/api/admin/users/${userId}/revoke?book_id=${BOOK_ID}`, {
    headers: { Origin: "http://localhost:4321" },
  });
}

async function grantBook(request: APIRequestContext, userId: string) {
  return request.post(`/api/admin/users/${userId}/grant`, {
    data: { book_id: BOOK_ID },
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4321" },
  });
}

test.describe("admin user management", () => {
  test("lists only students with role", async ({ page }) => {
    await page.goto("/admin/users");

    await expect(page.getByRole("main").getByRole("heading", { name: "Użytkownicy" })).toBeVisible();
    await expect(page.getByRole("table").getByText("admin@bet.local")).not.toBeVisible();
  });

  test("admin can grant a book to a student", async ({ page, request }) => {
    const student = await findFirstStudent(request);
    await revokeBook(request, student.id);

    await page.goto("/admin/users");
    const row = page.locator("tr", { hasText: student.email });

    await row.getByRole("combobox").click();
    const grantResponse = page.waitForResponse((res) => res.url().includes("/grant") && res.status() === 200);
    await page.getByRole("option", { name: BOOK_TITLE }).click();
    await grantResponse;

    await expect(row.getByText(BOOK_TITLE, { exact: true })).toBeVisible();

    await revokeBook(request, student.id);
  });

  test("admin can revoke a book from a student", async ({ page, request }) => {
    const student = await findFirstStudent(request);
    await grantBook(request, student.id);

    await page.goto("/admin/users");
    const row = page.locator("tr", { hasText: student.email });

    await expect(row.getByText(BOOK_TITLE, { exact: true })).toBeVisible();
    const revokeResponse = page.waitForResponse((res) => res.url().includes("/revoke") && res.status() === 200);
    await row.getByRole("button", { name: `Usuń: ${BOOK_TITLE}` }).click();
    await revokeResponse;
    await expect(row.getByText(BOOK_TITLE, { exact: true })).not.toBeVisible();

    await revokeBook(request, student.id);
  });

  test("pending filter shows only students without books", async ({ page, request }) => {
    const student = await findFirstStudent(request);
    await revokeBook(request, student.id);

    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Tylko oczekujący" }).click();
    await expect(page.getByRole("cell", { name: student.email })).toBeVisible();

    await grantBook(request, student.id);

    await page.goto("/admin/users");
    await page.getByRole("button", { name: "Tylko oczekujący" }).click();
    await expect(page.getByRole("cell", { name: student.email })).not.toBeVisible();

    await revokeBook(request, student.id);
  });
});
