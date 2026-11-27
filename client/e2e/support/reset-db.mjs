// Recreates the e2e database from the seeded template, so every run starts from the same data.
// Refuses anything but a localhost database.
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../server/package.json", import.meta.url));
const { PrismaClient } = require("@prisma/client");

const server = process.env.E2E_DB_SERVER ?? "postgresql://dana:jobflow@localhost:55433";
const template = process.env.E2E_TEMPLATE_DB ?? "dana_demo_p10";
const target = process.env.E2E_DB ?? "dana_e2e";
if (!["localhost", "127.0.0.1"].includes(new URL(server).hostname)) throw new Error("E2E database must be on localhost");
if (!/^[a-z0-9_]+$/.test(template) || !/^[a-z0-9_]+$/.test(target)) throw new Error("Invalid database name");

const db = new PrismaClient({ datasources: { db: { url: `${server}/postgres` } } });
await db.$executeRawUnsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('${template}', '${target}') AND pid <> pg_backend_pid()`);
await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${target}`);
await db.$executeRawUnsafe(`CREATE DATABASE ${target} TEMPLATE ${template}`);
await db.$disconnect();

// Engineers are seeded as staff who never sign in (random password). Phase 3 needs one to sign in
// and review diagnoses, so in this throwaway copy only, engineer1 signs in like tech1.
const copy = new PrismaClient({ datasources: { db: { url: `${server}/${target}` } } });
await copy.$executeRawUnsafe(
  `UPDATE "User" SET "passwordHash" = (SELECT "passwordHash" FROM "User" WHERE email = 'tech1@kiamotors.com') WHERE email = 'engineer1@kiamotors.com'`,
);
await copy.$disconnect();
console.log(`e2e database ${target} recreated from ${template}`);
