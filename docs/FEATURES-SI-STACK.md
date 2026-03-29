# iTECify — Core features, technology stack, and principles

This document summarizes what the application does (at a product level), which technologies back each area, and how those technologies work **in principle** (without replacing the official documentation).

---

## 1. Overview

| Area | App in monorepo | Short role |
|------|-----------------|------------|
| UI | `apps/web` | React, Monaco editor, Yjs collaboration, dashboard, runner, history |
| API | `apps/api` | REST, authentication, workspaces, snapshots, Docker jobs, AI (Gemini) |
| Live collaboration | `apps/collab` | WebSocket server for Yjs sync between clients |
| Types & contracts | `packages/shared` | Zod schemas, DTOs, collaboration constants |
| Persistence | `prisma/` + PostgreSQL | User models, workspaces, snapshots, checkpoints, AI suggestions |

Monorepo: **pnpm workspaces** — a single lockfile, shared dependencies, and the `@itecify/shared` package consumed by all apps.

---

## 2. Core features → technologies

### 2.1 Authentication and sessions

- **What it does:** signup, login, logout; session persisted in the browser; roles (owner / editor) for workspaces.
- **Technologies:** **Fastify** (HTTP), **@fastify/cookie**, **Argon2** (password hashing), **PostgreSQL** (Prisma: `User`, `Session`).
- **Principles:**
  - **`httpOnly` cookie:** the session token is not accessible from JavaScript, which reduces theft risk via XSS compared to `localStorage`.
  - **Argon2:** a deliberately expensive function (memory + CPU) for key derivation, resistant to rainbow tables and dedicated hardware; a modern alternative to bcrypt.
  - **Server-side session:** the server validates the cookie on every protected request; a client-side JWT is not required for the typical same-site SPA + API flow.

### 2.2 Workspaces and shared access

- **What it does:** create workspace, list, details, join via **share token**, members with roles.
- **Technologies:** **Fastify** + REST routes, **Prisma** (`Workspace`, `WorkspaceMember`), **Zod** (response body validation in `packages/shared`).
- **Principles:**
  - **Unique share token:** a hard-to-guess identifier for invites without a public directory listing.
  - **Zod:** declarative schema — the same contract can be used for validation and TypeScript type inference.

### 2.3 Collaborative code editor

- **What it does:** multiple files in a workspace; simultaneous editing; cursors/positions synced through the same Yjs document.
- **Technologies:** **React**, **Monaco Editor**, **Yjs**, **y-websocket**, **y-monaco** (Monaco ↔ `Y.Text` binding), **`apps/collab`** server.
- **Principles:**
  - **CRDT (Yjs):** each change is an operation with identities and causal ordering; any replica that applies the same set of updates converges to **the same state**, without a manual merge like Git.
  - **WebSocket:** full-duplex connection suited to a continuous stream of small binary updates (Yjs), unlike HTTP polling.
  - **Room = workspaceId:** all clients in the same room share the same `Y.Doc`.

### 2.4 Editor data model (`Y.Doc`)

- **What it does:** a `Y.Map` at the `files` key; each file = `Y.Text` (text content).
- **Technologies:** **Yjs** (`Y.Doc`, `Y.Map`, `Y.Text`), defined in `packages/shared` (collaboration contract).
- **Principles:**
  - **Map of texts:** many files in one replicated document with granular operations per file.
  - **Encode / decode:** state can be serialized as a binary update for the DB or the network.

### 2.5 Snapshot persistence (cold start)

- **What it does:** on load, the client reads the latest snapshot from the API; after edits, debounced autosave writes to `workspaces.snapshot` (JSON with Yjs update).
- **Technologies:** **REST PUT**, **Prisma**, **PostgreSQL** (JSON/JSONB).
- **Principles:**
  - **Snapshot = encoded Yjs state:** there are no separate per-path file rows in the DB, but a single versioned `WorkspaceSnapshotV1` payload.
  - **Limitation:** at the DB level, two successive PUTs are typically **last-write-wins**; correct convergence between clients comes from **live Yjs**, not row-level SQL merge.

### 2.6 History and replay (checkpoints)

- **What it does:** points in time (autosave, before run, after AI accept, manual save); read-only preview; restore with optional reset of the Yjs room on the collab server.
- **Technologies:** **Prisma** (`WorkspaceSnapshotCheckpoint`), **API** (list, GET payload, POST, restore), client with read-only **Monaco** on a separate `Y.Doc`.
- **Principles:**
  - **Append-only history:** each checkpoint is a new row — easy to audit and revert to a version.
  - **Restore + collab:** if the DB is updated but the Yjs room memory is not, connected clients could stay on stale state; hence the HTTP `POST /room/restore` flow to **collab** (shared secret) to align in-memory state.

### 2.7 AI code suggestions

- **What it does:** generate structured suggestions (replace / insert / delete); the user accepts or rejects; on accept, the client checks whether the target text changed in the meantime.
- **Technologies:** **Google Generative AI (Gemini)** via `@google/generative-ai`, **Prisma** (`AiSuggestion`), **Zod** (suggestion schema), client-side conflict validation (`sourceSpanText`).
- **Principles:**
  - **Structured output:** the model is steered toward schema-validated JSON — fewer free-form patches and more control.
  - **Conditional accept:** comparing the current range to the text at generation time avoids blind overwrite if someone else edited the same region.

### 2.8 Run Pipeline (Docker sandbox + Semgrep)

- **What it does:** materialize the workspace snapshot to disk, run a **Semgrep** scan, then build/run in containers with resource limits; stream logs to the UI.
- **Technologies:** **Docker** (Docker API or CLI from code), **Fastify** (job + stream), **Prisma** (`RunJob`), **Semgrep** as a dedicated image/container where applicable.
- **Principles:**
  - **Isolation:** user code runs in a container, not directly on the host.
  - **Scan before execution:** static analysis to block or warn by severity (configurable).
  - **SSE or HTTP stream:** the server can push events incrementally without the client repeatedly requesting the whole job.

### 2.9 In-browser terminal (when enabled in the UI)

- **Technologies:** **xterm.js** (+ fit addon) — terminal emulation in canvas/HTML; real data comes from the backend/sandbox per project routes.
- **Principles:** the terminal is a **display client**; protocol and security depend on how the API exposes the shell (limits, unprivileged user, timeouts).

### 2.10 Frontend SPA and build

- **Technologies:** **Vite** (dev server + bundling), **React 18**, **React Router**, **TypeScript**.
- **Principles:**
  - **Vite:** native ES modules in dev for fast loading; production build outputs optimized assets.
  - **React:** declarative UI, component state and effects for Yjs/WebSocket integration.

### 2.11 Backend API

- **Technologies:** **Fastify**, **@fastify/cors**, **Zod** (validation), **Prisma Client**.
- **Principles:**
  - **Fastify:** plugins (cookie, websocket where needed), good I/O performance, optional response schema.
  - **Prisma:** typed **ORM** — migrations and DB access without hand-written SQL for typical CRUD; migrations preserve schema history.

### 2.12 Database

- **Technologies:** **PostgreSQL**.
- **Principles:** ACID transactions, JSONB for flexible snapshots, indexes and explicit relations in the Prisma schema; fits relational data and document-like snapshots in one system.

---

## 3. Simple logical diagram (flows)

```
Browser (React + Monaco + Yjs)
    │  HTTPS / session cookie
    ▼
API Fastify ───────────────► PostgreSQL (Prisma)
    │
    │  (optional room restore)
    ▼
Collab (WebSocket + Yjs) ◄──► Clients connected to the same room
```

- **Live source of truth** for edited content: **Yjs** over the WebSocket session.
- **Persisted source of truth** for later opens: **snapshot** in Postgres (and checkpoints for history).

---

## 4. Maintaining this document

When adding major features: extend section 2 with a new subsection (what it does → stack → principles) and, if needed, update the diagram in section 3.

---

*Architecture reference for the iTECify repository. For local setup and environment variables, see `README.md` in the project root.*
