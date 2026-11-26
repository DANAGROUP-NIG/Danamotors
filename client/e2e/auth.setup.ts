import fs from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { ACCOUNTS, authFile, passwordFor, type Role } from "./support/accounts";

/** A saved session that the API still accepts, so the rate-limited sign-in is not repeated. */
async function savedSessionWorks(role: Role, request: import("@playwright/test").APIRequestContext) {
  if (!fs.existsSync(authFile(role))) return false;
  const state = JSON.parse(fs.readFileSync(authFile(role), "utf8")) as { cookies: { name: string; value: string }[] };
  const token = state.cookies.find((cookie) => cookie.name.endsWith("access_token"))?.value;
  if (!token) return false;
  const response = await request.get("/api/auth/me", { headers: { authorization: `Bearer ${token}` } });
  return response.ok();
}

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`sign in as ${role}`, async ({ page, request }) => {
    if (await savedSessionWorks(role, request)) return;
    await page.goto("/login");
    // The dev server compiles on first visit; wait until React has taken over the form.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(ACCOUNTS[role]);
    await page.getByLabel("Password", { exact: true }).fill(passwordFor(ACCOUNTS[role]));
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 60_000 });
    await page.context().storageState({ path: authFile(role) });
  });
}

// A freshly copied database and a just-started dev API are slow on their first queries; warm them
// so the first test's save does not hit the 5-second transaction limit.
setup("warm up the API", async ({ request }) => {
  const state = JSON.parse(fs.readFileSync(authFile("admin"), "utf8")) as { cookies: { name: string; value: string }[] };
  const headers = { authorization: `Bearer ${state.cookies.find((cookie) => cookie.name.endsWith("access_token"))?.value}` };
  for (const url of ["/api/service/job-cards?limit=20", "/api/document-terms?documentType=JOB_CARD", "/api/service/appointments?limit=20", "/api/notifications?limit=5"])
    await request.get(url, { headers });
});
