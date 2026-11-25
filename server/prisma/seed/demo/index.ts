/**
 * Demo data seed: a small, repeatable set of dummy job cards, estimates, bills, part issues,
 * warranty cases (including TEST- cases), campaigns, an FPC bulletin, MIS report history, PDI job cards and repeat jobs for the Dana Motors Demo account.
 *
 *   npm run prisma:seed:demo                      load the demo data (safe to run again)
 *   npm run prisma:seed:demo -- --reset-test         put the TEST- warranty cases back to OPEN
 *   npm run prisma:seed:demo -- --pdi-only           only the PDI demo (reference data, new vehicles, PDI job cards)
 *   npm run prisma:seed:demo -- --repeat-only        only the repeat job demo (earlier visits, repeats at every review step)
 *   npm run prisma:seed:demo -- --csc-only           only the CSC demo (service due cases at every follow-up step)
 *   npm run prisma:seed:demo -- --late-only          only the late delivery demo (promised date / time discrepancies, January 2026)
 *   npm run prisma:seed:demo -- --psf-only           only the post-service follow-up demo (delivered jobs and calls, February 2026)
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
import { seedFpc } from "./fpc";
import { seedMis } from "./mis";
import { seedPdi } from "./pdi";
import { seedRepeat } from "./repeat";
import { seedCsc } from "./csc";
import { seedLate } from "./late";
import { seedPsf } from "./psf";
import { resetTestCases } from "./reset";
import { printSummary } from "./summary";
import { CAMPAIGNS, DEMO_TAG, JOBS, STAGE_JOBS } from "./fixtures";

const USAGE = "Usage: npm run prisma:seed:demo -- [--reset-test] [--pdi-only] [--repeat-only] [--csc-only] [--late-only] [--psf-only] [--allow-database=<name>] [--main-branch=<name>] [--second-branch=<name>]";

function parseArgs(argv: string[]) {
  const options = { resetTest: false, pdiOnly: false, repeatOnly: false, cscOnly: false, lateOnly: false, psfOnly: false, allowDatabase: undefined as string | undefined, mainBranch: "Main Branch", secondBranch: "Dana Motors Demo", help: false };
  for (const arg of argv) {
    const [name, ...rest] = arg.split("=");
    const value = rest.join("=");
    if (name === "--reset-test" && !value) options.resetTest = true;
    else if (name === "--pdi-only" && !value) options.pdiOnly = true;
    else if (name === "--repeat-only" && !value) options.repeatOnly = true;
    else if (name === "--csc-only" && !value) options.cscOnly = true;
    else if (name === "--late-only" && !value) options.lateOnly = true;
    else if (name === "--psf-only" && !value) options.psfOnly = true;
    else if (name === "--help" || name === "-h") options.help = true;
    else if (name === "--allow-database" && value) options.allowDatabase = value;
    else if (name === "--main-branch" && value) options.mainBranch = value;
    else if (name === "--second-branch" && value) options.secondBranch = value;
    else throw new Error(`Unknown option ${arg}\n${USAGE}`);
  }
  return options;
}

async function printPdi(ctx: Awaited<ReturnType<typeof loadContext>>, ref: Awaited<ReturnType<typeof ensureReference>>) {
  console.log("PDI job cards:");
  for (const row of await seedPdi(ctx, ref))
    console.log(`  ${row.key} VIN ${row.vin}: ${row.jobNumber ? `${row.jobNumber} ${row.status}${row.bill ? `, bill ${row.bill}` : ""}` : "no PDI yet (open one in the UI)"}`);
}

async function printRepeat(ctx: Awaited<ReturnType<typeof loadContext>>, ref: Awaited<ReturnType<typeof ensureReference>>) {
  console.log("Repeat jobs:");
  for (const row of await seedRepeat(ctx, ref)) console.log(`  ${row.key} ${row.registration}: ${row.jobNumber ? `${row.jobNumber} ${row.status}` : row.status}`);
}

async function printCsc(ctx: Awaited<ReturnType<typeof loadContext>>, ref: Awaited<ReturnType<typeof ensureReference>>) {
  const { generated, rows } = await seedCsc(ctx, ref);
  console.log(`CSC cases (due ${generated.from} to ${generated.to}): ${generated.due} due, ${generated.created} new, ${generated.alreadyVisited} already visited`);
  for (const row of rows) console.log(`  ${row.key} ${row.registration}: ${row.status}`);
}

async function printLate(ctx: Awaited<ReturnType<typeof loadContext>>, ref: Awaited<ReturnType<typeof ensureReference>>) {
  console.log("Late deliveries (Lagos times):");
  for (const row of await seedLate(ctx, ref)) console.log(`  ${row.key} ${row.registration} ${row.jobNumber}: ${row.outcome}`);
}

async function printPsf(ctx: Awaited<ReturnType<typeof loadContext>>, ref: Awaited<ReturnType<typeof ensureReference>>) {
  console.log("Post-service follow-up (Lagos times):");
  for (const row of await seedPsf(ctx, ref)) console.log(`  ${row.key} ${row.registration} ${row.jobNumber}: ${row.outcome}`);
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
  if (options.repeatOnly) {
    await printRepeat(ctx, ref);
    console.log(`\n${DEMO_TAG}: repeat job demo done. Running it again changes nothing.`);
    return;
  }
  if (options.cscOnly) {
    await printCsc(ctx, ref);
    console.log(`\n${DEMO_TAG}: CSC demo done. Running it again changes nothing.`);
    return;
  }
  if (options.lateOnly) {
    await printLate(ctx, ref);
    console.log(`\n${DEMO_TAG}: late delivery demo done. Running it again changes nothing.`);
    return;
  }
  if (options.psfOnly) {
    await printPsf(ctx, ref);
    console.log(`\n${DEMO_TAG}: post-service follow-up demo done. Running it again changes nothing.`);
    return;
  }
  if (options.pdiOnly) {
    await printPdi(ctx, ref);
    console.log(`\n${DEMO_TAG}: PDI demo done. Running it again changes nothing.`);
    return;
  }
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

  // FPC bulletin (#98): VIN range, letter and call, and job cards for every FPC list.
  await seedFpc(ctx, ref, parties, done);

  // Staged job card (job card revamp): one job at every step.
  for (const job of STAGE_JOBS) {
    process.stdout.write(`  ${job.id} ... `);
    const result = await seedJob(ctx, ref, parties, job, done);
    done.set(job.id, result);
    console.log(`job card ${result.jobNumber}`);
  }

  // Service MIS reports (#97): finished job history across every service category.
  await seedMis(ctx, ref);

  // PDI (pre-delivery inspection): new vehicles and PDI job cards at every step.
  await printPdi(ctx, ref);

  // Repeat jobs: earlier visits and repeats at every review step.
  await printRepeat(ctx, ref);

  // CSC: service due cases at every follow-up step.
  await printCsc(ctx, ref);

  // Late deliveries: promised date / time discrepancies at fixed January 2026 dates.
  await printLate(ctx, ref);

  // Post-service follow-up: delivered jobs and calls at fixed February 2026 dates.
  await printPsf(ctx, ref);

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
