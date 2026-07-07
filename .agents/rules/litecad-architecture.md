# LiteCAD Architecture Rules

These rules keep LiteCAD product work aligned with the small Go + React single-binary architecture inherited from Goblet.

## Principles

- Preserve the existing `Handler -> Service -> Entity` layering.
- Keep route registration centralized in `internal/handler/handler.go`.
- Keep database connection and migration setup in `internal/database/`.
- Put GORM persistence models in `internal/entity/`; do not expose entities directly as HTTP contracts.
- Put reusable, business-agnostic helpers in `pkg/`, with small APIs and tests.
- Keep product capability claims grounded in shipped code, tests, and UI flows.

## Backend Boundaries

- Handlers own HTTP binding, status codes, response DTOs, cookies, and route grouping.
- Services own business logic, validation that is not purely HTTP binding, and database access.
- Entities own GORM models, table names, persistence constants, and narrow model helpers.
- Configuration should stay bootstrap-focused: listen address, database driver, DSN, and similarly necessary startup settings.
- PostgreSQL and MySQL support must stay explicit for runtime. Tests may use SQLite directly through GORM helpers without adding SQLite as a runtime config option.
- Session-scoped resources must query by owner/session scope; project APIs currently scope by `owner_user_id`.

## Frontend Boundaries

- API calls live in `website/src/api/`.
- Shared HTTP contract types live in `website/src/types/`.
- Page-level routes live in `website/src/views/`.
- Reuse the existing React Router, React Query, Tailwind, shadcn/ui component conventions, Lucide icons, Axios, and Three.js patterns.
- UI components must use or compose shadcn/ui primitives unless shadcn/ui has no suitable component for the requirement.
- Do not hard-code backend origins in components; use the Vite proxy and shared `/api/v1` Axios client.

## Product Boundaries

- Current projects include metadata, uploaded STEP/STP/self-contained GLTF/GLB/STL source records, lightweight source metadata, authenticated source download, editable LiteCAD document JSON for root model nodes plus transform and constrained box-union operations, browser-kernel STEP workbench preview meshes with operation replay, direct per-model STEP export downloads, preview artifact metadata for backend-published GLTF/GLB/STL previews, derived STL OBJ preview artifacts, multi-source preview composition in the workbench, read-only model tree responses, and generated geometry version snapshots; they are not complete durable B-rep CAD documents yet.
- Current STEP workbench preview and direct STEP export use the embedded browser CAD kernel worker described in `docs/browser-cad-kernel-roadmap.md`, with per-model transform and box-union operations replayed inside the worker before tessellation or export. The target architecture still needs durable kernel shape state, richer feature semantics, backend export artifact history, and combined assembly export. Do not add ad hoc frontend raw CAD loaders outside that kernel plan.
- The home and project workbench Three.js surfaces must use project-owned source or derived preview data instead of hard-coded demo geometry.
- Treat AI generation, measurement, backend export artifact persistence, combined assembly export, editable B-rep geometry documents, and full STEP B-rep semantics as roadmap work unless the code implements the end-to-end flow.
- Treat general CAD merge/boolean operations as roadmap work unless the code implements the end-to-end flow. A constrained per-model STEP box-union operation and direct per-model STEP export are implemented.
- Normal runtime code must not depend on FreeCAD, `freecadcmd`, or Python-based STEP conversion. New CAD import/edit/export work should stay behind the browser CAD kernel worker boundary and avoid third-party desktop CAD software dependencies.
- When a feature becomes real, update README and remove or rewrite the matching TODO item in the same change.

## Change Checks

- Start code changes with `git status --short`.
- Keep changes small and product-oriented without breaking the single-binary deployment model.
- Run `task check` before committing.
- Run `task test` when behavior, API contracts, database models, auth/session behavior, or UI interactions change.
