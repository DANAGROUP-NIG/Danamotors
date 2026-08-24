# Frontend

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4. Key libraries:
React Query v5 (`@tanstack/react-query`), Zustand, axios, react-hook-form + Zod, Sonner
(toasts), Recharts (dashboard), lucide-react (icons), Framer Motion.

## Routing

Pages live under `client/app/`. Public auth pages are in the `(auth)` group; the
authenticated workspace is in the `(dashboard)` group.

### Auth (`/`, `(auth)` group)

| Route | Purpose |
| --- | --- |
| `/login` | Sign in |
| `/register` | Self-registration (first user becomes SuperAdmin) |
| `/forgot-password` | Request a reset link (link is shown on success) |
| `/reset-password` | Complete reset via `?token=` from the email/link |

### Dashboard (`(dashboard)` group)

| Route | Purpose |
| --- | --- |
| `/dashboard` | KPIs, revenue chart, jobs by status, top technicians, inventory alerts |
| `/appointments` | Service appointments list |
| `/appointments/[id]` | Appointment detail + create job card |
| `/job-cards` | Job cards list (filter/search/paginate) |
| `/job-cards/[id]` | Job card detail: inspections, estimates, part issuances, invoices |
| `/inspections` | Inspections list |
| `/repairs` | Repairs list (backed by job cards) |
| `/quotations` | Estimates/quotations list (links to job card) |
| `/technicians` | Technicians list |
| `/customers` | Customers list |
| `/customers/[id]` | Customer detail |
| `/vehicles` | Vehicles list |
| `/vehicles/[id]` | Vehicle detail |
| `/inventory` | Parts + branch stock |
| `/inventory/[id]` | Part detail |
| `/purchase-requests` | Purchase requests |
| `/purchasing` | Purchasing list (backed by purchase requests) |
| `/transfers` | Inter-branch transfers |
| `/invoices` | Invoices list (edit / record payment via row actions) |
| `/invoices/new` | Create invoice |
| `/payments` | Payments list + "Record payment" |
| `/reports` | Reports |
| `/finance` | Finance overview |
| `/branches` | Branch management |
| `/users` | User management |
| `/users/[id]` | User detail |
| `/notifications` | In-app notifications |
| `/profile` | Current user profile |
| `/settings` | Settings |

## Feature folder convention

Each domain under `client/features/<feature>/` exports from its `index.ts` barrel:

```
features/<feature>/
├── api/
│   ├── <feature>.api.ts     # axios request functions (apiGet/apiPost/apiPut/apiPatch/apiDelete)
│   └── <feature>.keys.ts    # React Query key factory (all / lists / list(params) / details / detail(id))
├── hooks/
│   ├── use-<feature>.ts         # list query hook
│   ├── use-<feature>.ts (detail) # single-record query hook
│   └── use-create-<feature>.ts  # mutation hook (toasts + invalidates keys)
├── components/
│   ├── <feature>s-page.tsx      # page wrapper: header + actions + table
│   ├── <feature>s-table.tsx     # DataTable + toolbar
│   └── <feature>CreateForm.tsx  # react-hook-form + zod
├── types/<feature>.types.ts  # TS types mirroring API response envelope data
├── schemas/<feature>.schema.ts# Zod schemas + inferred form types
└── index.ts
```

Consistent patterns:

- Lists use the shared `DataTable` + `DataTableToolbar`
  (`client/components/ui/table-components/`) and client-side pagination.
- Create forms open in `ModalFame` (or a dedicated page like `/invoices/new`).
- Mutations `toast` success/failure, invalidate the feature's query keys, and often
  `router.push` back to the list page.
- Pages are role-gated with role arrays from `client/features/auth/roles.ts` (e.g.
  `FINANCE_ROLES`, `CUSTOMER_CREATE_ROLES`) via `useAuth().hasAccess(...)`.

## Data fetching & cache

- React Query provides hooks for every endpoint; server state is never duplicated in
  local state.
- Query keys follow `featureKeys.list(params)` / `featureKeys.detail(id)`; mutations
  invalidate the affected lists so tables refresh automatically.
- The shared axios instance (`client/lib/api/axios.ts`) attaches the access token from
  cookies and transparently refreshes expired tokens (single-flight queue, redirects to
  `/login` on failure).

## State

- **Auth store** (`store/auth.store` or `features/auth/hooks/use-auth.ts`): current
  user, tokens via cookies, `hasAccess(roles)`, `isSuperAdmin`.
- **Branch store** (`store/branch.store.ts`): `branches`, `activeBranch`. List queries
  pass `branchId: activeBranch?.id`, so switching branches re-scopes the UI.
- Theme switching via `next-themes`.

## Roles used by the frontend

Defined in `client/features/auth/roles.ts` (lowercased): `superadmin`, `admin`,
`generalstoremanager`, `branchstoremanager`, `workshopmanager`, `accountant`,
`serviceadviser`, `technician`, `receptionist`, `receptionmanager`.

## Styling

Tailwind CSS v4 (CSS-first config). Shared UI primitives live in
`client/components/ui/` (button, card, badge, input, select, table-components) and are
used across features rather than per-feature copies.

## Verification

- Type gate: `cd client && npx tsc --noEmit` (must pass).
- `npm run lint` (`next lint`) is not runnable on Next 16 — pre-existing repo issue.
- `yarn build` produces a production build; `yarn start` serves it on port 3000.

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
