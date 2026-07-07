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

- Current projects include metadata, uploaded STEP/STP/self-contained GLTF/GLB/STL source records, lightweight source metadata, preview artifact metadata, derived STEP/STL OBJ preview artifacts, backend-published self-contained GLTF/GLB preview artifacts, multi-source preview composition in the workbench, read-only model tree responses, and generated geometry version snapshots; they are not editable persisted CAD documents.
- Current CAD source parsing and preview normalization are backend-owned. The target architecture in `docs/browser-cad-kernel-roadmap.md` moves STEP import, B-rep editing, tessellation, and STEP export into an embedded browser CAD kernel running in a Web Worker. Do not add ad hoc frontend raw CAD loaders outside that kernel plan.
- The home and project workbench Three.js surfaces must use project-owned source or derived preview data instead of hard-coded demo geometry.
- Treat AI generation, measurement, export, editable geometry documents, and full STEP B-rep semantics as roadmap work unless the code implements the end-to-end flow.
- Treat CAD merge/boolean operations and persisted assembly placement as roadmap work unless the code implements the end-to-end flow.
- Treat FreeCAD and `freecad_step_to_obj.py` as current implementation debt and short-term fallback only. New CAD import/edit/export work should avoid deepening the runtime dependency on third-party desktop CAD software.
- When a feature becomes real, update README and remove or rewrite the matching TODO item in the same change.

## Change Checks

- Start code changes with `git status --short`.
- Keep changes small and product-oriented without breaking the single-binary deployment model.
- Run `task check` before committing.
- Run `task test` when behavior, API contracts, database models, auth/session behavior, or UI interactions change.
