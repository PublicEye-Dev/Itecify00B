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
   cp apps/.env.example .env
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

   Seed pentru conturile demo:

   ```bash
   pnpm db:seed
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

| Serviciu | URL                                |
| -------- | ---------------------------------- |
| API      | `GET http://localhost:3001/health` |
| Collab   | `GET http://localhost:1234/health` |

WebSocket Yjs: `ws://localhost:1234` (același server ca health-ul de mai sus).

### Editor colaborativ (Yjs + Monaco)

- Din dashboard, **Deschide** același workspace în două taburi folosind aceeași rută `/workspace/:id` (ID-ul din listă).
- **Room / workspace:** numele room-ului pentru `WebsocketProvider` este `workspaceId` (trebuie identic în toate taburile).
- **Forma documentului:** într-un `Y.Doc` există un singur `Y.Map` la cheia `files` (vezi `packages/shared/src/collab`). Fiecare cheie este calea fișierului, valoarea este `Y.Text`.
- **Seed / snapshot:** la deschidere, clientul cere `GET /workspaces/:id/snapshot`; dacă primește update Yjs, aplică `Y.applyUpdate` **înainte** de WebSocket. După editări, `PUT` debounced persistă starea în coloana `workspaces.snapshot` (JSONB). Dacă nu există snapshot, serverul returnează `{ version: 1, update: [] }` și clientul face bootstrap minim (`README.md`) sau folosește template-ul creat la `POST /workspaces`.
- **Reconnect:** `y-websocket` reconectează automat. Folosește **`http://localhost:5173`** (și același host pentru API/collab), nu amesteca `127.0.0.1` cu `localhost`: cookie-ul de sesiune poate să nu fie trimis la handshake-ul WebSocket pe alt „site”.

Variabile utile în `.env`: `VITE_API_URL`, `VITE_COLLAB_WS_URL`.

### Runner Docker (Phase 1)

- În editor, butonul **Rulează (template) în Docker** salvează snapshot-ul, apoi `POST /jobs` și afișează stdout/stderr când job-ul ajunge într-o stare terminală.
- Necesită **Docker Desktop** (sau daemon compatibil) și prima rulare poate descărca imaginile din `apps/api/src/modules/runtime-templates/recipes.ts`.

## Authentication

- **Auth flow:** email + password, cu cookie de sesiune `httpOnly` și `SameSite=Lax`; în dezvoltare, `AUTH_COOKIE_SECURE=false` permite rularea pe `http://localhost`.
- **Endpoint-uri:** `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`.
- **Protecție:** snapshot-urile API și conexiunile WebSocket de colaborare cer sesiune validă; browserul nu persistă token-uri în `localStorage`.
- **Roluri:** `owner`, `editor`.
- **Conturi demo seed-uite:**
  - `owner@itecify.demo` / `DemoPass123!`
  - `editor1@itecify.demo` / `DemoPass123!`
  - `editor2@itecify.demo` / `DemoPass123!`

## Scripturi utile (rădăcină)

| Script             | Rol                          |
| ------------------ | ---------------------------- |
| `pnpm dev`         | `shared` build + apps în dev |
| `pnpm build`       | build pe toate pachetele     |
| `pnpm db:generate` | `prisma generate`            |
| `pnpm db:push`     | `prisma db push`             |
| `pnpm db:migrate`  | `prisma migrate dev`         |
| `pnpm db:seed`     | `prisma db seed`             |
| `pnpm db:studio`   | Prisma Studio                |

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

## Dev pe Windows / de ce vezi „Failed” după `pnpm dev`

- **`^C` în terminal = Ctrl+C (întrerupere manuală).** `pnpm dev` pornește **în paralel** web, api și collab; un singur Ctrl+C oprește toate procesele, iar pnpm le marchează pe fiecare ca **Failed** — nu înseamnă neapărat că au crăpat singure.
- **Vite și `.env`:** cu `envDir` la rădăcina monorepo-ului, Vite urmărea `.env` și repornește la salvare. În `vite.config.ts`, fișierele tipice (`.env`, `.env.local`, `.env.development` …) sunt ignorate la **watch** ca să nu tot vezi „restarting server”; variabilele `VITE_*` se tot citesc la pornire — dacă le editezi, repornește manual Vite.
- **Loguri mai clare:** `pnpm dev` folosește `--stream` ca fiecare linie să aibă prefix de pachet (`@itecify/api`, etc.), iar api/collab afișează `Starting…` / `Ready`. În dev, Fastify folosește `logger: false` — Pino bufferizează stdout când nu e TTY (sub pnpm), deci înainte puteai vedea doar Vite.

## Manual verification

După `pnpm dev`:

1. `curl http://localhost:3001/health` → JSON cu `"service":"api"`.
2. `curl http://localhost:1234/health` → JSON cu `"service":"collab"`.
3. Browser la `http://localhost:5173` → pagină „iTECify”.
4. `docker compose -f infra/docker-compose.yml ps` → `postgres` healthy.

Pentru Prisma: `pnpm db:studio` și verifică conexiunea la `DATABASE_URL` din `.env`.

Pentru auth:

1. Rulează `pnpm db:push` apoi `pnpm db:seed`.
2. Deschide `http://localhost:5173` și autentifică-te cu unul dintre conturile demo.
3. Verifică în DevTools că răspunsurile `POST /auth/login` și `GET /auth/me` funcționează, iar cookie-ul `itecify_session` este `httpOnly` și nu există niciun token în `localStorage`.
4. Reîncarcă pagina: sesiunea trebuie restaurată automat și workspace-ul rămâne accesibil.
5. Apasă `Logout`: `POST /auth/logout` trebuie să golească sesiunea, iar o nouă cerere la `GET /auth/me` trebuie să întoarcă `401`.
6. Opțional, deschide aplicația într-un tab incognito fără login și confirmă că snapshot-ul și WebSocket-ul nu se conectează.
