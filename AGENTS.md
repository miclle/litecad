# AGENTS.md

Technical specification for AI coding assistants working on this project.

## Project Overview

litecad is a Go + React single-page application for AI-assisted CAD exploration and browser-native 3D preview. It is product code, not just a template, but it still uses the compact single-binary architecture inherited from `miclle/goblet`: the backend embeds frontend build output via `//go:embed`, so production deployment requires one executable plus a database.

Current implemented product surface:

- Three.js home-page preview prototype and CAD-oriented project workbench shell.
- Account registration/login/logout with an `HttpOnly` `litecad_session` cookie.
- Session-scoped project creation, listing, and detail lookup.
- Studio status endpoint for bootstrap/product-state messaging.

Do not document or implement AI generation, STEP parsing, file upload, mesh conversion, measurement, export, or persisted CAD geometry as completed unless the code actually implements them.

## Tech Stack

- Backend: Go 1.26 + `fox-gonic/fox` + GORM + PostgreSQL (default) / MySQL
- Frontend: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4
  - React Router v7 (routing)
  - React Query v5 (server state)
  - Axios (HTTP client)
  - Lucide React (icons)
  - Three.js (browser 3D previews/viewer shell)

## Development Commands

```bash
task install        # Install Go modules and frontend dependencies
task dev            # Start development environment (hot reload)
task build          # Build production binary (with embedded frontend)
task build-all      # Cross-compile for multiple platforms
task run            # Run in production mode
task lint           # Auto-fix code style and run checks
task check          # Full checks (backend + frontend types + mod tidy)
task test           # Run tests (race detection + coverage)
task clean          # Remove build artifacts
task update-tools   # Install/update dev tools
```

## Directory Overview

```text
cmd/litecad/                  # Application entry point and local config
internal/config/              # YAML config loading (PostgreSQL / MySQL)
internal/database/            # GORM database connection and schema migration
internal/entity/              # GORM models and persistence types
internal/handler/             # HTTP handlers, route registration, middleware
internal/service/             # Business logic, database operations
internal/errors/              # Legacy centralized status errors
pkg/httperr/                  # Generic HTTP-status-aware errors
pkg/id/                       # Prefixed ULID helpers
pkg/secret/                   # Random secret and digest helpers
pkg/strutil/                  # Pure string helpers
pkg/gormlog/                  # GORM logger adapter
website/                      # Embedded SPA (frontend + go:embed glue)
  ├── assets_development.go   #   Dev mode: reverse-proxy to Vite dev server
  ├── assets_production.go    #   Prod mode: go:embed static assets
  ├── package.json
  ├── vite.config.ts
  ├── tsconfig*.json
  ├── eslint.config.js
  ├── vitest.config.ts
  ├── components.json         #   shadcn configuration
  ├── index.html
  ├── public/
  ├── build/                  #   Vite build output (embedded)
  └── src/
      ├── main.tsx
      ├── App.tsx
      ├── router.tsx
      ├── globals.css
      ├── api/
      ├── types/
      ├── views/
      ├── components/
      ├── layouts/
      ├── hooks/
      ├── context/
      └── lib/
scripts/                      # Shell helpers invoked by Taskfile (build, check, tooling)
```

## Core Architecture Constraints

### Backend

- Follow the `Handler -> Service -> Entity` layering.
- Register all routes in `internal/handler/handler.go`.
- Keep database connection and migration setup in `internal/database/`; services receive a ready `*gorm.DB`.
- PostgreSQL and MySQL are the supported runtime drivers; tests may use SQLite directly through GORM test helpers.
- Switch runtime database driver via `driver` in YAML config.
- YAML config contains only bootstrap settings such as listen address, database driver, and connection string.
- Configuration files may reference environment variables with `${NAME}` or `${NAME:-fallback}`.
- Do not expose GORM entities directly as HTTP response contracts; handlers should return DTOs or service-level public shapes.

### Frontend

- Routing: React Router v7 in `website/src/router.tsx`.
- Server state management: React Query (`@tanstack/react-query`).
- API calls go in `website/src/api/` and use the shared Axios client.
- Type definitions go in `website/src/types/`.
- Pages go in `website/src/views/`.
- Prefer existing Tailwind styles, shadcn-compatible component conventions, Lucide icons, and local layout patterns.
- Do not hard-code backend origins in components; use `/api/v1` through the shared client and Vite proxy.

### Product Boundaries

- Keep current docs honest about implemented vs planned CAD features.
- Treat STEP/STL/GLB import, AI orchestration, measurement, export, and persisted geometry as roadmap work until code, tests, and UI flows exist.
- Project data is currently metadata only: name, description, owner, timestamps.
- The project workbench may contain demo geometry and viewer controls, but it is not yet a real CAD document editor.

### Single Binary Embedding

- `website/assets_development.go` (`//go:build development`) reverse-proxies to Vite dev server.
- `website/assets_production.go` (`//go:build !development`) serves assets via `//go:embed build/*`.
- NotFound handler: `/api` prefix returns JSON 404; all other GET/HEAD routes fall back to SPA index.

## Documentation Rules

- Keep `README.md`, `TODO.md`, `AGENTS.md`, and `.agents/rules/` synchronized with the current code.
- Put future work in `TODO.md`, not in README sections that imply shipped behavior.
- When removing template leftovers, verify whether they still exist in code first.
- Do not write personal machine paths, credentials, private hosts, or production DSNs into docs.

## Mandatory Rules

- Start implementation or review work with `git status --short`.
- Respect the existing layering and directory structure; do not reshape architecture for local changes.
- Run `task check` before committing.
- Run `task test` when changing behavior, API contracts, database models, or non-trivial frontend interactions.

## Pre-commit Checklist

- Run `task check`; do not commit if it fails.
- Verify whether frontend API calls or types need to be updated with backend route/DTO changes.
- Verify whether README, TODO, or agent rules need updates when product capability, setup, or architecture changes.
