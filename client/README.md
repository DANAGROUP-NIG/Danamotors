# Dana Motors Frontend

Dana Motors car service workshop platform — web client. Built with Next.js 16
(App Router), React 19, TypeScript, Tailwind CSS v4, TanStack Query, Zustand, Sonner,
Recharts, React Hook Form, Zod, and lucide-react.

The frontend is the staff workspace for the workshop: customers, vehicles,
appointments, job cards, inspections, repairs, quotations, technicians, inventory,
purchasing, transfers, invoices, payments, reports, and administration.

## Getting started

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

Set `NEXT_PUBLIC_API_URL` in `.env.local` to point at the backend API, e.g.
`http://localhost:8000/api`. See the backend repo root and `doc/` for the API server.

## Type checking & builds

```bash
npx tsc --noEmit   # type gate
yarn build         # production build
yarn start         # serve the build on :3000
```

> Note: `yarn lint` (`next lint`) is not runnable because Next.js 16 removed `next lint`.

## Project structure

- `app/(auth)/` — login, register, forgot-password, reset-password
- `app/(dashboard)/` — the authenticated workspace (see `doc/frontend.md` for the route map)
- `features/<feature>/` — per-domain code: `api/`, `hooks/`, `components/`, `types/`,
  `schemas/`, `index.ts`
- `lib/api/` — axios client with automatic token refresh
- `store/` — Zustand stores (branch, auth)
- `components/ui/` — shared UI primitives and table components

Full frontend documentation: [../doc/frontend.md](../doc/frontend.md).

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
