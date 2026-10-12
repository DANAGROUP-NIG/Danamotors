# Issue #96: branch permissions

Scope: the two required code-change sections of
[issue #96](https://github.com/DANAGROUP-NIG/Danamotors/issues/96), narrowed by
the user's follow-up to defer Parts Reports if absent. No accounts or unrelated
role grants were changed.

## What changed

- Added server `PERMISSIONS.BRANCH_ALL` and client `BRANCH_ALL` (`branch:all`).
- Granted it to SuperAdmin, CCUManager, ServiceManager, WarrantyOfficer,
  WorkshopManager and GeneralStoreManager. Existing module permissions still apply.
- Replaced operational role-name bypasses with `canAccessAllBranches`, retaining
  SuperAdmin's bypass and inventory's independent `inventory:cross-branch` policy.
- Updated service lists/appointment creation, technicians, warranty scope,
  enquiries, dashboard stats and notifications.
- Users without an all-branch grant and without a home branch receive 403;
  their missing branch cannot accidentally produce an unrestricted list query.
- Added permission/grant and controller tests plus a repeatable real-database
  seed verification script, including custom-role grant preservation.
- Rechecked Parts Reports after the checkout was merged: no menu, page, API
  routes or controllers exist. Added a TODO in `client/constant.ts`; removed
  provisional Parts Reports constants/grants/tests per the user's follow-up.

## Files

- Server: `shared/constants/roles.ts`, `middleware/authorize.ts`, service,
  workshop, warranty, enquiry, dashboard and notification controllers.
- Client: `features/auth/roles.ts`, `constant.ts` (deferred Parts Reports TODO).
- Seed: unchanged role seed reads the new catalog/grants automatically;
  `prisma/seed/verify-branch-permissions.ts` verifies two real runs.
- Tests: `middleware/authorize.test.ts`, `modules/service/branch-access.test.ts`.
- Docs: this report and `roles-and-permissions.md`.

## Branch-access audit

This table reflects the working tree at the start, including existing CCU role
renames. Home/all describes branch scope only, not entitlement to a module.
↑ means wider scope. There are no narrower grants for branch-assigned users.

| Role | Shared record guard | Service lists + appointment creation | Technician list | Warranty lists/summary | Enquiry list | Dashboard/notifications |
| --- | --- | --- | --- | --- | --- | --- |
| SuperAdmin | All → All | All → All | All → All | All → All | All → All | All → All |
| CCUManager | All → All | All → All | All → All | Home → All ↑ | All → All | All → All |
| GeneralStoreManager | All → All | Home → All ↑ | Home → All ↑ | Home → All ↑ | Home → All ↑ | All → All |
| WorkshopManager | Home → All ↑ | Home → All ↑ | All → All | Home → All ↑ | Home → All ↑ | Home → All ↑ |
| ServiceManager | Home → All ↑ | Home → All ↑ | Home → All ↑ | Home → All ↑ | Home → All ↑ | Home → All ↑ |
| WarrantyOfficer | Home → All ↑ | Home → All ↑ | Home → All ↑ | Home → All ↑ | Home → All ↑ | Home → All ↑ |
| Admin, Accountant, BillingOfficer, CCUOfficer, ServiceAdviser, Technician, StoreOfficer | Home → Home | Home → Home | Home → Home | Home → Home | Home → Home | Home → Home |
| ReceptionManager | Absent | Absent | Absent | Absent | Absent | Absent |

Additional narrowing: users lacking a home branch and `branch:all` previously
fell through to unrestricted lists (including warranty's documented central
branchless officer behavior); those requests now fail with 403. Dashboard
requests without a selected branch now use the home branch for restricted users.
These conservative changes enforce the issue's branch boundary. Module action
restrictions, such as CCU job-card mutations, remain in force.

## Grants and pending work

- `branch:all`: SuperAdmin, CCUManager, ServiceManager, WarrantyOfficer,
  WorkshopManager, GeneralStoreManager. ReceptionManager is absent, so no legacy
  role was invented; its grant is pending if restored. Both CCUManager and
  ServiceManager already exist and received their grants.
- `inventory:cross-branch`: GeneralStoreManager only among non-SuperAdmin roles;
  SuperAdmin retains its existing bypass and catalog-wide permissions.
- Forbidden grants remain absent for CCUOfficer, ServiceAdviser, Technician and
  StoreOfficer; Admin does not receive `branch:all`.
- `partsreport:read`: deferred entirely. Without the original report menu and
  route permissions, a retained-role list cannot be established accurately.

## Acceptance and limitations

- Granted users can access foreign-branch operational records, subject to their
  existing module permissions. Tests exercise custom permission holders and
  SuperAdmin, home-scoped lists, foreign record IDs and workshop actions.
- Restricted users receive 403 on tested foreign IDs; branch:all does not bypass
  module permissions or inventory scope.
- Two actual PostgreSQL seed runs preserve all built-in grants and a custom
  role's branch:all permission. Settings lists the database permission catalog;
  no fixed allowlist or new UI is required.
- Authentication reloads staff permissions from the database per request.
  `/auth/me` refreshes the client on page reload; re-login is unnecessary.
- Parts Reports acceptance is deferred by instruction. Accounts, delete rights
  and other role definitions remain outside this task.
- Other role-name branch policies exist in administration user queries, audit,
  credit lists and finance/report controllers. They were conservatively left
  unchanged because they govern administrative/financial scope; confirm separately
  whether branch:all should affect them. Existing Accountant customer scope and
  Admin-only rate/code overrides also remain unchanged.
- Client AppRole still has legacy reception names; updating those unrelated role
  groups is outside these two permission changes.

## Verification

Commands use `C:\Program Files\nodejs\node.exe` because the default npm/nvm
shim initially had no active runtime. PostgreSQL was initialized in a temporary
cluster, bound to loopback port 15496, with a disposable
`danamotors_issue96_test` database; the configured application database was untouched.

- Backend: `tsc --noEmit`, `tsc`, `jest --runInBand`.
- Frontend: `eslint .` (0 errors, 69 existing warnings), `next build` (passed).
- Seed: `prisma db push --skip-generate` into the disposable database, then
  `TS_NODE_COMPILER_OPTIONS={"rootDir":"."}` and
  `ts-node prisma/seed/verify-branch-permissions.ts` with `TEST_DATABASE_URL`.
  Passed: 127 permissions, all 13 built-in role mappings after both runs, plus
  custom-role preservation.
- Final backend typecheck and build passed. Full Jest run: 44 suites passed,
  593 tests passed; 9 integration suites / 38 tests skipped without
  `TEST_DATABASE_URL`. The separate real-database seed verification above passed.
- Final frontend rebuild passed; changed client files also passed targeted lint.
- The temporary PostgreSQL server was stopped after verification. Its temporary
  data directory remains available for inspection; no application data was changed.

The working tree was committed/merged by another process during implementation.
Existing commits were preserved; final follow-up commits contain the deferred
Parts Reports cleanup, tests and documentation.
