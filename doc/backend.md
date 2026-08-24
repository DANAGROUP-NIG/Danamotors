# Backend

Express 4 + Prisma 6 + PostgreSQL + TypeScript. All routes are mounted under `/api`
(`server/src/routes/index.ts`). Every module folder under `server/src/modules/` follows
`routes → controller → service → repository → zod`.

## Base

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | none | Health check: `{ status, message, timestamp }` |

## Auth (`/api/auth`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/register` | none | Public self-registration. First user auto-promoted to SuperAdmin; other users can only self-assign Receptionist / Technician / ServiceAdviser |
| POST | `/login` | none | Login, returns `{ accessToken, refreshToken, user }` |
| POST | `/refresh` | none | Exchange refresh token for a new access token |
| POST | `/logout` | none | Revoke a refresh token |
| POST | `/forgot-password` | none | Generates a one-time reset token (1 h expiry). Returns the reset link in the response until a mailer is wired up |
| POST | `/reset-password` | none | Completes reset with `{ token, newPassword }`; invalidates sessions |
| POST | `/logout-all` | JWT | Revoke all refresh tokens for the user |
| GET | `/me` | JWT | Current user profile |
| PUT | `/me` | JWT | Update profile / change password (requires `currentPassword`) |

## Administration (`/api/admin`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/users` | `user:read` | List users |
| GET | `/users/:id` | `user:read` | Get user |
| POST | `/users` | `user:create` | Create user |
| PUT | `/users/:id` | `user:update` (SuperAdmin/Admin only) | Update user |
| DELETE | `/users/:id` | `user:delete` | Delete user |
| GET | `/roles` | `role:read` | List roles |
| GET | `/roles/:id` | `role:read` | Get role with permissions |
| POST | `/roles` | `role:update` | Create role |
| PUT | `/roles/:id/permissions` | `role:update` | Set role permissions |
| GET | `/permissions` | `role:read` | List permissions |

## Branches (`/api/branches`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | public | List branches (used by the frontend before login) |
| GET | `/:id` | JWT + `branch:read` | Get branch |
| POST | `/` | `branch:create` | Create branch |
| PUT | `/:id` | `branch:update` | Update branch |
| DELETE | `/:id` | `branch:delete` | Delete branch |

## Customers (`/api/customers`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/` | `customer:read` | List (branch-scoped for non-SuperAdmin; `branchId`, `search`, `page`, `limit`) |
| GET | `/:id` | `customer:read` | Get customer |
| POST | `/` | `customer:create` | Create customer |
| PUT | `/:id` | `customer:update` | Update customer |
| POST | `/:id/documents` | `customer:update` | Add document |
| GET | `/:id/documents` | `customer:read` | List documents |
| POST | `/:id/service-history` | `customer:update` | Add service history entry |
| GET | `/:id/service-history` | `customer:read` | List service history |

## Vehicles (`/api/vehicles`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/` | `vehicle:read` | List (branch-scoped via `customer.branchId`) |
| GET | `/:id` | `vehicle:read` | Get vehicle |
| POST | `/` | `vehicle:create` | Create vehicle |
| PUT | `/:id` | `vehicle:update` | Update vehicle |
| DELETE | `/:id` | `vehicle:delete` | Delete vehicle |
| POST | `/:id/images` | `vehicle:update` | Add image |
| GET | `/:id/images` | `vehicle:read` | List images |
| POST | `/:id/ownerships` | `vehicle:update` | Add ownership record |
| GET | `/:id/ownerships` | `vehicle:read` | List ownership history |

## Service (`/api/service`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| POST | `/appointments` | `service:create` | Book appointment |
| GET | `/appointments` | `service:read` | List appointments |
| GET | `/appointments/:id` | `service:read` | Get appointment |
| PUT | `/appointments/:id` | `service:update` | Update appointment |
| DELETE | `/appointments/:id` | `service:delete` | Delete appointment |
| POST | `/job-cards` | `service:create` | Create job card |
| GET | `/job-cards` | `service:read` | List job cards (`branchId`, `status`, `search`, `page`, `limit`) |
| GET | `/job-cards/:id` | `service:read` | Get job card (with inspections, estimates, part issuances, invoices) |
| PUT | `/job-cards/:id` | `service:update` | Update job card |
| GET | `/inspections` | `service:read` | List inspections (`status`, `search`, `page`, `limit`) |
| POST | `/job-cards/:id/inspections` | `service:create` | Add inspection |
| GET | `/estimates` | `service:read` | List estimates / quotations |
| POST | `/job-cards/:id/estimates` | `service:create` | Add estimate |
| POST | `/estimates/:id/approvals` | `service:create` | Record customer approval |
| GET | `/estimates/:id/approvals` | `service:read` | List approvals for an estimate |

## Workshop (`/api/workshop`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/technicians` | `workshop:read` | List users with the `Technician` role (branch-aware) |
| POST | `/assign/:id` | `workshop:update` | Assign technician to a job card |
| PATCH | `/progress/:id` | `workshop:update` | Update job progress / status |
| PATCH | `/qc/:id` | `workshop:update` | Quality-control update |

## Inventory (`/api/inventory`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| GET | `/parts` | `inventory:read` | List spare parts |
| GET | `/parts/:id` | `inventory:read` | Get part |
| POST | `/parts` | `inventory:create` | Create part |
| PUT | `/parts/:id` | `inventory:update` | Update part |
| DELETE | `/parts/:id` | `inventory:delete` | Delete part |
| GET | `/stock` | `inventory:read` | All branch stock |
| GET | `/stock/:branchId` | `inventory:read` | Stock for a branch |
| GET | `/stock/:branchId/:partId` | `inventory:read` | Single part stock at a branch |
| POST | `/stock/adjust` | `inventory:update` | Adjust stock quantity (records a transaction) |
| GET | `/transactions` | `inventory:read` | Stock transactions |
| POST | `/purchase-requests` | `inventory:create` | Create purchase request |
| GET | `/purchase-requests` | `inventory:read` | List (`page`, `limit`, `status`) |
| GET | `/purchase-requests/:id` | `inventory:read` | Get purchase request |
| PATCH | `/purchase-requests/:id/status` | `inventory:update` | Update purchase request status |
| POST | `/issuances` | `inventory:create` | Issue part to a job card |
| GET | `/issuances` | `inventory:read` | List part issuances |
| GET | `/issuances/:id` | `inventory:read` | Get issuance |
| POST | `/returns` | `inventory:create` | Return an issued part |
| GET | `/returns` | `inventory:read` | List part returns |
| GET | `/returns/:id` | `inventory:read` | Get return |
| POST | `/transfers` | `transfer:create` | Create inter-branch transfer |
| GET | `/transfers` | `transfer:read` | List transfers |
| GET | `/transfers/:id` | `transfer:read` | Get transfer |
| PATCH | `/transfers/:id/approve` | `transfer:approve` | Approve transfer |
| PATCH | `/transfers/:id/dispatch` | `transfer:dispatch` | Mark dispatched |
| PATCH | `/transfers/:id/receive` | `transfer:receive` | Mark received (creates stock movements) |
| PATCH | `/transfers/:id/reject` | `transfer:approve` | Reject transfer |
| PATCH | `/transfers/:id/cancel` | `transfer:update` | Cancel transfer |

## Finance (`/api/finance`)

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| POST | `/invoices` | `finance:create` | Create invoice (branch-guarded against customer/job card) |
| GET | `/invoices` | `finance:read` | List invoices (`branchId`, `customerId`) |
| GET | `/invoices/:id` | `finance:read` | Get invoice |
| PUT | `/invoices/:id` | `finance:update` | Update invoice (due date, amounts, status, notes) |
| DELETE | `/invoices/:id` | `finance:update` | Delete invoice |
| POST | `/payments` | `finance:create` | Record payment (auto-updates invoice status; fires `INVOICE_PAID` notification) |
| GET | `/payments` | `finance:read` | List payments |
| GET | `/payments/:id` | `finance:read` | Get payment |
| POST | `/receipts` | `finance:create` | Issue receipt |
| GET | `/receipts` | `finance:read` | List receipts |
| GET | `/receipts/:id` | `finance:read` | Get receipt |
| GET | `/reports/summary` | `finance:read` | Summary report (`startDate`, `endDate`) |
| GET | `/reports/invoices` | `finance:read` | Invoice report (`startDate`, `endDate`) |
| GET | `/dashboard/overview` | `finance:read` | Finance dashboard overview |

## Dashboard (`/api/dashboard`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/stats` | JWT | Branch-aware KPIs + `inventoryAlerts` (stock at/below minimum). Cross-branch for SuperAdmin / GeneralStoreManager / ReceptionManager |

## Search & Notifications

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/search` | JWT | Global search |
| GET | `/api/notifications` | JWT | List notifications |
| GET | `/api/notifications/unread-count` | JWT | Unread count |
| PATCH | `/api/notifications/read-all` | JWT | Mark all read |
| PATCH | `/api/notifications/:id/read` | JWT | Mark one read |

## Response envelope

Success responses use a consistent envelope:

```json
{ "status": "success", "statusCode": 200, "message": "...", "data": { ... } }
```

Errors are handled centrally by `server/src/middleware/errorHandler.ts`:

```json
{ "status": "error", "statusCode": 400, "message": "..." }
```

## Authentication & authorization pipeline

1. `authMiddleware` verifies the `Bearer` access token and checks the user is still
   `isActive` in the database; populates `req.user`.
2. `requirePermission(<PERMISSIONS.X>)` or `requireRole(...)` gates the endpoint.
3. `validateRequest(schema)` validates `body`/`params`/`query` with Zod.
4. Controllers add branch-scoping/ownership guards where relevant.

## Known limitations

- No email transport is wired yet; `POST /auth/forgot-password` returns the reset link
  directly in the response (envelope `data.resetLink`). `nodemailer` is already a
  dependency for future wiring.
- Request body size for file uploads (customer documents, vehicle images) uses
  `multer`; cloudinary integration is available as a dependency.

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
