import { readFileSync } from "fs";
import path from "path";
const testUrl = process.env.TEST_DATABASE_URL;
const local =
  !!testUrl &&
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(testUrl).hostname);
if (local) process.env.DATABASE_URL = testUrl;
import prisma from "./client";

const integration = local ? describe : describe.skip;
integration("Job-opening signature additive migration on localhost", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it("exempts historical jobs, requires new signatures by default and rolls back without changing job identities", async () => {
    const schema = `opening_signature_${process.pid}`;
    const directory = path.resolve(
      __dirname,
      "../../prisma/migrations/20261117110000_job_opening_signatures",
    );
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      try {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe(
          'CREATE TABLE "JobCard" ("id" TEXT PRIMARY KEY)',
        );
        await tx.$executeRawUnsafe(
          'INSERT INTO "JobCard" ("id") VALUES (\'historical\')',
        );
        for (const sql of readFileSync(
          path.join(directory, "migration.sql"),
          "utf8",
        )
          .split(";")
          .map((value) => value.trim())
          .filter(Boolean))
          await tx.$executeRawUnsafe(sql);
        await tx.$executeRawUnsafe(
          'INSERT INTO "JobCard" ("id") VALUES (\'new\')',
        );
        expect(
          await tx.$queryRaw`SELECT "id", "openingSignatureRequired" FROM "JobCard" ORDER BY "id"`,
        ).toEqual([
          { id: "historical", openingSignatureRequired: false },
          { id: "new", openingSignatureRequired: true },
        ]);
        for (const sql of readFileSync(
          path.join(directory, "rollback.sql"),
          "utf8",
        )
          .split(";")
          .map((value) => value.trim())
          .filter(Boolean))
          await tx.$executeRawUnsafe(sql);
        expect(
          await tx.$queryRaw`SELECT "id" FROM "JobCard" ORDER BY "id"`,
        ).toEqual([{ id: "historical" }, { id: "new" }]);
      } finally {
        await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      }
    });
  });
});
