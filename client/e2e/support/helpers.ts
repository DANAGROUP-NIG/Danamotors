import { expect, type APIRequestContext, type Browser, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import { authFile, type Role } from "./accounts";

/** A page signed in as a role, in its own browser context. */
export async function pageAs(browser: Browser, role: Role, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ storageState: authFile(role), viewport, timezoneId: "Africa/Lagos", locale: "en-GB" });
  return context.newPage();
}

/**
 * API calls as a role, reusing the session the setup project saved. The sign-in endpoint is
 * rate limited (20 tries in 15 minutes), so tests never sign in through the API.
 */
export async function apiAs(request: APIRequestContext, role: Role) {
  const state = JSON.parse(fs.readFileSync(authFile(role), "utf8")) as { cookies: { name: string; value: string }[] };
  const token = state.cookies.find((cookie) => cookie.name.endsWith("access_token"))?.value;
  if (!token) throw new Error(`No saved session for ${role}; run the setup project`);
  const headers = { authorization: `Bearer ${token}` };
  return {
    get: async <T = unknown>(url: string) => ((await (await request.get(`/api${url}`, { headers })).json()).data as T),
    put: async (url: string, data: unknown) => request.put(`/api${url}`, { headers, data }),
    post: async (url: string, data: unknown) => request.post(`/api${url}`, { headers, data }),
  };
}

/** The id of the demo job for a plate (newest first). */
export async function jobIdByPlate(request: APIRequestContext, plate: string): Promise<string> {
  const api = await apiAs(request, "advisor");
  const list = await api.get<{ jobCards: { id: string; vehicle?: { registrationNumber?: string | null } }[] }>(
    `/service/job-cards?search=${encodeURIComponent(plate)}&limit=10`,
  );
  const job = list.jobCards.find((row) => row.vehicle?.registrationNumber === plate);
  if (!job) throw new Error(`No job card for ${plate}`);
  return job.id;
}

const FORBIDDEN: [string, RegExp][] = [
  ["undefined", /\bundefined\b/],
  ["null", /\bnull\b/],
  ["NaN", /\bNaN\b/],
  ["raw code", /\b(CHECK_IN|QUALITY_CHECK|NOT_WORKING|THREE_QUARTER|IN_PROGRESS|WAITING_PARTS|SEND_TO_[A-Z_]+|WorkshopManager|ServiceAdviser)\b/],
  ["dash, middle dot or ellipsis", /[–—·…]/],
  ["replacement character", /�/],
  ["garbled naira", /â‚¦|Ã/],
  ["emoji", /\p{Extended_Pictographic}/u],
  ["question-mark placeholder", /(^|\s)\?(\s|$)/],
];

/** Fails when the visible page shows any of the always-wrong texts from AGENTS.md. */
export async function expectCleanText(page: Page, where: string, scope?: Locator) {
  // The page content and any open dialog (or just the given part); the app shell is checked on its own.
  const parts = await (scope ?? page.locator("main, [role=dialog]")).allInnerTexts();
  const text = parts.join("\n");
  const problems = FORBIDDEN.filter(([, rx]) => rx.test(text)).map(([name, rx]) => `${name}: "${text.match(rx)?.[0]}" near "${text.slice(Math.max(0, (text.match(rx)?.index ?? 0) - 40), (text.match(rx)?.index ?? 0) + 40).replace(/\s+/g, " ")}"`);
  expect(problems, `${where} shows forbidden text`).toEqual([]);
}

/** No sideways scrolling at the current width: neither the page nor the content area the app scrolls in. */
export async function expectNoHorizontalOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(() => {
    const page = document.documentElement.scrollWidth - window.innerWidth;
    const main = document.querySelector("main");
    return Math.max(page, main ? main.scrollWidth - main.clientWidth : 0);
  });
  // Name the outermost elements that stick out past the window or the content area and are not
  // clipped by a scrolling box inside it, with the boxes around the first one.
  const culprits =
    overflow > 1
      ? await page.evaluate(() => {
          const main = document.querySelector("main");
          const limit = Math.min(window.innerWidth, main ? main.getBoundingClientRect().right : window.innerWidth);
          const clipped = (element: Element) => {
            for (let parent = element.parentElement; parent && parent !== main; parent = parent.parentElement) {
              if (getComputedStyle(parent).overflowX !== "visible" && parent.getBoundingClientRect().right <= limit + 1) return true;
            }
            return false;
          };
          const label = (element: Element) => `${element.tagName.toLowerCase()}.${String(element.className).split(" ").slice(0, 8).join(".")}`;
          const width = main ? main.clientWidth : window.innerWidth;
          const wide = [...document.querySelectorAll("body *")].filter((element) => {
            const box = element.getBoundingClientRect();
            const inMain = !!main && main.contains(element);
            // Absolutely placed elements (screen reader labels, for example) escape a scrolling box that is not positioned.
            const escapes = ["absolute", "fixed"].includes(getComputedStyle(element).position);
            return (box.right > limit + 1 || box.left < -1 || (inMain && box.width > width + 1)) && box.width > 0 && (escapes || !clipped(element));
          });
          const outer = wide.filter((element) => !wide.includes(element.parentElement as Element)).slice(0, 3);
          const chain: string[] = [];
          for (let parent = outer[0]?.parentElement; parent && parent !== main && chain.length < 6; parent = parent.parentElement)
            chain.push(`${label(parent)}[${getComputedStyle(parent).overflowX}, right ${Math.round(parent.getBoundingClientRect().right)}]`);
          return [...outer.map((element) => `${label(element)} "${(element.textContent ?? "").trim().slice(0, 40)}" ${Math.round(element.getBoundingClientRect().left)} to ${Math.round(element.getBoundingClientRect().right)}`), `inside: ${chain.join(" < ")}`, `main scrolled ${main?.scrollLeft ?? 0}px, page scrolled ${window.scrollX}px, page ${document.documentElement.scrollWidth}px wide`];
        })
      : [];
  expect(overflow, `${where} scrolls sideways by ${overflow}px: ${culprits.join(" | ")}`).toBeLessThanOrEqual(1);
}

/** Saves a screenshot into the results folder, for the phase report. */
export async function shot(page: Page, name: string) {
  // The app scrolls inside its content area, so a full-page shot would be mostly blank.
  await page.screenshot({ path: `e2e/.results/screens/${name}.png` });
}

export const WIDTHS = [1440, 1024, 768, 390] as const;
