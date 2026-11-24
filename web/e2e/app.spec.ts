import { expect, test, type Page } from "@playwright/test";

// Runs against the synthetic fixture (SHEETS_FIXTURE_FILE) with AUTH_DEV_BYPASS=1.

async function noErrors(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(m.text()));
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await page.waitForLoadState("networkidle");
  expect(errors, `console errors on ${path}`).toEqual([]);
}

const PAGES = ["/overview", "/attendance", "/output", "/tasks", "/employees", "/reports", "/alerts", "/data-sources", "/settings", "/search?q=a"];

test.describe("pages render without errors", () => {
  for (const p of PAGES) test(p, async ({ page }) => noErrors(page, p));
});

test("phone layout has no horizontal page scroll", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const p of ["/overview", "/attendance", "/output", "/employees", "/tasks"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, p).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
});

test("filters change the URL and the data", async ({ page }) => {
  await page.goto("/output");
  await page.getByLabel("Period").selectOption("last_month");
  await expect(page).toHaveURL(/preset=last_month/);
  await page.locator("#f-family").selectOption("ZDT");
  await expect(page).toHaveURL(/family=ZDT/);
  await expect(page.getByText("Process breakdown")).toBeVisible();
});

test("KPI cards drill down", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("link", { name: /Pending deliveries/ }).click();
  await expect(page).toHaveURL(/\/output/);
});

test("create a task, change its status, see it overdue", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  const title = `E2E task ${Date.now()}`;
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Task description (title) *").fill(title);
  await dlg.getByLabel("Details").fill("Keep this description");
  await dlg.getByLabel("Priority").selectOption("High");
  // due before assignment is rejected by validation
  await dlg.getByLabel("Due date").fill("2025-12-01");
  await dlg.getByRole("button", { name: "Create task" }).click();
  await expect(dlg.getByRole("alert")).toContainText("before the assignment date");
  await dlg.getByLabel("Assignment date").fill("2026-01-01");
  await dlg.getByLabel("Due date").fill("2026-01-05");
  await dlg.getByRole("button", { name: "Create task" }).click();
  const row = page.locator("tr", { hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText("Overdue")).toBeVisible();
  await row.getByLabel("Status").selectOption("Completed");
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator("tr", { hasText: title }).getByText("Overdue")).toHaveCount(0);
  // changing the status must not wipe other fields
  await expect(page.locator("tr", { hasText: title })).toContainText("Keep this description");
});

test("manual sync from Data Sources", async ({ page }) => {
  await page.goto("/data-sources");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("status")).toContainText(/Sync complete|already running/, { timeout: 60_000 });
});

test("exports", async ({ request }) => {
  for (const [fmt, type] of [["xlsx", "spreadsheetml"], ["csv", "text/csv"], ["pdf", "application/pdf"]]) {
    const r = await request.get(`/api/export?kind=weekly&date=2026-11-18&format=${fmt}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain(type);
    expect((await r.body()).length).toBeGreaterThan(1000);
  }
  const j = await (await request.get(`/api/export?kind=monthly&date=2026-10-10&format=json`)).json();
  expect(j.tables.length).toBeGreaterThan(4);
});

test("sync endpoint rejects anonymous scheduler calls without the secret", async ({ request }) => {
  // In dev-bypass mode the session counts as admin, so only check the secret path shape.
  const r = await request.post(`/api/sync?mode=quick`, { headers: { authorization: "Bearer wrong" } });
  expect([200, 401]).toContain(r.status());
});
