import fs from "node:fs";
import path from "node:path";

/** Demo accounts from the staff seed. Passwords are read from the seed file, never copied here. */
export const ACCOUNTS = {
  admin: "admin.lagos@danamotors.com",
  advisor: "advisor1@kiamotors.com",
  workshopManager: "wm.lagos@kiaamotors.com",
  technician: "tech1@kiamotors.com",
  abujaAdmin: "admin.abuja@kiamotors.com",
} as const;
export type Role = keyof typeof ACCOUNTS;

const seed = fs.readFileSync(path.resolve(__dirname, "../../../server/prisma/seed/staff.ts"), "utf8");

export function passwordFor(email: string): string {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`email: "${escaped}",\\s*\\n\\s*password: "([^"]+)"`).exec(seed);
  if (!match) throw new Error(`No seed password for ${email}`);
  return match[1];
}

export const authFile = (role: Role) => path.resolve(__dirname, `../.auth/${role}.json`);
