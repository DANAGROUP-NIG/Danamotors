# Roles & Permissions

The single source of truth is `server/src/shared/constants/roles.ts`. Roles and
permissions are seeded into the database; API routes enforce access with
`requirePermission(...)` / `requireRole(...)`. The frontend mirrors the role names
(lowercased) in `client/features/auth/roles.ts` to gate UI actions.

## Roles

| Role | Scope | Responsibilities |
| --- | --- | --- |
| `SuperAdmin` | Global | Full access to everything. First registered user is auto-promoted here. |
| `Admin` | Own branch for operational records | User/role management, full CRUD on customers/vehicles/service/inventory/finance reads. |
| `GeneralStoreManager` | Cross-branch | Manages inventory and transfers across ALL branches. |
| `StoreOfficer` | Own branch | Inventory + transfers for the assigned branch. |
| `WorkshopManager` | Cross-branch operations; own-branch inventory | Workshop floor: job cards, technician assignment, QC, inventory. |
| `Accountant` | Own branch | Finance create/read/update. |
| `ServiceAdviser` | Own branch | Opens and edits job cards; revises, prints and captures signatures on estimates; finance reads. |
| `BillingOfficer` | Home branch only | Views job cards and invoices; creates job bills, without job-card writes or estimate rights. |
| `Technician` | Own branch | Vehicle/service reads, job-card progress updates, workshop updates. |
| `CCUOfficer` | Own branch | Registers customers, books appointments, manages vehicles. |
| `CCUManager` | Cross-branch operations | Manages CCU staff and reception operations. |
| `ServiceManager` | Cross-branch operations; own-branch inventory | Manages service operations. |
| `WarrantyOfficer` | Cross-branch operations; own-branch inventory | Warranty claims and campaigns. |
| `Auditor` | Own branch | Read-only: every `…:read` permission and every report, no writes (legacy Auditormast). Seeded by migration `20261105140000_user_permission_overrides`. |

## Permissions

| Permission | Key |
| --- | --- |
| Users | `user:read`, `user:create`, `user:update`, `user:delete` |
| Roles | `role:read`, `role:update` |
| Branches | `branch:read`, `branch:create`, `branch:update`, `branch:delete` |
| All-branch operational access | `branch:all` (module permissions are still required) |
| Customers | `customer:read`, `customer:create`, `customer:update`, `customer:delete` |
| Vehicles | `vehicle:read`, `vehicle:create`, `vehicle:update`, `vehicle:delete` |
| Service | `service:read`, `service:create`, `service:update`, `service:delete` |
| Workshop | `workshop:read`, `workshop:update` |
| Inventory | `inventory:read`, `inventory:create`, `inventory:update`, `inventory:delete` |
| Transfers | `transfer:read`, `transfer:create`, `transfer:update`, `transfer:approve`, `transfer:dispatch`, `transfer:receive` |
| Finance | `finance:read`, `finance:create`, `finance:update` |

## Dealer rates, shortage approval and user changes

| Permission | What it allows | Default roles |
| --- | --- | --- |
| `sparepart:cost:read` | See dealer rates, purchase prices, transfer values, stock values, cost and profit (legacy "Can View Dealer Rate") | Admin, General Store Manager, Store Officer, Accountant |
| `stock:discrepancy:approve` | Approve the shortage/damage on an MIT or STN receipt (legacy "Can Approve Shortage/Excess in MIT/BIT") | Admin, General Store Manager |

**Dealer rates.** Without `sparepart:cost:read`, `costVisibility` (`server/src/middleware/costVisibility.ts`)
removes `unitPrice`, `unitRate`, `dealerRate`, `basicRate`, `unitCost` and old/new dealer rates from every
API response. On stock documents (indents, STNs, MIT/MRN, vendor receipts, transfers, picking and packing
lists) it also removes `amount`, `totalValue` and `totalAmount`, which are valued at those rates. Selling
prices (retail rate, invoice and CPO amounts) are untouched. Parts reports drop their cost columns (marked
`cost` in `partsReport.definitions.ts`). Such users cannot set a part's dealer or base rate either: those
fields are ignored on part writes. The part screens hide the dealer rate.

**Changing users.** A SuperAdmin may change any other user, including their role and branch
(`PUT /api/admin/users/:id` takes `branchId`; the edit form shows Branch to SuperAdmins only). Anyone else
(an Admin, within their branch) may not change a user with admin-level access, give admin-level access, or
move a user to another branch (see [Admin-level access](#admin-level-access)). Nobody may deactivate,
delete, re-role or change the access of their own account. The rules are `assertCanChangeUser` and
`assertCanGiveAccess` in `admin.service.ts`; creating a user goes through the same check. Changes are
audited as `USER_UPDATED` with old → new values; deletes as `USER_DELETED`.

After deploying, run the role seed so the built-in roles get the two permissions. Until then only
SuperAdmins see dealer rates and approve shortages.

## Per-user access (overrides)

Legacy rights were per user: at the branch, 93 users with rights had 79 distinct profiles. Here the role
is the template and each user may have their own changes on top of it (`UserPermission`):

- **Granted**: a permission the role lacks.
- **Denied**: a permission the role has.

**Effective permissions = role + granted − denied.** `effectivePermissions()` and `holdsPermission()` in
`server/src/shared/effectivePermissions.ts` are the only places that combine them. The API check
(`loadStaffUser`), login, `/auth/me` and every "users who hold permission X" query (shortage approvers,
QC notifications, handheld posters) use them. A SuperAdmin has no overrides: they hold everything.

| Where | What |
| --- | --- |
| User page → **Access** | Role, effective count, the user's grants (+) and denials (−). **Change access** opens the permission list: ticking a permission the role lacks grants it, unticking one the role has denies it. Filters: All / Has / Changed, and search. |
| Users list | "+N own" next to the role when the user has overrides. |
| Add user / Edit user → **Copy access from user** | Copies that user's role and overrides (legacy "Assign Right Same As Other One"). Replaces the role and overrides on edit. An Admin may copy only from users of their own branch. |
| `PUT /api/admin/users/:id/permissions` `{ grants, denies }` | Replaces the overrides. A grant already in the role or a denial not in it is refused (400). |

Changing a user's role drops the overrides the new role makes pointless (a grant it now has, a denial of a
permission it lacks); the effective permissions do not change.

### Admin-level access

Only a SuperAdmin may give admin-level access:

- **Admin-level permissions** (`isAdminLevelPermission`): every `user:*`, `role:*` and `audit:*`
  permission, `branch:all`, `branch:create`, `branch:update` and `branch:delete`. An Admin cannot grant
  them; the Access editor shows them locked.
- **Admin-level roles**: Admin, SuperAdmin, and any role holding a `user:*`, `role:*` or `audit:*`
  permission, such as Auditor. An Admin cannot give them, on create, edit or copy.
- The built-in operational roles that carry `branch:all` (Service Manager, CCU Manager, …) stay assignable
  by an Admin. Only a SuperAdmin edits role permissions, so those roles are already approved; a per-user
  grant is not, so it is checked.
- An Admin cannot change a user who has admin-level access by role or by grant.

## Rights changes are logged

Every grant or revoke of a role permission, every per-user grant or denial, and every change to a user
(role, branch, active) is in the change log (Settings → Audit log → Changes, record type "Role and
permissions" or "User"). A per-user change shows as a Modify of the User, field `permission`, old/new
such as `GRANT invoice:cancel`. Saving overrides also writes one `USER_PERMISSIONS_UPDATED` event
(granted / ungranted / denied / undenied); copying access on create writes `USER_ACCESS_COPIED`. See
[audit-log.md](./audit-log.md).

## Operational branch access (issue #96)

`canAccessAllBranches(user)` allows SuperAdmin or a user with `branch:all`.
It applies to shared record ownership checks, service lists and appointment
creation, technicians, warranty case lists/summary, enquiries, dashboard stats
and notifications. Other users must have a home branch; foreign record IDs
return 403. A missing home branch no longer becomes an unrestricted list query.

The built-in grants are SuperAdmin, CCUManager, ServiceManager, WarrantyOfficer,
WorkshopManager and GeneralStoreManager. ReceptionManager is absent from the
current `ROLES` catalog; its grant is pending if that legacy role returns.
Admin, CCUOfficer, ServiceAdviser, Technician and StoreOfficer do not receive
`branch:all`. Custom roles can select it in Settings → Roles after seeding.

Inventory remains separate: `inventory:cross-branch` is granted to
GeneralStoreManager, with the existing SuperAdmin bypass. `branch:all` alone
does not grant inventory access. Finance, administration and audit retain their
separate branch policies; see [the implementation report](issue-96-report.md).

The role seed rebuilds built-in grants from `ROLE_PERMISSIONS` on every run,
and leaves custom roles intact. API authentication reloads permissions on each
request. Reload the client page to refresh `/auth/me`; re-login is unnecessary.

Parts Reports is absent in this checkout. Its permission and menu/page/API gates
are deferred per the user's instruction; a TODO is recorded in `client/constant.ts`.

## Seed mapping (`ROLE_PERMISSIONS`)

- **SuperAdmin** → every permission.
- **Auditor** → `AUDITOR_PERMISSIONS`: every permission ending in `:read` and every `report:*` except
  `report:settings`.
- **Admin** → user/role/customer/vehicle/service/workshop/inventory management +
  finance create/read.
- **GeneralStoreManager** → full inventory + full transfer lifecycle + service/vehicle/customer reads.
- **BranchStoreManager** → inventory CRUD + transfer create/read/receive (no approve/dispatch) + service/vehicle/customer reads.
- **WorkshopManager** → service full, workshop full, inventory read, vehicle read/update, customer read, finance read.
- **Accountant** → finance create/read/update.
- **ServiceAdviser** → customer/vehicle CRUD, service create/read/update, workshop read, inventory read, finance create/read.
- **Technician** → vehicle read, service read/update, workshop read/update, inventory read.
- **Receptionist** → customer read/create, vehicle read/create, service read/create, finance read.
- **ReceptionManager** → full customer/vehicle/service CRUD (no finance/inventory).

## Self-registration rules

- First user to register becomes `SuperAdmin`.
- Later self-registrations may only request `Receptionist`, `Technician`, or
  `ServiceAdviser`. Admin-assigned roles must be granted through `/api/admin/users`.
- Deactivated users cannot log in or refresh tokens.

## Frontend role gating

`client/features/auth/roles.ts` exports role groups used by pages:

- `FINANCE_ROLES` — superadmin, admin, accountant, serviceadviser (invoices/payments actions)
- `CUSTOMER_CREATE_ROLES`, `CUSTOMER_UPDATE_ROLES`, `VEHICLE_*`, `SERVICE_*`,
  `APPOINTMENT_UPDATE_ROLES`, `INVENTORY_MANAGER_ROLES`, `USER_ROLES`, `TRANSFER_ROLES`,
  etc. — used with `useAuth().hasAccess([...])` to conditionally render buttons/actions.

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>

## Job cards and estimate actions (issue #117)

Built-in permissions are reconstructed by the role seed, so change `ROLE_PERMISSIONS`, then use the approved local/deployment seed workflow. Never grant a built-in role only through a database edit.

| Role | Job card | Estimate | Parts | Job bill |
| --- | --- | --- | --- | --- |
| CCUOfficer, CCUManager | Read only | None | None | None |
| ServiceAdviser | Create from appointment, read, update; existing labour/charge-line rights retained | Read, revise, print, sign; cannot create | Cannot issue | Cannot create |
| ServiceManager | Existing job-card rights retained | Read, revise, print, sign; cannot create | Cannot issue | Cannot create |
| WorkshopManager | Existing workshop actions, assignment, progress, QC, labour | Create first estimate, read, print; cannot sign | Cannot issue | Cannot create |
| GeneralStoreManager, StoreOfficer | Read only | None | Existing issue/return rights | Cannot create |
| BillingOfficer | Read only | None | Cannot issue | Create; existing invoice/receipt rights retained |
| Admin, SuperAdmin | Existing access | New revise, print and sign actions included | Existing access | Existing access |

`estimate:revise`, `estimate:print` and `estimate:sign` are independent permissions. `estimate:approve` is retained for compatibility but no longer authorizes staff sign-off. Existing `invoice:create` is retained for service roles: the job bill endpoint separately requires `invoice:job-bill:create`. The current finance routes expose no generic invoice-create endpoint.

Job-card detail omits estimates without `estimate:read` and invoices without `invoice:read`. Nested monetary fields and the separate job labour response are omitted unless one of those read permissions exists. Operational status, customer, vehicle, complaints and progress remain available. Signature images are private estimate data; billing integrity queries select only version/total/hash evidence.

### Billing officer account runbook

No production account is created by this change. An authorized administrator should use **Users**, confirm the intended name and proposed login `billingofficer@kiamotors.com`, select **BillingOfficer**, and assign the agreed **home branch**. Do not grant `branch:all` or estimate permissions. Set and send the password privately; never put it in an issue, seed or documentation. Verify login, job-card view and job-bill creation in that branch, plus 403 for job-card writes, estimates and parts issue. Account existence and production login remain an operational acceptance check.
