# Department role and branch access

## Audit before implementation

The target list contains 13 roles. Workshop Manager, Billing Officer and CCU Manager already exist. The other ten names are absent from the checked-in role catalog, seed and migrations. Accountant and Auditor are separate existing roles. Live role records were not inspected.

The Prisma schema uses unique role and permission rows, role-permission links and per-user permission overrides. Staff authentication reloads the role, branch and effective permissions for each authenticated request. The standard role seed rebuilds the built-in permission links from `ROLE_PERMISSIONS`. Existing migrations also grant permissions directly.

| Existing role | Branch access before the change |
| --- | --- |
| Super Admin | Global bypass, subject to endpoints that still require an explicit branch selection |
| Admin | All branches for framework and selected finance reports. Other paths use their own legacy policy |
| General Store Manager | `branch:all` and `inventory:cross-branch` |
| Workshop Manager | `branch:all` for operational paths and framework reports. Inventory had separate scope |
| CCU Manager | `branch:all` for operational paths and framework reports |
| Service Manager and Warranty Officer | `branch:all` on endpoints that consume the shared policy |
| Billing Officer | Own branch on the standard finance and report paths. Shared directory and search paths could disclose other branches |
| Accountant, Auditor, CCU Officer, Engineer, Service Adviser, Store Officer and Technician | No default `branch:all`. Scope depends on endpoint checks, and the prior shared policy honored explicit grants |

The shared all-branch checks reached service and workshop operations, warranty, PDI, dashboard, enquiries, CSC, requisitions, labour slips, employees, notifications and reports. Separate gaps existed in customer and vehicle directories, global search, campaign vehicle operations and audit event detail. Finance, employee and audit paths also had legacy role checks that would prevent some general managers from using their inherited permissions across branches.

## Implementation decisions

- The user confirmed Workshop Manager is own-branch and approved inheriting permissions from Workshop Manager, CCU Manager, Accountant, Billing Officer and Auditor for the corresponding new roles.
- The existing authorization middleware and report scope resolve staff branch access. Authentication refuses an own-branch department user without an assignment. Effective scope grants reflect the required role scope even if old seed data or user overrides still carry a conflicting scope grant.
- The additive role seed inserts missing target roles and assigns defaults atomically. The standalone role-seed entry point uses this additive operation against an initialized permission catalog. The normal application seed keeps its existing behavior for legacy roles.
- The audit log and change log schema attribute events to actors. Existing branch filters therefore use the actor's current branch. Historical events lack a persisted resource branch, so the current implementation cannot guarantee historical resource-branch isolation.

## Verification

The tests cover each target role against two branch IDs, branchless denial, and the additive seed's two-run behavior with pre-existing built-in and custom records. The seed test uses a test double. No live database was written.

The full backend run passed 1,762 tests and skipped 289. Backend typechecking passed. Client ESLint reported 70 warnings and zero errors. The client test run passed 83 tests and failed the existing combined and legacy bill print assertion in `client/test/issue117-components.test.mjs`.

## Changed branch paths

| Files | Scope change |
| --- | --- |
| `server/src/middleware/authorize.ts`, `authMiddleware.ts`, `server/src/shared/effectivePermissions.ts` | Apply the same department scope to authenticated staff, shared operational guards and explicit scope grants |
| `server/src/modules/reports/core/scope.ts` | Apply the policy to framework report data and exports |
| `server/src/modules/customer/customer.routes.ts`, `customer-read-scope.ts`, `customer.service.ts`, `customer.controller.ts` | Scope directory lists, duplicates, customer detail and nested operations, including Tally mapping |
| `server/src/modules/vehicle/vehicle.routes.ts` | Scope directory detail, history, images, ownership and writes using the current customer's branch |
| `server/src/modules/search/search.controller.ts`, `search.service.ts` | Filter results for customers, vehicles, job cards and users before the result limit |
| `server/src/modules/campaign/campaign.controller.ts`, `campaign.service.ts` | Scope campaign vehicle counts, lookups, contact records, scheduling and status updates |
| `server/src/modules/finance/finance.controller.ts`, `party-account.controller.ts`, `party-note.controller.ts`, `party-report.controller.ts`, `outstanding.controller.ts` | Honor general-manager scope for billing and finance lists, details, actions and exports |
| `server/src/modules/service/service.controller.ts`, `job-transitions.ts`, `server/src/modules/employee/employee.routes.ts` | Honor general-manager scope in workshop writes, job transitions and employee lists |
| `server/src/modules/audit/audit.controller.ts`, `changeLog.routes.ts` | Apply actor-branch checks to restricted audit detail and allow general managers to read across actor branches |
