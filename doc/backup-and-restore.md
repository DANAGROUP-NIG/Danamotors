# Backup and restore

One PostgreSQL database serves every branch. This page is the procedure for backing it up and getting it
back. It replaces legacy **Take Backup / Restore Database** (Data Management), which let any user with the
right restore over the live database.

**There is no backup or restore screen, and there must never be a restore button.** A restore replaces the
whole database, so one click would overwrite every branch's work since the backup. Restores are done by the
system administrator, following this page.

## Who

| Task | Who | When |
| --- | --- | --- |
| Nightly backup runs, failure alerts are read | System administrator (to be named) | Daily |
| Off-site copies checked | System administrator | Weekly |
| Test restore (below) into a scratch database | System administrator | Monthly, and after any PostgreSQL upgrade |
| Manual backup before a release that has migrations | Whoever deploys | Each such release |
| Change-log archive and purge ([audit-log.md](./audit-log.md#retention)) | System administrator, with finance's agreement | Yearly, in January, after the books are closed |
| Decide to restore | SuperAdmin with the managing director | Only after data loss or corruption |

## What protects the data

| Layer | How | Loses at most |
| --- | --- | --- |
| **Nightly dump** | `npm run db:backup` (`server/scripts/backup-database.mjs`), scheduled | The day since the last dump |
| **Point-in-time recovery** | The database host's PITR (managed PostgreSQL), or base backups with WAL archiving (self-hosted, below) | Minutes |
| **Off-site copy** | The script copies each dump to `BACKUP_OFFSITE_DIR`: a share or synced folder in another building or cloud | The site |

The dump alone is enough to rebuild the database. PITR is for the case "a wrong bulk change at 15:10": go
back to 15:09 instead of last night.

## The nightly dump

`server/scripts/backup-database.mjs` (also `npm run db:backup` in `server/`):

1. `pg_dump --format=custom` of `DATABASE_URL` to `BACKUP_DIR/danamotors_<YYYY-MM-DD_HHmmss>.dump`, with a
   `.sha256` beside it. The dump holds the schema, all data, the triggers and their functions (change log,
   books closed, stock-take freeze) and the migration history.
2. Verifies it: `pg_restore --list` must read it, and it must contain table data and the change-log and
   books-closed triggers. A failed or unverified dump is deleted.
3. Copies it to `BACKUP_OFFSITE_DIR` if set.
4. Keeps daily dumps for `BACKUP_KEEP_DAYS` (14) and the first dump of each month for
   `BACKUP_KEEP_MONTHS` (12); deletes the rest from `BACKUP_DIR`. The off-site folder is not pruned by the
   script: keep each **January** dump there for **7 years**, with that year's change-log archive.

Exit code 0 means a verified backup was made. Anything else is a failure and must alert someone.

| Setting | Meaning | Default |
| --- | --- | --- |
| `DATABASE_URL` | The database (from `server/.env` if not in the environment) | required |
| `BACKUP_DIR` | Local folder for dumps, **not** on the database disk | `backups/` beside the repo folder |
| `BACKUP_OFFSITE_DIR` | Second copy | none |
| `BACKUP_KEEP_DAYS` / `BACKUP_KEEP_MONTHS` | Retention | 14 / 12 |
| `PG_BIN` | Folder with `pg_dump.exe` and `pg_restore.exe`, if not on PATH | PATH |

The password goes to `pg_dump` through `PGPASSWORD`, never on the command line. Use client tools of the
**same or a newer major version** than the server (PostgreSQL 18 today).

### Scheduling

Windows (Task Scheduler), daily at 02:00, as a service account that can write both folders:

```bat
schtasks /Create /TN "Danamotors DB backup" /SC DAILY /ST 02:00 /RU <account> ^
  /TR "cmd /c cd /d C:\danamotors\server && set PG_BIN=C:\Program Files\PostgreSQL\18\bin&& set BACKUP_DIR=D:\backups\danamotors&& set BACKUP_OFFSITE_DIR=\\fileserver\backups\danamotors&& node scripts\backup-database.mjs >> D:\backups\danamotors\backup.log 2>&1"
```

Linux (cron), with the settings in the service's environment file:

```cron
0 2 * * *  cd /srv/danamotors/server && node scripts/backup-database.mjs >> /var/log/danamotors-backup.log 2>&1 || mail -s "Danamotors backup FAILED" <alert address> < /dev/null
```

On Windows, set the task to email or raise an event on a non-zero result, or have the weekly check read
`backup.log`.

### Before a release with migrations

Run `npm run db:backup` by hand before `prisma migrate deploy`. If the migration goes wrong, restore that
dump.

## Point-in-time recovery

- **Managed PostgreSQL** (Render, Azure, AWS RDS, …): turn on the host's backups with point-in-time
  recovery and the longest retention the plan allows. Restore through the host's console **to a new
  database**, then follow steps 4–7 of the restore below.
- **Self-hosted**: archive the write-ahead log and take a weekly base backup.

  ```ini
  # postgresql.conf
  wal_level = replica
  archive_mode = on
  archive_command = 'copy "%p" "D:\\backups\\wal\\%f"'     # Linux: 'test ! -f /backups/wal/%f && cp %p /backups/wal/%f'
  archive_timeout = 300                                   # at most 5 minutes of changes per file
  ```

  Weekly: `pg_basebackup -D D:\backups\base\<date> -Ft -z -X stream -P`. To recover, restore the newest
  base backup before the target time into an empty data folder, create `recovery.signal`, set
  `restore_command = 'copy "D:\\backups\\wal\\%f" "%p"'` and `recovery_target_time = '2026-11-05 15:09:00+01'`,
  and start the server. Keep WAL files back to the oldest base backup kept, and copy both off site.

## Restore (tested)

Never restore over the live database in place. Restore into a **new** database, check it, then switch the
API to it. The old database stays untouched until you are sure.

1. **Stop writes.** Stop the API (and the HHDC Link stations), and tell the branches.
2. **Pick the dump** and check it: `certutil -hashfile <file> SHA256` (Windows) or `sha256sum -c <file>.sha256`.
3. **Restore into a new database:**

   ```bat
   set PGPASSWORD=<password>
   psql -h <host> -U postgres -d postgres -c "CREATE DATABASE danamotors_restored"
   pg_restore --no-owner --no-privileges --jobs=4 --exit-on-error -h <host> -U postgres -d danamotors_restored <file>.dump
   ```

   The data is loaded before the triggers are created, so the restore itself writes nothing to the change
   log and is not blocked by the books-closed lock.
4. **Check it** (on the restored database):

   ```sql
   SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;           -- same as before
   SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%\_change\_log';             -- 41 today
   SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%\_books\_closed';           -- 15 today
   SELECT max(at) FROM "ChangeLog";                                                -- the last change before the backup
   SELECT max("issuedDate") FROM "Invoice"; SELECT max("issuedAt") FROM "Receipt";
   ```

5. **Point the API at it:** set `DATABASE_URL` to `.../danamotors_restored`, run `npx prisma migrate deploy`
   (applies nothing if the dump is current; applies newer migrations if the code is newer), start the API,
   and check `/api/health`, a login, and today's work in one branch.
6. **Tell the branches** what was lost: everything after the dump (or after the PITR target). Work from that
   period must be entered again, and paper documents numbered after the last restored number need care.
7. **Afterwards**, keep the old database for at least a week (rename it, e.g. `danamotors_before_restore`),
   then drop it. Record the restore in the ops log: when, which dump, why, who decided.

### Restoring part of the data

If only some records were damaged (say a wrong bulk change), restore the dump into a scratch database as in
step 3 and copy the needed rows back with SQL, leaving the live database running. The copy is a change made
outside the app, so the change log records it as such. Rows dated in a closed period can only be written
after reopening the books or, in the script's transaction, `SET LOCAL app.books_closed_bypass = 'on'`
([books-closed.md](./books-closed.md)).

### Test results (local dev database, 5 Nov 2026)

PostgreSQL 18.4, a laptop; dump made with `npm run db:backup`, restore with the commands above.

| Step | Result | Time |
| --- | --- | --- |
| Dump and verify | 14.2 MB file, 133 tables with data | 4.0 s |
| Create the scratch database | | 0.6 s |
| `pg_restore --jobs=4` | exit 0 | 6.3 s |
| Compare with the source | 133 / 133 tables, 566,734 / 566,734 rows, every table equal; ChangeLog 105 / 105 rows | |
| Triggers and functions | 66 / 66 triggers (41 change log, 15 books closed), 15 / 15 functions, 102 / 102 migrations | |
| Restored database works | an insert is written to the change log; deleting from ChangeLog is refused (append-only); a receipt dated in a closed period is refused | |
| Retention | of 10 dated test dumps: the last 14 days and the first of each month kept, 5 removed; off-site copy made | |

Production is larger; time the monthly test restore there and note it here.

**Tooling note.** On the development PC the `C:\Program Files\PostgreSQL\18\bin` tools fail to start (a
missing Windows C runtime DLL); the copies in `C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime` work, so
`PG_BIN` points there. Installing the Microsoft Visual C++ Redistributable should fix the main folder.
