# AGENTS.md

Technical specification for AI coding assistants working on this project.

## Project Overview

litecad is a Go + React single-page application for AI-assisted CAD exploration and browser-native 3D preview. It is product code, not just a template, but it still uses the compact single-binary architecture inherited from `miclle/goblet`: the backend embeds frontend build output via `//go:embed`, so production deployment requires one executable plus a database.

Current implemented product surface:

- Home-page import pipeline status panel and CAD-oriented project workbench shell.
- Account registration/login/logout with an `HttpOnly` `litecad_session` cookie.
- Session-scoped project creation, listing, and detail lookup.
- Session-scoped CAD source upload, lightweight metadata extraction, listing, source download, preview artifact metadata, preview loading, editable LiteCAD document persistence for per-model transform operations, multi-source browser preview composition, read-only geometry document API, and generated geometry version snapshots for project-owned `.step`, `.stp`, self-contained `.gltf`, `.glb`, and `.stl` files, including browser-kernel STEP/STP workbench preview meshes, backend-validated self-contained GLTF/GLB preview publication, and Go-based STL-to-OBJ preview conversion. STEP/STP backend preview artifact generation is intentionally unavailable; the workbench uses source download plus the browser kernel.
- Studio status endpoint for bootstrap/product-state messaging.

Do not document or implement AI generation, full STEP B-rep semantics, measurement, export, CAD merge/boolean operations, normalized geometry APIs, or editable B-rep geometry as completed unless the code actually implements them. Persisted per-model transform operations are implemented, but they are not full B-rep edit semantics.

Target CAD architecture is documented in `docs/browser-cad-kernel-roadmap.md`: LiteCAD should migrate toward an embedded browser CAD kernel, likely OCCT/OpenCascade.js through WebAssembly in a Web Worker, so users can import, preview, edit, and export CAD models without installing FreeCAD or another desktop CAD application. The visible workbench STEP preview now uses browser-kernel mesh buffers, the workbench can persist per-model transform operations in a LiteCAD document, and normal runtime code no longer includes the old FreeCAD/Python STEP-to-OBJ converter.

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
.agents/skills/               # Project-scoped agent skills installed with `npx skills add`
.agents/rules/                # Additional project rules for compatible agents
```

## Project Skills

Project-scoped skills live in `.agents/skills/` and are locked by `skills-lock.json`. Prefer these skills during normal implementation and review work when the task matches their trigger, except where a skill is marked explicit-only:

- Use `vercel-react-best-practices` when writing, reviewing, or refactoring React code under `website/src/`, especially components, hooks, React Query data flow, bundle size, rendering performance, or frontend performance fixes.
- Use `frontend-design` when creating or reshaping visible UI, layout, interaction polish, CAD workbench surfaces, viewer controls, landing/home preview sections, or visual hierarchy.
- Use `shadcn` when adding, updating, composing, or debugging shadcn-compatible UI, or any task touching `website/components.json` or shadcn-style components.
- Use `webapp-testing` when verifying user-visible browser behavior, routing, auth flows, project workflows, frontend regressions, screenshots, console errors, or local dev-server UI behavior.
- Use `threejs-fundamentals` when setting up or refactoring Three.js scenes, cameras, renderers, resize handling, Object3D hierarchy, transforms, or render loops.
- Use `threejs-geometry` when creating project-owned or derived CAD preview geometry, custom `BufferGeometry`, edges/wireframes, instanced meshes, or geometry performance changes.
- Use `threejs-materials` when changing mesh materials, PBR appearance, wireframe/solid visual styling, texture usage, material performance, or shader-adjacent rendering behavior.
- `threejs-interaction` is explicit-only. Do not auto-trigger it for normal viewport work; use it only when the user explicitly requests it and after reviewing its `SKILL.md`, because the skills CLI reported a Critical Risk Gen audit for it at install time.

For feature work that changes the browser experience, combine the relevant frontend/design skill with `webapp-testing` for a rendered verification pass when feasible. For backend-only changes, use these skills only if the change affects frontend API contracts or browser-observable behavior.

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
- UI components must be implemented with or composed from shadcn/ui primitives whenever shadcn/ui provides the needed component or a reasonable composition path. Use custom component markup only when shadcn/ui has no suitable primitive for the requirement.
- Prefer existing Tailwind styles, shadcn/ui component conventions, Lucide icons, and local layout patterns.
- Do not hard-code backend origins in components; use `/api/v1` through the shared client and Vite proxy.

### Product Boundaries

- Keep current docs honest about implemented vs planned CAD features.
- Treat AI orchestration, measurement, export, editable B-rep geometry, and full STEP B-rep semantics as roadmap work until code, tests, and UI flows exist.
- Project data currently includes project metadata, uploaded STEP/STP/self-contained GLTF/GLB/STL source-file records, lightweight source metadata, authenticated source download, editable LiteCAD document JSON for root model nodes and transform operations, browser-kernel STEP workbench preview meshes, preview artifact metadata for backend-published GLTF/GLB/STL previews, derived STL OBJ preview artifacts, multi-source preview composition in the workbench, read-only model tree responses, and generated geometry version snapshots; it does not include editable B-rep geometry, CAD merge semantics, or STEP export.
- The project workbench must not render hard-coded demo geometry as if it were project-owned model data.
- Do not expand the FreeCAD runtime dependency for new CAD capabilities. New import/edit/export architecture work should follow `docs/browser-cad-kernel-roadmap.md`; every phase must include tests or browser verification, docs updates, and a scoped commit before the next phase.

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
