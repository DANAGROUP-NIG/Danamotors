import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./e2e/support/env";

/**
 * Browser tests for the staged job card (job card revamp). They run against a disposable local
 * database copied from a seeded template, the API and the Next dev server. See e2e/README.md.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  outputDir: "./e2e/.results",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "./e2e/.report", open: "never" }]],
  use: {
    baseURL: E2E.clientUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Africa/Lagos",
    locale: "en-GB",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", dependencies: ["setup"], testIgnore: /auth\.setup\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      // The API on the e2e database (recreated by the global setup before every run).
      command: `node e2e/support/reset-db.mjs && cd ../server && PORT=${E2E.apiPort} CLIENT_URL=${E2E.clientUrl} DATABASE_URL=${E2E.databaseUrl} npx ts-node --transpile-only src/server.ts`,
      url: `http://localhost:${E2E.apiPort}/api/health`,
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 180_000,
      stdout: "ignore",
    },
    {
      command: `NEXT_PUBLIC_API_URL=http://localhost:${E2E.apiPort} npx next dev --port ${E2E.clientPort}`,
      url: E2E.clientUrl + "/login",
      reuseExistingServer: !!process.env.E2E_REUSE,
      timeout: 240_000,
      stdout: "ignore",
    },
  ],
});
