# iTECify

Monorepo pentru un editor colaborativ de cod, sugestii AI și rulare în sandbox Docker.

- **Frontend:** React + TypeScript + Vite (`apps/web`)
- **Backend:** Fastify + TypeScript (`apps/api`)
- **Collab:** Yjs + `y-websocket` pe WebSocket (`apps/collab`)
- **Date:** PostgreSQL + Prisma (schema la `prisma/`)
- **Tipuri comune:** `packages/shared`

## Cerințe

- Node.js 20+
- [pnpm](https://pnpm.io) 9 (`corepack enable` apoi `corepack prepare pnpm@9.15.9 --activate`)
- Docker Desktop (sau compatibil), pentru Postgres

## Pornire rapidă

1. Clonează repo-ul și instalează dependențele:

   ```bash
   pnpm install
   ```

2. Copiază variabilele de mediu:

   ```bash
   cp .env.example .env
   ```

3. Pornește Postgres:

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```

4. Generează clientul Prisma (din rădăcina monorepo-ului):

   ```bash
   pnpm db:generate
   ```

   `package.json` de la rădăcină include `@prisma/client` lângă `prisma`, ca `prisma generate` să nu invoce `pnpm add` (util pe Windows dacă `pnpm` nu e în PATH).

   Opțional, sincronizează schema cu baza (fără migrații încă):

   ```bash
   pnpm db:push
   ```

5. Pornește toate aplicațiile în paralel:

   ```bash
   pnpm dev
   ```

   Sau individual:

   ```bash
   pnpm dev:web
   pnpm dev:api
   pnpm dev:collab
   ```

6. Deschide UI-ul la `http://localhost:5173`.

## Health checks

| Serviciu | URL                    |
| -------- | ---------------------- |
| API      | `GET http://localhost:3001/health` |
| Collab   | `GET http://localhost:1234/health` |

WebSocket Yjs: `ws://localhost:1234` (același server ca health-ul de mai sus).

## Scripturi utile (rădăcină)

| Script        | Rol                          |
| ------------- | ---------------------------- |
| `pnpm dev`    | `shared` build + apps în dev |
| `pnpm build`  | build pe toate pachetele     |
| `pnpm db:generate` | `prisma generate`       |
| `pnpm db:push`     | `prisma db push`        |
| `pnpm db:migrate`  | `prisma migrate dev`    |
| `pnpm db:studio`   | Prisma Studio           |

## Structură directoare

```
.
├── apps/
│   ├── api/          # Fastify
│   ├── collab/       # y-websocket
│   └── web/          # Vite + React
├── packages/
│   └── shared/       # tipuri + helpers mici
├── prisma/
│   └── schema.prisma
├── infra/
│   └── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Manual verification

După `pnpm dev`:

1. `curl http://localhost:3001/health` → JSON cu `"service":"api"`.
2. `curl http://localhost:1234/health` → JSON cu `"service":"collab"`.
3. Browser la `http://localhost:5173` → pagină „iTECify”.
4. `docker compose -f infra/docker-compose.yml ps` → `postgres` healthy.

Pentru Prisma: `pnpm db:studio` și verifică conexiunea la `DATABASE_URL` din `.env`.
