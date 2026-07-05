import { test, expect } from "@playwright/test";

test("admin users page lists students and assigned books", async ({ page }) => {
  await page.goto("/admin/users");

  await expect(page.getByRole("main").getByRole("heading", { name: "Użytkownicy" })).toBeVisible();
  await expect(page.getByRole("main").getByText("student@bet.local", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("student", { exact: true })).toBeVisible();
});
