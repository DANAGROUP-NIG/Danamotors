# Dana Motors — Service Workshop Platform

Dana Motors is a web platform for running a car service workshop. It covers the full
service lifecycle — booking appointments, job cards, inspections, estimates and customer
approvals, repairs, parts inventory (including inter-branch transfers), invoicing,
payments and receipts — with role-based access control and per-branch isolation.

## Repository layout

```
danamotors/
├── client/   # Next.js 16 (App Router) + React 19 + TypeScript frontend
├── server/   # Express 4 + Prisma 6 + PostgreSQL + TypeScript API
├── doc/      # Project documentation
└── Readme.md
```

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, TanStack Query, Zustand, react-hook-form, Zod, Recharts, Sonner |
| Backend | Express 4, TypeScript, Prisma ORM, PostgreSQL, JWT auth, Zod validation |
| Auth | Access + refresh JWTs, hashed refresh tokens, role & permission middleware |
| Infra | Supabase/Neon PostgreSQL; REST API under `/api` |

## Features

- **Auth** — register/login, JWT refresh, password reset (one-time tokens), self-registration role rules
- **Customers & vehicles** — profiles, documents, service history, images, ownership records
- **Service pipeline** — appointments → job cards → inspections → estimates → customer approvals → repairs
- **Inventory** — spare parts, per-branch stock, stock transactions, purchase requests, part issuance/returns, inter-branch transfers
- **Finance** — invoices, payments (auto status updates), receipts, reports
- **Workshop** — technician list, assignment, progress and QC updates
- **Dashboard** — branch-aware KPIs, revenue, jobs by status, top technicians, stock alerts
- **Notifications** — per-user and per-role in-app notifications
- **Administration** — users, roles and permissions management

## Getting started

See [doc/setup.md](./doc/setup.md) for full instructions.

```bash
# 1. Backend on http://localhost:8000
cd server
yarn install
npx prisma migrate deploy   # needs DATABASE_URL in server/.env
yarn dev

# 2. Frontend on http://localhost:3000
cd client
yarn install
yarn dev
```

Health check: `http://localhost:8000/api/health`

## Documentation

The `doc/` folder contains everything you need:

- [doc/README.md](./doc/README.md) — docs index
- [doc/setup.md](./doc/setup.md) — prerequisites, environment variables, local dev, migrations
- [doc/architecture.md](./doc/architecture.md) — system overview and layering
- [doc/backend.md](./doc/backend.md) — backend modules and full API route reference
- [doc/frontend.md](./doc/frontend.md) — frontend routes, features, data fetching
- [doc/database.md](./doc/database.md) — data model and relations
- [doc/roles-and-permissions.md](./doc/roles-and-permissions.md) — RBAC model

## Development notes

- Type gate for both packages: `npx tsc --noEmit`
- `client/package.json` `next lint` is not runnable on Next 16 (removed upstream).
- All migrations must remain idempotent (they run against the live database).

## License

MIT (see `server/package.json` author field).

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
