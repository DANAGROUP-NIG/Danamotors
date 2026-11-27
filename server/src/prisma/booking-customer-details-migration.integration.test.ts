import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const database = process.env.TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;

suite("booking customer details migration on disposable localhost", () => {
  let db: PrismaClient;

  beforeAll(() => {
    if (!database || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(database).hostname)) {
      throw new Error("Migration tests require a disposable localhost database");
    }
    db = new PrismaClient({ datasources: { db: { url: database } } });
  });

  afterAll(async () => { await db?.$disconnect(); });

  it("preserves preexisting customers and optional identifiers across repeated application", async () => {
    const migration = readFileSync(resolve(
      __dirname, "../../prisma/migrations/20261127120000_booking_customer_details/migration.sql",
    ), "utf8");
    const alter = migration.match(/ALTER TABLE "Customer"[\s\S]*?;/)?.[0];
    const trigger = migration.match(/CREATE OR REPLACE FUNCTION change_log_capture\(\)[\s\S]*?\$\$;/)?.[0];
    if (!alter || !trigger) throw new Error("Expected customer columns and change-log trigger update");
    const schema = `issue144_migration_${process.pid}`;

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRaw`CREATE TABLE "Customer" (id TEXT PRIMARY KEY, "firstName" TEXT NOT NULL)`;
      await tx.$executeRaw`INSERT INTO "Customer" VALUES ('synthetic', 'Preserved')`;
      await tx.$executeRawUnsafe(alter);
      await tx.$executeRawUnsafe(trigger);
      expect(await tx.$queryRaw`SELECT * FROM "Customer"`).toEqual([
        { id: "synthetic", firstName: "Preserved", tin: null, nin: null },
      ]);

      await tx.$executeRaw`UPDATE "Customer" SET nin = '00000000001'`;
      await tx.$executeRawUnsafe(alter);
      await tx.$executeRawUnsafe(trigger);
      expect(await tx.$queryRaw`SELECT * FROM "Customer"`).toEqual([
        { id: "synthetic", firstName: "Preserved", tin: null, nin: "00000000001" },
      ]);
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  });
});
