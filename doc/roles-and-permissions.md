# Roles & Permissions

The single source of truth is `server/src/shared/constants/roles.ts`. Roles and
permissions are seeded into the database; API routes enforce access with
`requirePermission(...)` / `requireRole(...)`. The frontend mirrors the role names
(lowercased) in `client/features/auth/roles.ts` to gate UI actions.

## Roles

| Role | Scope | Responsibilities |
| --- | --- | --- |
| `SuperAdmin` | Global | Full access to everything. First registered user is auto-promoted here. |
| `Admin` | Global | User/role management, full CRUD on customers/vehicles/service/inventory/finance reads. |
| `GeneralStoreManager` | Cross-branch | Manages inventory and transfers across ALL branches. |
| `BranchStoreManager` | Own branch | Inventory + transfers for the assigned branch. |
| `WorkshopManager` | Own branch | Workshop floor: job cards, technician assignment, QC, inventory. |
| `Accountant` | Own branch | Finance create/read/update. |
| `ServiceAdviser` | Own branch | Estimates, approvals, customer liaison, finance reads. |
| `Technician` | Own branch | Vehicle/service reads, job-card progress updates, workshop updates. |
| `Receptionist` | Own branch | Registers customers, books appointments, manages vehicles. |
| `ReceptionManager` | Cross-branch | Manages receptionists; full CRUD on customers/vehicles/appointments. |

## Permissions

| Permission | Key |
| --- | --- |
| Users | `user:read`, `user:create`, `user:update`, `user:delete` |
| Roles | `role:read`, `role:update` |
| Branches | `branch:read`, `branch:create`, `branch:update`, `branch:delete` |
| Customers | `customer:read`, `customer:create`, `customer:update`, `customer:delete` |
| Vehicles | `vehicle:read`, `vehicle:create`, `vehicle:update`, `vehicle:delete` |
| Service | `service:read`, `service:create`, `service:update`, `service:delete` |
| Workshop | `workshop:read`, `workshop:update` |
| Inventory | `inventory:read`, `inventory:create`, `inventory:update`, `inventory:delete` |
| Transfers | `transfer:read`, `transfer:create`, `transfer:update`, `transfer:approve`, `transfer:dispatch`, `transfer:receive` |
| Finance | `finance:read`, `finance:create`, `finance:update` |

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
