# Browser tests (Playwright)

Screen tests for the staged job card (job card revamp). They drive Chromium through the real
screens: the job card list, the job card frame and check-in, as each phase's manual test guide
describes. Run them for every phase that changes a screen.

## What they need

- The local Postgres in Docker (container `dana-jobflow-pg`, port 55433) with a **template
  database** that has the base seed and the demo seed (`dana_demo_p4` by default). Build one with
  `npx prisma migrate deploy`, `npm run prisma:seed` and
  `npm run prisma:seed:demo -- --second-branch="Abuja Branch" --allow-database=<name>` from `server/`.
- Chromium for Playwright, once: `npx playwright install chromium`.

Every run recreates the `dana_e2e` database from the template (localhost only), so tests always
start from the same demo data. Never point these variables at a shared database.

| Variable | Default |
|---|---|
| `E2E_DB_SERVER` | `postgresql://dana:jobflow@localhost:55433` |
| `E2E_TEMPLATE_DB` | `dana_demo_p4` |
| `E2E_DB` | `dana_e2e` |
| `E2E_API_PORT`, `E2E_CLIENT_PORT` | `5055`, `3055` |

## Run

```sh
cd client
npx playwright test                 # starts the API and the Next dev server, then runs everything
E2E_REUSE=1 npx playwright test     # reuse an API and dev server you already started on those ports
npx playwright show-report e2e/.report
```

Sign-in is rate limited (20 tries in 15 minutes). The setup project signs each role in once and
reuses the saved session; tests call the API with that session and never sign in again.
Screenshots for phase reports are saved to `e2e/.results/screens/`.
