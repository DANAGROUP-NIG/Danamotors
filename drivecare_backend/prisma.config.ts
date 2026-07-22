import { defineConfig } from "prisma/config";
import path from "node:path";

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  seed: "ts-node prisma/seed.ts",
});
