# Architecture

## System overview

Dana Motors is a two-part monorepo:

- **`client/`** — Next.js 16 (App Router) single-page-style web app. Renders the
  workshop management UI (dashboard, customers, job cards, inventory, finance, etc.)
  and talks to the API over HTTP/JSON.
- **`server/`** — Express 4 REST API backed by PostgreSQL (via Prisma ORM). All data,
  authorization, and business rules live here.

There is no customer-facing mobile app; "Dana Motors" the platform is the web client used
by workshop staff (reception, service advisers, workshop/store managers, accountants,
technicians).

## Backend layering

Each feature module follows a strict vertical layering:

```
routes (Express Router, validation, permission middleware)
   ↓
controller (HTTP concerns: req/res, branch guards)
   ↓
service    (business rules, orchestration, notifications)
   ↓
repository (Prisma data access)
   ↓
PostgreSQL
```

Files per module: `<name>.routes.ts`, `<name>.controller.ts`, `<name>.service.ts`,
`<name>.repository.ts`, `<name>.validation.ts` (Zod).

### Modules

| Module | Purpose |
| --- | --- |
| `auth` | Register, login, refresh, logout, me, password reset |
| `administration` | Users, roles, permissions management |
| `branch` | Branch CRUD |
| `customer` | Customer CRUD, documents, service history |
| `vehicle` | Vehicle CRUD, images, ownership history |
| `service` | Appointments, job cards, inspections, estimates, approvals |
| `workshop` | Technicians, workshop operations |
| `inventory` | Parts, stock, stock transactions, purchase requests, part issuance/return, inter-branch transfers |
| `finance` | Invoices, payments, receipts, reports |
| `dashboard` | KPI stats and inventory alerts |
| `search` | Global search |
| `notification` | In-app notifications (per-user and per-role) |
| `notifications` (route) | User notification endpoints |

### Cross-cutting concerns

- `server/src/middleware/authMiddleware.ts` — async JWT verification + DB `isActive`
  check; populates `req.user` (`userId`, `email`, `role`, `permissions`, `branchId`).
- `server/src/middleware/authorize.ts` — `requirePermission(...)` for endpoint
  permission checks and `assertBranchOwnership(req, branchId)` for branch isolation.
- `server/src/middleware/errorHandler.ts` — global error handler; converts typed
  `AppError`s to proper HTTP status codes.
- `server/src/shared/errors/appError.ts` — typed error classes (BadRequest, Unauthorized,
  Forbidden, NotFound, Conflict, etc.).
- `server/src/shared/constants/roles.ts` — the single source of truth for `ROLES`,
  `PERMISSIONS`, and `ROLE_PERMISSIONS`.

### Branch isolation

Non-`SuperAdmin` users are scoped to their assigned branch. This is enforced in two ways:

1. **List scoping** — controllers override the `branchId` query param with the caller's
   `branchId` for any user who is not `SuperAdmin`.
2. **Ownership guards** — single-record endpoints call `assertBranchOwnership(req, branchId)`
   where the record's branch is derived (e.g. `invoice.jobCard.branchId` or
   `invoice.customer.branchId`).

Cross-branch roles that bypass branch scoping where allowed: `SuperAdmin`,
`GeneralStoreManager` (inventory), `ReceptionManager` (customer/vehicle/service), and
`WorkshopManager` (technicians).

## Frontend structure

```
client/
├── app/                       # Next.js App Router pages
│   ├── (auth)/                # login, register, forgot-password, reset-password
│   └── (dashboard)/           # authenticated workspace + feature routes
├── components/                # shared UI (buttons, cards, tables, modals, headers)
├── features/                  # per-domain feature folders
│   └── <feature>/
│       ├── api/               # axios request functions + React Query keys
│       ├── hooks/             # React Query hooks (useX, useCreateX, …)
│       ├── components/        # page + table + form components
│       ├── types/             # TS types mirroring API responses
│       ├── schemas/           # Zod schemas + inferred form types
│       └── index.ts           # feature barrel
├── lib/                       # axios client, apiRoutes, auth/session helpers
├── store/                     # Zustand stores (branch, auth, …)
└── constant.ts                # shared constants (e.g. SPARKLINES for KPIs)
```

### Data fetching

React Query v5 (`@tanstack/react-query`) wraps every endpoint. Each feature exposes
query hooks (`useX`) and mutation hooks (`useCreateX` / `useUpdateX`). Query keys follow
a `featureKeys.list(params)` / `featureKeys.detail(id)` convention so mutations can
invalidate the right lists. Mutations show toasts via `sonner`.

### State

- **Auth** — token + user session handled through cookie helpers in
  `client/lib/auth/session.ts`.
- **Branch** — active branch + branch list in a Zustand store
  (`client/store/branch.store.ts`). Almost every list query passes `branchId:
  activeBranch?.id`, so switching branches re-scopes the whole UI.
- The Axios instance (`client/lib/api/axios.ts`) attaches the access token, and its
  response interceptor transparently refreshes expired access tokens (with a
  single-flight queue) and redirects to `/login` on refresh failure.

## Request flow example (record a payment)

1. Payments page button opens `RecordPaymentModal` (features/invoices).
2. `useCreatePayment` posts `POST /finance/payments` via `createPaymentRequest`.
3. Axios attaches `Bearer <access token>`; on 401 the interceptor refreshes.
4. Route middleware: `authMiddleware` → `requirePermission(FINANCE_CREATE)` →
   `validateRequest(createPaymentSchema)`.
5. Controller resolves the invoice's branch, runs `assertBranchOwnership`, then delegates
   to the service which records the payment, recomputes the invoice status, and fires an
   `INVOICE_PAID` notification when fully paid.
6. On success the hook invalidates payments + invoices lists and toasts.

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
