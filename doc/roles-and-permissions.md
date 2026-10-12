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
| `ServiceAdviser` | Own branch | Estimates, approvals, customer liaison, finance reads. |
| `Technician` | Own branch | Vehicle/service reads, job-card progress updates, workshop updates. |
| `CCUOfficer` | Own branch | Registers customers, books appointments, manages vehicles. |
| `CCUManager` | Cross-branch operations | Manages CCU staff and reception operations. |
| `ServiceManager` | Cross-branch operations; own-branch inventory | Manages service operations. |
| `WarrantyOfficer` | Cross-branch operations; own-branch inventory | Warranty claims and campaigns. |

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
