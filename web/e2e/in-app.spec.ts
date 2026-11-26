import { expect, test, type Page } from "@playwright/test";

// Full in-app flow on a fresh database: sync the fixture, go live (START FRESH), add yourself to the
// roster, log output, request + approve leave, log + approve OT, record inventory, mark attendance.

test.describe.configure({ mode: "serial" });

async function noErrors(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/favicon/.test(m.text()) && errors.push(m.text()));
  const res = await page.goto(path);
  expect(res?.status(), path).toBe(200);
  await page.waitForLoadState("networkidle");
  expect(errors, `console errors on ${path}`).toEqual([]);
}

test("go live with START FRESH", async ({ page }) => {
  await page.goto("/data-sources");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("status")).toContainText(/Sync complete/, { timeout: 90_000 });
  await page.goto("/settings#data-entry");
  const go = page.getByRole("button", { name: "Switch to in-app data entry" });
  await expect(go).toBeDisabled();
  await page.getByLabel("Type START FRESH to confirm").fill("START FRESH");
  await go.click();
  await expect(page.getByText("Live: everything is entered in this app")).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByRole("link", { name: /My workspace/ })).toBeVisible();
});

test("add yourself to the roster", async ({ page }) => {
  await page.goto("/people");
  await page.getByLabel("Name", { exact: true }).fill("Dev Admin");
  await page.getByLabel("Work email", { exact: true }).fill("dev.admin@zeitview.com");
  await page.getByLabel("Designation", { exact: true }).fill("Team Lead");
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByRole("status")).toContainText("Dev Admin saved");
  await expect(page.locator("tr", { hasText: "dev.admin@zeitview.com" })).toBeVisible();
});

test("log daily output and extra work", async ({ page }) => {
  await page.goto("/me");
  await page.getByLabel(/^Ext FQC/).fill("9");
  await page.getByLabel(/Extra tasks/).fill("Reviewed 2 reshoots");
  await page.getByRole("button", { name: "Save output" }).click();
  await expect(page.getByRole("status")).toContainText("Output saved");
  await page.reload();
  await expect(page.getByLabel(/^Ext FQC/)).toHaveValue("9");
  await expect(page.getByRole("button", { name: "Update output" })).toBeVisible();
});

test("request leave, then approve it", async ({ page }) => {
  await page.goto("/me");
  await page.getByLabel("Request", { exact: true }).selectOption("CL");
  await page.getByLabel("From", { exact: true }).fill("2026-12-02");
  await page.getByLabel("To", { exact: true }).fill("2026-12-02");
  await page.getByLabel("Reason", { exact: true }).fill("Family function");
  await page.getByRole("button", { name: "Send for approval" }).first().click();
  await expect(page.getByRole("status").first()).toContainText(/sent|approval/i);

  await page.goto("/approvals");
  const row = page.locator("tr", { hasText: "Family function" });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/me");
  await expect(page.locator("tr", { hasText: "CL" }).first()).toContainText("Approved");
});

test("log overtime, then approve it", async ({ page }) => {
  await page.goto("/me");
  await page.getByLabel("Date worked", { exact: true }).fill("2026-11-22");
  await page.getByLabel("Work done", { exact: true }).fill("Ext FQC");
  await page.getByLabel("Turbines delivered", { exact: true }).fill("8 FQC");
  await page.getByRole("button", { name: "Send for approval" }).nth(1).click();
  await expect(page.getByRole("status").filter({ hasText: /overtime|OT/i })).toBeVisible();
  await page.goto("/approvals");
  const row = page.locator("tr", { hasText: "8 FQC" });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(row).toHaveCount(0, { timeout: 30_000 });
});

test("record inventory", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByLabel("External Current inventory").fill("120");
  await page.getByLabel("External Uploaded").fill("15");
  await page.getByRole("button", { name: /Save inventory/ }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  // delivered comes from the 9 Ext FQC logged above
  await expect(page.getByLabel("External Delivered (leave empty = from FQC output)")).toHaveAttribute("placeholder", /9/);
});

test("mark attendance by hand", async ({ page }) => {
  await page.goto("/attendance");
  await page.getByLabel("Person", { exact: true }).selectOption({ label: "Dev Admin" });
  await page.getByLabel("Mark as", { exact: true }).selectOption("GWO Training");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("status")).toBeVisible();
});

for (const p of ["/me", "/approvals", "/inventory", "/people", "/settings", "/data-sources", "/overview", "/attendance", "/output", "/employees", "/reports", "/alerts"])
  test(`renders ${p}`, async ({ page }) => noErrors(page, p));

test("phone layout has no horizontal scroll on entry pages", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const p of ["/me", "/approvals", "/inventory", "/people"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, p).toBeLessThanOrEqual(0);
  }
});
