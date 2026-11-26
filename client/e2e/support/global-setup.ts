import { execFileSync } from "node:child_process";
import path from "node:path";

/** Every run starts from the same seeded data: the e2e database is recreated from the template. */
export default function globalSetup() {
  execFileSync("node", [path.resolve(__dirname, "reset-db.mjs")], { stdio: "inherit" });
}
