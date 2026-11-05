# Audit log and change log

Settings → **Audit log** (`/settings/audit-log`, permission `audit:read`) has three tabs:

| Tab | Source | What it shows |
| --- | --- | --- |
| Changes | `ChangeLog` | Every add, modify and delete of a master record or document head, field by field, with old and new values |
| Summary | `ChangeLog` | Count of changes per user × record type, split into add / modify / delete |
| Events | `AuditLog` | Business events: login, password reset, cancellations, Tally posting, user changes |

This replaces the legacy **User Activity Report** (Detail and Summary prints), its `Tgr_*Trans` triggers, and
"Show Back End Updations Only". Legacy's **Move User Activity Log** needs no screen: see [Retention](#retention).

## How changes are captured

Postgres triggers write `ChangeLog` (migration `20261105130000_change_log`). The API does not write it, so no
service can forget to log a change, and a change made outside the app is logged too.

- **Who.** Each request runs in an async context (`server/src/shared/requestContext.ts`). The auth middleware
  stores the staff user there. The Prisma client (`server/src/prisma/client.ts`) runs
  `set_config('app.user_id', <user>, true)` inside each write transaction. A write outside a transaction is
  wrapped in a short batch transaction, and `$transaction` sets the user at the start of each transaction.
  The setting is transaction-local, so it never leaks to another request on a pooled connection.
- **App or database.** The API connects with `application_name=danamotors-api`. A change from any other
  connection (psql, pgAdmin, a script, a migration) is stored with `source = 'DB'`, together with the
  database user, application name and client address. The **Outside the app only** filter (SuperAdmin) lists
  these.
- **What.** `changes` is `[{field, old, new}]` in column order. An insert lists the fields it set and a delete
  lists the values the record had. An update that changes nothing but `updatedAt` writes no row.
  `createdAt`, `updatedAt`, `requestHash` and `idempotencyKey` are skipped. Values over 2,000 characters are
  replaced by their length.
- **Secrets.** `passwordHash`, `resetTokenHash`, `resetTokenExpiry` and any column with "token" in its name are
  stored as `{field, masked: true}`: the log shows that the password or reset token changed, never the value.
- **Role permissions** are logged on the role: granting or revoking a permission is a Modify of the Role with
  field `permission` (old = revoked name, new = granted name).
- **Per-user grants and denials** (`UserPermission`) are logged on the user the same way: a Modify of the
  User with field `permission`, values such as `GRANT invoice:cancel` or `DENY customer:delete`
  (migration `20261105140000_user_permission_overrides`, function `change_log_user_permission()`).
- `txId` groups the rows written by one database transaction, for example everything a customer merge touched.

### Changes with no user

- Public endpoints (booking requests, customer portal) and background jobs (overdue invoices, reminders)
  write as **System**: in the app, no staff user.
- A request whose body goes through `multer` (file uploads) can lose the async context after the upload, and
  its writes then show as System too.

### Logged tables

| Record type | Tables |
| --- | --- |
| Master | User (and UserPermission), Role (and RolePermission), Customer, Vehicle, SparePart, LabourItem, LabourRate, WorkshopMaster, VehicleModel, Branch, BranchSettings, Employee, FinanceSetting, ReportSetting, DocumentTerms, MileageBand, Bank, PartCategory, PartCategoryBranchSetting, PartTaxCategory, CorporateGroup, TallyAccountMapping, ServiceTypeModelSetting, Campaign |
| Transaction (heads) | JobCard, Estimate, Invoice, Receipt, PartyNote, CustomerOrder, CounterSaleReturn, BranchIndent, StockTransferNote, MaterialInTransit, MaterialReceiptNote, PartRequisition, PartReturnSlip, StockTake, WarrantyCase |

**To log another table:** add a trigger in a new migration and add the table to `CHANGE_LOG_ENTITIES` in
`server/src/modules/audit/changeLog.service.ts`, which sets its label and its Master/Transaction group:

```sql
CREATE TRIGGER "<Table>_change_log" AFTER INSERT OR UPDATE OR DELETE ON "<Table>" FOR EACH ROW
    EXECUTE FUNCTION change_log_capture('r.id', 'r."documentNumber"');  -- record id, readable label
```

Both arguments are SQL expressions over the row, aliased `r`. The label may look up another table.

## API

All endpoints need `audit:read`. A SuperAdmin sees every change. Anyone else sees only changes made by users of
their own branch, so never outside-the-app or System rows.

| Endpoint | Returns |
| --- | --- |
| `GET /api/audit/changes` | Paginated changes (limit up to 5,000 for export). Filters: `dateFrom`, `dateTo`, `userId`, `entity` or `group` (MASTER/TRANSACTION), `action` (INSERT/UPDATE/DELETE), `outsideAppOnly`, `record` (exact record id, or part of the label) |
| `GET /api/audit/changes/summary` | Counts per user × entity × action, same filters |
| `GET /api/audit/changes/entities` | Logged record types and their group |
| `GET /api/audit/changes/:id` | One change |
| `GET /api/audit/changes/:entity/:recordId` | Every change to one record, oldest first |

## Append-only

A trigger refuses `UPDATE`, `DELETE` and `TRUNCATE` on `ChangeLog` unless the transaction sets
`app.change_log_purge = 'on'`. Only the retention job below does that.

## Retention

The table is not partitioned. For scale: legacy wrote about 78,000 rows in six months at one branch, so a few
million rows a year across all branches is expected. The indexes on `at`, `(entity, recordId)`,
`(userId, at)` and `txId` keep the report fast at that size.

Keep at least **7 years**. This is a suggestion; confirm the period with finance before the first purge. After that, archive and delete once a year, run by
whoever runs the backups:

```sql
-- 1. Archive the year to a file kept with the backups.
\copy (SELECT * FROM "ChangeLog" WHERE "at" < DATE '2020-01-01') TO 'changelog_before_2020.csv' CSV HEADER

-- 2. Delete it.
BEGIN;
SET LOCAL app.change_log_purge = 'on';
DELETE FROM "ChangeLog" WHERE "at" < DATE '2020-01-01';
COMMIT;
```

The deletion itself runs from psql, so it is not in the change log. Record it as a business event or in the
ops log.
