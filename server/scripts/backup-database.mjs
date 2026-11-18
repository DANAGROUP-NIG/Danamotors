#!/usr/bin/env node
// Nightly database backup. See doc/backup-and-restore.md.
//
//   node scripts/backup-database.mjs            (or: npm run db:backup)
//
// 1. pg_dump in custom format (compressed; schema, data, triggers and functions) to
//    BACKUP_DIR/danamotors_<YYYY-MM-DD_HHmmss>.dump, with a .sha256 file beside it.
// 2. Checks the dump can be read back (pg_restore --list) and holds the change-log and books-closed
//    triggers.
// 3. Copies it to BACKUP_OFFSITE_DIR, if set (a mounted network share or a synced cloud folder).
// 4. Deletes local dumps older than BACKUP_KEEP_DAYS, except the first dump of each month, which is kept
//    for BACKUP_KEEP_MONTHS. The off-site folder keeps its own policy.
//
// Settings come from the environment, or from server/.env if not set there:
//   DATABASE_URL         the database to back up (required)
//   BACKUP_DIR           where dumps go (default: ../backups next to the repo)
//   BACKUP_OFFSITE_DIR   optional second copy
//   BACKUP_KEEP_DAYS     daily dumps to keep (default 14)
//   BACKUP_KEEP_MONTHS   monthly dumps to keep (default 12)
//   PG_BIN               folder holding pg_dump and pg_restore, if they are not on PATH
//
// The password is passed to pg_dump through PGPASSWORD, never on the command line. Exit code 0 = backup
// made and verified; anything else = failed (Task Scheduler / cron should alert on it). Never restores.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      }),
  );
}

const fileEnv = loadEnvFile(path.join(here, '..', '.env'));
const setting = (name, fallback) => process.env[name] ?? fileEnv[name] ?? fallback;

const log = (message) => console.log(`${new Date().toISOString()} ${message}`);
let partial = null; // a dump being written: removed on failure so it is never mistaken for a backup
function fail(message) {
  if (partial) {
    fs.rmSync(partial, { force: true });
    fs.rmSync(`${partial}.sha256`, { force: true });
  }
  console.error(`${new Date().toISOString()} BACKUP FAILED: ${message}`);
  process.exit(1);
}

const databaseUrl = setting('DATABASE_URL');
if (!databaseUrl) fail('DATABASE_URL is not set');
const backupDir = path.resolve(setting('BACKUP_DIR', path.join(here, '..', '..', '..', 'backups')));
const offsiteDir = setting('BACKUP_OFFSITE_DIR');
const keepDays = Number(setting('BACKUP_KEEP_DAYS', '14'));
const keepMonths = Number(setting('BACKUP_KEEP_MONTHS', '12'));
const pgBin = setting('PG_BIN', '');
const tool = (name) => (pgBin ? path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name) : name);

// Split the password out of the URL so it never appears in a process list.
const url = new URL(databaseUrl);
const password = decodeURIComponent(url.password);
url.password = '';
url.searchParams.delete('schema'); // Prisma's parameter; libpq does not know it.
const connection = url.toString();
const env = { ...process.env, PGPASSWORD: password, PGAPPNAME: 'danamotors-backup' };

function run(command, args) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.error) fail(`${command}: ${result.error.message}${pgBin ? '' : ' (set PG_BIN to the PostgreSQL bin folder)'}`);
  if (result.status !== 0) fail(`${command} exited with ${result.status}: ${result.stderr.trim()}`);
  return result.stdout;
}

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const database = url.pathname.replace(/^\//, '') || 'danamotors';
fs.mkdirSync(backupDir, { recursive: true });
const file = path.join(backupDir, `${database}_${stamp}.dump`);

// 1. Dump.
const started = Date.now();
partial = file;
log(`Backing up ${url.host}/${database} to ${file}`);
run(tool('pg_dump'), ['--format=custom', '--compress=6', '--no-owner', '--no-privileges', `--file=${file}`, `--dbname=${connection}`]);
const size = fs.statSync(file).size;
const sha = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(`${file}.sha256`, `${sha}  ${path.basename(file)}\n`);
log(`Dumped ${(size / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s`);

// 2. Verify: readable, and the triggers that guard the data are in it.
const listing = run(tool('pg_restore'), ['--list', file]);
const tables = (listing.match(/ TABLE DATA public /g) ?? []).length;
const hasChangeLog = listing.includes('_change_log');
const hasBooksClosed = listing.includes('_books_closed');
if (!tables) fail('the dump holds no table data');
if (!hasChangeLog || !hasBooksClosed) fail('the dump is missing the change-log or books-closed triggers');
log(`Verified: ${tables} tables with data, change-log and books-closed triggers present`);

partial = null;

// 3. Off-site copy.
if (offsiteDir) {
  fs.mkdirSync(offsiteDir, { recursive: true });
  fs.copyFileSync(file, path.join(offsiteDir, path.basename(file)));
  fs.copyFileSync(`${file}.sha256`, path.join(offsiteDir, `${path.basename(file)}.sha256`));
  log(`Copied to ${offsiteDir}`);
}

// 4. Retention: daily dumps for keepDays, the first dump of each month for keepMonths.
const pattern = new RegExp(`^${database}_(\\d{4})-(\\d{2})-(\\d{2})_\\d{6}\\.dump$`);
const dumps = fs.readdirSync(backupDir).filter((name) => pattern.test(name)).sort();
const firstOfMonth = new Set();
const seenMonths = new Set();
for (const name of dumps) {
  const [, y, m] = pattern.exec(name);
  if (!seenMonths.has(`${y}-${m}`)) {
    seenMonths.add(`${y}-${m}`);
    firstOfMonth.add(name);
  }
}
const dayMs = 24 * 60 * 60 * 1000;
let removed = 0;
for (const name of dumps) {
  const [, y, m, d] = pattern.exec(name);
  const ageDays = (now.getTime() - new Date(Number(y), Number(m) - 1, Number(d)).getTime()) / dayMs;
  const keep = ageDays <= keepDays || (firstOfMonth.has(name) && ageDays <= keepMonths * 31);
  if (!keep) {
    fs.rmSync(path.join(backupDir, name));
    fs.rmSync(path.join(backupDir, `${name}.sha256`), { force: true });
    removed += 1;
  }
}
log(`Done. ${dumps.length - removed} dump(s) kept, ${removed} removed.`);
