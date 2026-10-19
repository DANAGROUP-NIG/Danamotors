/**
 * Demo data seed: a small, repeatable set of dummy job cards, estimates, bills, part issues,
 * warranty cases (including TEST- cases) and campaigns for the Dana Motors Demo account.
 *
 *   npm run prisma:seed:demo                      load the demo data (safe to run again)
 *   npm run prisma:seed:demo -- --reset-test         put the TEST- warranty cases back to OPEN
 *
 * Options:
 *   --allow-database=<name>   required when the database name does not contain "demo"
 *   --main-branch=<name>      default "Main Branch"
 *   --second-branch=<name>    default "Dana Motors Demo"
 *
 * See doc/demo-data.md.
 */
import { allowSlowTransactions } from "./remote-db"; // first: before the app config loads
import dotenv from "dotenv";
dotenv.config();

import prisma from "../../../src/prisma/client";
import { assertDemoTarget, describeTarget } from "./guard";
import { ensureReference, loadContext } from "./context";
import { ensureParties } from "./parties";
import { JobResult, seedJob } from "./jobs";
import { seedCampaign } from "./campaigns";
import { resetTestCases } from "./reset";
import { printSummary } from "./summary";
import { CAMPAIGNS, DEMO_TAG, JOBS } from "./fixtures";

const USAGE = "Usage: npm run prisma:seed:demo -- [--reset-test] [--allow-database=<name>] [--main-branch=<name>] [--second-branch=<name>]";

function parseArgs(argv: string[]) {
  const options = { resetTest: false, allowDatabase: undefined as string | undefined, mainBranch: "Main Branch", secondBranch: "Dana Motors Demo", help: false };
  for (const arg of argv) {
    const [name, ...rest] = arg.split("=");
    const value = rest.join("=");
    if (name === "--reset-test" && !value) options.resetTest = true;
    else if (name === "--help" || name === "-h") options.help = true;
    else if (name === "--allow-database" && value) options.allowDatabase = value;
    else if (name === "--main-branch" && value) options.mainBranch = value;
    else if (name === "--second-branch" && value) options.secondBranch = value;
    else throw new Error(`Unknown option ${arg}\n${USAGE}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const target = assertDemoTarget({ databaseUrl: process.env.DATABASE_URL, nodeEnv: process.env.NODE_ENV, allowDatabase: options.allowDatabase });
  console.log(`${DEMO_TAG}: ${options.resetTest ? "resetting TEST- warranty cases in" : "loading demo data into"} ${describeTarget(target)}`);
  allowSlowTransactions(prisma);

  const ctx = await loadContext({ main: options.mainBranch, second: options.secondBranch });
  console.log(`Branches: ${ctx.branches.main.name}, ${ctx.branches.second.name}`);

  if (options.resetTest) {
    await resetTestCases(ctx.warrantyOfficer.id);
    return;
  }

  const ref = await ensureReference(ctx);
  console.log("Reference data ready: workshop models, labour operations, parts and opening stock");
  const parties = await ensureParties(ctx, ref);
  console.log("Customers and vehicles ready");

  // The free fix is active before JC-01 opens, so JC-01 completes it for the Sorento.
  await seedCampaign(ctx, ref, parties, CAMPAIGNS.freeFix);

  const done = new Map<string, JobResult>();
  for (const job of JOBS) {
    process.stdout.write(`  ${job.id} ... `);
    const result = await seedJob(ctx, ref, parties, job, done);
    done.set(job.id, result);
    console.log(`job card ${result.jobNumber}`);
  }

  // The recall starts after the Sportage's visits, so it is still pending for it.
  await seedCampaign(ctx, ref, parties, CAMPAIGNS.recall);
  await seedCampaign(ctx, ref, parties, CAMPAIGNS.serviceCampaign);

  await printSummary(ctx);
  console.log(`\n${DEMO_TAG}: done. Running it again changes nothing; use --reset-test to reopen the TEST- warranty cases.`);
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${DEMO_TAG} failed: ${message.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[connection redacted]")}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
