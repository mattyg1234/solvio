import { expect, test } from "@playwright/test";

test("homepage shows hero headline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /never miss another booking/i })).toBeVisible();
});
