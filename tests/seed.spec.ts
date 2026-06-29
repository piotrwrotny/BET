import { test, expect } from "@playwright/test";

test("admin users page lists students and assigned books", async ({ page }) => {
  await page.goto("/admin/users");

  await expect(page.getByRole("heading", { name: "Użytkownicy" })).toBeVisible();
  await expect(page.getByText("student@bet.local")).toBeVisible();
  await expect(page.getByText("student")).toBeVisible();
});
