import { defineConfig } from "@playwright/test";

// In-app data entry run: its own throw-away database and port, so the sheets-mode suite is untouched.
// rm -rf .data/e2e-inapp before each run (the spec switches the app to in-app mode).
const PORT = 3101;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /in-app\.spec\.ts/,
  timeout: 90_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PGLITE_DIR: ".data/e2e-inapp", DEV_USER_EMAIL: "dev.admin@zeitview.com", ALLOWED_EMAIL_DOMAIN: "zeitview.com" },
  },
});
