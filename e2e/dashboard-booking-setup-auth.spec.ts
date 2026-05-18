import { expect, test } from "@playwright/test";

/**
 * Logs in via Supabase (same as production /login).
 * Requires env vars locally or in CI secrets — never commit passwords.
 *
 * PLAYWRIGHT_DASHBOARD_EMAIL
 * PLAYWRIGHT_DASHBOARD_PASSWORD
 */
test("dashboard: booking setup wizard reachable after login", async ({ page }) => {
  const email = process.env.PLAYWRIGHT_DASHBOARD_EMAIL?.trim();
  const password = process.env.PLAYWRIGHT_DASHBOARD_PASSWORD;
  test.skip(!email || !password, "Set PLAYWRIGHT_DASHBOARD_EMAIL and PLAYWRIGHT_DASHBOARD_PASSWORD to run.");

  await page.goto("/login");

  await page.fill("#login-email", email);
  await page.fill("#login-password", password);

  await page.getByRole("button", { name: /^Log in$/i }).click();

  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 });

  await page.goto("/dashboard/setup/bookings");

  await expect(page.getByRole("heading", { level: 1, name: /take bookings/i })).toBeVisible({ timeout: 15_000 });
});
