/**
 * Safety checks for the demo data seed. Pure functions, so they can be unit tested.
 *
 * The seed writes job cards, bills, receipts and stock movements through the app's own
 * services, so pointing it at the wrong database would be costly. It therefore runs only
 * when the target is clearly the Demo database, or when the operator names the database
 * explicitly with --allow-database.
 */

export interface DemoTarget {
  host: string;
  database: string;
}

export interface GuardInput {
  databaseUrl: string | undefined;
  nodeEnv: string | undefined;
  /** Value of --allow-database: must equal the target database name exactly. */
  allowDatabase?: string;
}

const PRODUCTION_NAME = /prod|live/i;
const DEMO_NAME = /demo/i;

export function assertDemoTarget(input: GuardInput): DemoTarget {
  if (!input.databaseUrl) throw new Error("DATABASE_URL is not set.");
  let url: URL;
  try {
    url = new URL(input.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL does not name a database.");
  const target = { host: url.hostname, database };

  if (PRODUCTION_NAME.test(database)) {
    throw new Error(`Refusing to seed "${database}": the name looks like a production database. The demo seed never runs against production.`);
  }
  if (DEMO_NAME.test(database)) return target;
  if (input.nodeEnv === "production") {
    throw new Error(`Refusing to seed "${database}" with NODE_ENV=production. In production mode only a database whose name contains "demo" can be seeded.`);
  }
  if (input.allowDatabase !== database) {
    throw new Error(
      `"${database}" is not a demo database (its name does not contain "demo"). ` +
        `If you are sure it is safe (not production, and agreed with the team for a shared database), re-run with --allow-database=${database}`,
    );
  }
  return target;
}

// CPD (store code DH), Kia Plaza (A) and VI exist in production only and must never get demo data.
const BLOCKED_BRANCH_NAME = /\bcpd\b|central parts|kia plaza|victoria island|^vi$/i;
const BLOCKED_BRANCH_CODES = new Set(["DH", "A", "VI"]);

export function assertDemoBranch(branch: { name: string; code: string | null }) {
  if (BLOCKED_BRANCH_NAME.test(branch.name.trim()) || (branch.code && BLOCKED_BRANCH_CODES.has(branch.code.trim().toUpperCase()))) {
    throw new Error(`Branch "${branch.name}" is a production store (CPD, Kia Plaza or VI). Choose a demo branch with --main-branch / --second-branch.`);
  }
}

/** Database and host only, never credentials, for logs. */
export function describeTarget(target: DemoTarget) {
  return `${target.database} on ${target.host}`;
}
