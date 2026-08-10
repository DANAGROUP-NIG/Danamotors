# Dana Motors Documentation

Dana Motors is the service workshop platform. It is a monorepo containing a
Next.js web client and an Express + Prisma API server.

## Monorepo layout

```
danamotors/
├── client/   # Next.js 16 (App Router) + React 19 + TypeScript frontend
├── server/   # Express 4 + Prisma 6 + PostgreSQL + TypeScript backend
├── doc/      # Project documentation (this folder)
└── Readme.md # Top-level project readme
```

## Docs index

| Document | Contents |
| --- | --- |
| [setup.md](./setup.md) | Prerequisites, environment variables, local development, migrations, seeding |
| [architecture.md](./architecture.md) | System overview, monorepo structure, backend layering, frontend structure |
| [backend.md](./backend.md) | Backend modules, REST API routes, auth model, branch isolation, error handling |
| [frontend.md](./frontend.md) | Frontend routes, feature folders, data fetching, state, auth flow |
| [database.md](./database.md) | Prisma data model, core entities and relations |
| [roles-and-permissions.md](./roles-and-permissions.md) | Roles, permissions, and seed mappings |

## Quick start

```bash
# Backend (port 8000)
cd server
cp .env.example .env   # if provided; otherwise set the vars in doc/setup.md
yarn install
npx prisma migrate deploy
yarn dev

# Frontend (port 3000)
cd client
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000). The API health check is at
[http://localhost:8000/api/health](http://localhost:8000/api/health).

## Author

Built by **buildwithzeke** (Aye Oluwaseyi) — <ayeoluwaseyi@gmail.com>
