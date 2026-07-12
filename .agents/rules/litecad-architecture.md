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
- Project handlers are split by domain: `project.go` owns project metadata, `project_models.go` owns thumbnail/model/geometry delivery, `project_cad.go` owns editable CAD document and History commands, `project_agent.go` owns advisory chat, and `project_errors.go` owns shared session/error translation.
- Application handlers use `pkg/httperr` for HTTP-status-aware errors. The website asset handlers use Fox's `httperrors` only for framework-level API/SPAs NotFound behavior.
- Services own business logic, validation that is not purely HTTP binding, and database access.
- Entities own GORM models, table names, persistence constants, and narrow model helpers.
- Configuration should stay bootstrap-focused: listen address, database driver, DSN, optional server-side AI provider settings, and similarly necessary startup settings.
- PostgreSQL and MySQL support must stay explicit for runtime. Tests may use SQLite directly through GORM helpers without adding SQLite as a runtime config option.
- Session-scoped resources must query by owner/session scope; project APIs currently scope by `owner_user_id`.

## Frontend Boundaries

- API calls live in `website/src/api/`.
- Shared HTTP contract types live in `website/src/types/`.
- Page-level routes live in `website/src/views/`.
- `ProjectView` is the project route composition root. Keep serialized CAD mutations, revision conflict refresh, and transform autosave in `useCADDocumentCommands(...)`; keep History, STEP export, Assistant, model tree, and Inspector UI in controlled components that receive data and callbacks instead of fetching route state themselves.
- Reuse the existing React Router, React Query, Tailwind, shadcn/ui component conventions, Lucide icons, Axios, and Three.js patterns.
- UI components must use or compose shadcn/ui primitives unless shadcn/ui has no suitable component for the requirement.
- Do not hard-code backend origins in components; use the Vite proxy and shared `/api/v1` Axios client.

## Product Boundaries

- Current projects include metadata, static project-list thumbnail snapshots, uploaded STEP/STP/self-contained GLTF/GLB/STL/SCAD/LCAD source records, lightweight source metadata with STEP product/component names, authenticated source download, editable LiteCAD document JSON for source model nodes plus independently selectable STEP component child nodes and transform/delete-node/constrained box-union operations, model/source node deletion with STEP component child deletion, database-backed reversible command History with a persisted Undo/Redo head and discarded alternate paths, browser-kernel STEP workbench preview meshes, browser-kernel LiteCAD feature DSL preview meshes for saved `.lcad.json` models, direct per-model STEP export downloads, selected multi-model STEP compound downloads, saved `.lcad.json` STEP export through the browser `feature-dsl-export` worker path, preview artifact metadata for backend-published GLTF/GLB/STL previews, derived STL OBJ preview artifacts, multi-source preview composition in the workbench, read-only model tree responses, generated geometry version snapshots, project-scoped CAD Agent conversations with conversation-scoped message history, native OpenAI-compatible `build_parametric_model` tool calls with strict JSON fallback, safe persisted Assistant failure messages for invalid provider tool output, project-owned OpenSCAD-style and LiteCAD feature DSL parametric artifact draft records, draft parameter controls, save-as-`.scad`/`.lcad.json` project model persistence for successful artifacts, and saved `.scad`/`.lcad.json` parameter revision records. LiteCAD feature DSL currently covers only a minimal Z-axis box/cylinder/cylinder-cut primitive set; projects are not complete durable B-rep CAD documents yet.
- Current STEP workbench preview and STEP export use the embedded browser CAD kernel worker described in `docs/browser-cad-kernel-roadmap.md`. Production preview replays box-union geometry in the worker and applies the latest persisted absolute transform in the Three.js scene. STEP export replays geometry operations followed by the latest absolute transform in the worker. The target architecture still needs durable kernel shape state, richer parametric feature semantics, backend export artifact history, and durable assembly records. Do not add ad hoc frontend raw CAD loaders outside that kernel plan.
- CAD document edits, Undo, and Redo are server-authoritative transactions. Require `expected_revision`, return `409 Conflict` for stale callers, and update the materialized document plus database History head atomically.
- The home and project workbench Three.js surfaces must use project-owned source or derived preview data instead of hard-coded demo geometry.
- Treat AI-driven geometry mutation, CAD tool execution, measurement, backend export artifact persistence, durable assembly records, editable B-rep geometry documents, and full STEP B-rep semantics as roadmap work unless the code implements the end-to-end flow. Project-scoped CAD Agent conversations, persisted messages, native `build_parametric_model` tool calls with strict JSON fallback, safe persisted Assistant failure messages for invalid provider tool output, OpenSCAD/LiteCAD DSL parametric artifact draft creation, Inspector-side draft parameter controls, save-as-`.scad`/`.lcad.json` project model persistence, saved `.lcad.json` browser-kernel preview meshes and STEP export, and saved `.scad`/`.lcad.json` parameter revision editing are implemented, but successful OpenSCAD browser mesh compilation and full prompt-to-geometry mutation are not.
- AI-generated LiteCAD feature DSL source artifacts have a first end-to-end generated-source path through Assistant draft creation, browser-kernel preview/export after save, and parameter revision editing. Do not describe that as AI-driven CAD document mutation, full B-rep generation, or successful OpenSCAD mesh compilation. Do not copy CADAM code; use it only as product-flow reference.
- Treat general CAD merge/boolean operations as roadmap work unless the code implements the end-to-end flow. A constrained per-model STEP box-union operation, direct per-model STEP export, and selected multi-model STEP compound export are implemented.
- STEP/STP upload metadata extraction is Go-only lightweight source scanning, not geometric B-rep import. Keep full STEP geometry import, preview, edit replay, and export behind the browser CAD kernel worker boundary.
- Normal runtime code must not depend on FreeCAD, `freecadcmd`, or Python-based STEP conversion. New CAD import/edit/export work should stay behind the browser CAD kernel worker boundary and avoid third-party desktop CAD software dependencies.
- When a feature becomes real, update README and remove or rewrite the matching TODO item in the same change.

## Change Checks

- Start code changes with `git status --short`.
- Keep changes small and product-oriented without breaking the single-binary deployment model.
- Run `task check` before committing.
- Run `task test` when behavior, API contracts, database models, auth/session behavior, or UI interactions change.
