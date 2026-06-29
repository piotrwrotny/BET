import { test, expect } from "@playwright/test";

test("non-admin is redirected from admin users", async ({ page }) => {
  await page.goto("/admin/users");
  await page.waitForURL("/dashboard");
  await expect(page).toHaveURL("/dashboard");
});
