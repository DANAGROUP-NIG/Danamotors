# Setup

## Prerequisites

- Node.js 18+ (Node 20 recommended)
- Yarn 1.x (`packageManager: yarn@1.22.22` in `client/package.json`)
- PostgreSQL database (local, Supabase, or Neon — any `postgres://` URL works)
- Git

## Environment variables

### Server (`server/.env`)

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port for the API | `5000` |
| `NODE_ENV` | `development`, `production`, or `test` | `development` |
| `DATABASE_URL` | PostgreSQL connection string (Prisma) | *(required)* |
| `JWT_SECRET` | Secret used to sign access tokens | *(required, ≥ 8 chars)* |
| `JWT_REFRESH_SECRET` | Secret used to sign refresh tokens | *(required, ≥ 8 chars)* |
| `JWT_ACCESS_EXPIRATION` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token lifetime | `7d` |
| `CLIENT_URL` | Frontend origin used when building password-reset links | `http://localhost:3000` |

The environment is validated on boot by a Zod schema in `server/src/config/index.ts`;
the process exits with a clear error if required variables are missing.

> Note: `server/.env` is not committed. Do not commit real credentials.

### Client (`client/.env.local`)

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API, e.g. `http://localhost:8000/api` |

## Installing dependencies

```bash
cd server && yarn install
cd ../client && yarn install
```

## Database

The schema lives in `server/prisma/schema.prisma`. Migrations live in
`server/prisma/migrations/`.

```bash
cd server

# Apply pending migrations to the configured database
npx prisma migrate deploy

# Regenerate the Prisma client after schema changes
npx prisma generate

# Create a new migration from schema changes (development)
npx prisma migrate dev --name <migration_name>

# Push the schema without a migration (ad-hoc, not recommended for prod)
npx prisma db push
```

The live database is synced with `schema.prisma` via `prisma migrate deploy`. Existing
migrations are written idempotently (`IF NOT EXISTS` / existence-checked constraints) so
they can safely run against both fresh and existing databases.

## Running locally

### Backend

```bash
cd server
yarn dev            # nodemon + ts-node, restarts on change
# or
yarn ts-node src/server.ts
```

Boot log confirms the port and database connection. Health check:

```bash
curl http://localhost:8000/api/health
# {"status":"success","message":"Dana Motors API is healthy",...}
```

### Frontend

```bash
cd client
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

> `client/package.json` still defines `next lint` which was removed in Next 16 and is
> currently **not runnable** repo-wide. Use `npx tsc --noEmit` as the type gate instead.

## Type checking

```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

Both must pass cleanly. The server additionally compiles via ts-node at boot, which
catches a few runtime-only type issues that `tsc` misses.

## Build (production)

```bash
cd server && yarn build && yarn start   # tsc → dist/, serves on config.PORT
cd client && yarn build && yarn start   # next build → .next/, serves on :3000
```

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
