# AGENTS.md

Technical specification for AI coding assistants working on this project.

## Project Overview

litecad is a Go + React single-page application for AI-assisted CAD exploration and browser-native 3D preview. It is product code, not just a template, but it still uses the compact single-binary architecture inherited from `miclle/goblet`: the backend embeds frontend build output via `//go:embed`, so production deployment requires one executable plus a database.

Current implemented product surface:

- Home-page import pipeline status panel and CAD-oriented project workbench shell, with browser-local persistence for the left-panel and Assistant-panel visibility and widths.
- English and Chinese user-facing UI copy through `i18next` / `react-i18next`, with a shared `LanguageSwitcher`, browser-local language preference, and synchronized document `lang` attribute.
- Account registration/login/logout with an `HttpOnly` `litecad_session` cookie and explicit protected-route sign-in prompts for project pages.
- Session-scoped project creation, listing with lightweight static thumbnail snapshots, detail lookup, owner-scoped rename, and soft delete.
- Session-scoped CAD source upload, lightweight Go-only metadata extraction, listing, source download, preview artifact metadata, preview loading, editable LiteCAD document persistence for per-model transform and constrained box-union operations, database-backed reversible operation History with cross-browser Undo/Redo for transform/box-union/node-delete edits and saved parametric model parameter changes, STEP product/component names grouped under the imported model in the workbench project tree with node-scoped selection, position edits, and model/source plus component deletion, workbench-generated static project thumbnail snapshots, direct per-model STEP export downloads, selected multi-model STEP export downloads as one browser-kernel compound STEP file, multi-source browser preview composition, preview-layer edge display, center-plane visual sectioning, visible-model bounds measurement, read-only geometry document API, and generated geometry version snapshots for project-owned `.step`, `.stp`, self-contained `.gltf`, `.glb`, and `.stl` files, including browser-kernel STEP/STP workbench mesh generation with box-union replay plus scene-level persisted transforms, backend-validated self-contained GLTF/GLB preview publication, and Go-based STL-to-OBJ preview conversion. STEP/STP upload metadata extraction scans uploaded ISO-10303-21 text in Go and does not invoke Python, FreeCAD, or another desktop CAD application. STEP/STP backend preview artifact generation is intentionally unavailable; the workbench uses source download plus the browser kernel.
- Project-scoped CAD Agent chat with optional server-side OpenAI-compatible provider configuration, owner-scoped Assistant conversations, conversation-scoped persisted messages, provider context built from project/source metadata, and server-owned parametric generation policy. The backend asks the configured provider to return `build_parametric_model` tool calls or equivalent strict JSON when users want to create or edit models, retries strict JSON fallback if native tool calling fails, validates returned tool input, and creates project-owned pending generated-source artifact drafts from both the parametric-run API and ordinary conversation message API. The frontend must not carry system prompts, tool schemas, fallback prompts, primitive prompt parsing, provider selection, or generated-source validation rules. The accepted source kinds are `openscad` and `litecad-feature-dsl`; provider prompting prefers LiteCAD feature DSL unless the user explicitly asks for OpenSCAD source, backend validation rejects generated LiteCAD DSL JSON that falls outside the backend-owned capability registry for `sketch`, `extrude`, `extrude_cut`, `box`, `box_cut`, `cylinder`, `cylinder_cut`, `sphere`, `ellipsoid`, `ellipse_extrude`, `revolve`, `sweep`, `loft`, `fillet`, `chamfer`, and recursive `boolean` nodes, including invalid sketch references, boolean operands, extrusion directions, cylinder axes, dimensions, repeat patterns, feature-local transforms, and malformed structured numeric expressions, and OpenAI-compatible requests include configurable `timeout_seconds` and `max_output_tokens` controls. Parametric-run responses include telemetry for tool mode, source kind, and elapsed duration; generated artifacts persist the generation tool mode and duration for later list/detail reads while the normal Inspector stays focused on model parameters. The Assistant panel shows a localized parametric generation progress card with attempt count, retained prompt, provider/validation/draft guidance, successful run telemetry, and a failure recovery card that preserves the failed prompt for one-click retry while making clear that the canvas was not changed. The workbench can open generated drafts in an Inspector-side editor with parsed OpenSCAD/DSL parameter controls, compile LiteCAD DSL drafts through the browser `feature-dsl-preview` worker before save, automatically save successfully compiled DSL artifacts as durable `.lcad.json` project model sources, preview saved `.lcad.json` models through the same worker path, export saved `.lcad.json` models to STEP through `feature-dsl-export` from the project export UI, and update saved `.scad`/`.lcad.json` model parameters locally, update saved `.lcad.json` preview meshes inside the existing viewer scene, and persist revisions automatically after debounce. It can advise about the project and create generated-source drafts, but it does not mutate CAD documents, compile generated OpenSCAD source successfully without a runtime, or run arbitrary geometry tools.
- Studio status endpoint for bootstrap/product-state messaging.

Do not document or implement AI-driven geometry mutation, CAD tool execution, full STEP B-rep semantics, durable CAD measurement entities, backend export artifact history, durable cross-model assembly semantics, general CAD merge/boolean operations, normalized geometry APIs, or durable editable B-rep geometry as completed unless the code actually implements them. Persisted CAD Agent conversations/messages, OpenAI-compatible advisory replies, strict parametric-run tool JSON validation, safe persisted Assistant failure messages for invalid provider tool output, parametric artifact draft creation, generated-source draft editing controls, LiteCAD DSL draft browser-kernel preview before save, `.lcad.json` source model persistence for successful LiteCAD DSL artifacts, saved `.lcad.json` browser-kernel mesh preview updates inside the existing viewer scene and STEP export, saved `.scad`/`.lcad.json` locally immediate parameter edits with debounced revision persistence and reversible History entries, and preview-layer edge/section/bounds inspection tools are implemented, but they are not full prompt-to-geometry mutation, successful OpenSCAD browser mesh compilation, durable B-rep model generation, saved CAD measurement features, or durable B-rep section geometry. Database-backed Undo/Redo records LiteCAD's supported transform/box-union/node-delete commands and saved parametric model parameter changes, but it is not full B-rep feature-history, preserved source-application history, true geometric STEP decomposition, or durable assembly semantics.

The first LiteCAD-native feature DSL path is partially implemented: the CAD kernel worker can compile a minimal JSON DSL with numeric parameters, structured `add` / `sub` / `mul` / `div` numeric expressions, rectangular/circular/elliptical `extrude`, rectangular/circular/elliptical `extrude_cut`, `box`, `box_cut`, `cylinder`, `sphere`, `ellipsoid`, `ellipse_extrude`, `cylinder_cut`, reusable `sketch` definition nodes, `revolve`, straight-path `sweep`, multi-section `loft`, recursive boolean-tree `union` / `subtract` / `intersect`, `fillet`, conservative `chamfer`, optional non-zero cylinder axes, bounded linear repeat patterns, feature-local `translate` / `rotate` / positive non-uniform `scale` transforms, and optional sketch extrusion direction (`positive`, `negative`, or `symmetric`) into OCCT preview mesh buffers or exported STEP text. `extrude` currently turns rectangle/circle/ellipse sketches into prisms, `sphere` creates a spherical solid from an origin plus radius or diameter, `ellipsoid` creates a three-axis faceted body from an origin plus per-axis radii or diameters, `ellipse_extrude` creates an elliptical cylinder/prism from an origin, two planar radii or diameters, and height, `revolve` has a stable first pass for `XZ` rectangular profiles around the default Z axis, `sweep` supports straight path prisms, `loft` uses OCCT thru-sections, `fillet` applies OCCT edge fillets, `chamfer` currently validates and preserves shape until robust edge-face bevel selection is implemented, `extrude_cut` subtracts sketch prisms from prior solids, and `box_cut` subtracts direct rectangular slots, pockets, and edge notches. Feature-local non-uniform scale is compiled through supported primitive construction before rotate/translate; it is not arbitrary post-hoc B-rep general transformation. Boolean and string parameters can be stored and edited as UI metadata, but geometry expressions may reference numeric parameters only. Arbitrary sketch constraints, freeform profiles, arbitrary sweep paths, robust true chamfers, tapers, infix formulas, functions, unit math, comparisons, conditionals, and mirrored/negative scale transforms are not implemented. The Assistant route accepts `litecad-feature-dsl` tool output, pending DSL drafts preview through the browser kernel before save, successful DSL artifacts can be saved as `.lcad.json` project models, saved DSL models preview through the project browser-kernel mesh pipeline, saved DSL models export to STEP through the project UI, and saved DSL parameters can be edited with revision records that survive reload. CAD document History integration for generated feature graph nodes, full sketch constraints, durable kernel feature graph state, and full B-rep feature history are still future work.

AI-generated LiteCAD feature DSL source artifacts have a first end-to-end generated-source path through Assistant draft creation, browser-kernel preview/export after save, and locally immediate preview updates with debounced revision persistence and stable viewer-scene mesh updates. Do not describe that as AI-driven CAD document mutation, full B-rep generation, or successful OpenSCAD mesh compilation. Do not copy CADAM code; use it only as product-flow reference.

Target CAD architecture is documented in `docs/browser-cad-kernel-roadmap.md`: LiteCAD should migrate toward an embedded browser CAD kernel, likely OCCT/OpenCascade.js through WebAssembly in a Web Worker, so users can import, preview, edit, and export CAD models without installing FreeCAD or another desktop CAD application. The visible workbench STEP preview uses browser-kernel mesh buffers, replays box-union geometry in the worker, and applies the persisted absolute transform in the Three.js scene. Direct STEP export replays geometry operations followed by the latest absolute transform in the worker; selected STEP models can be downloaded separately or as one browser-kernel compound STEP file. Normal runtime code no longer includes the old FreeCAD/Python STEP-to-OBJ converter.

## Tech Stack

- Backend: Go 1.26.2 + `fox-gonic/fox` + GORM + PostgreSQL (default) / MySQL
- Frontend: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 4
  - React Router v7 (routing)
  - React Query v5 (server state)
  - i18next + react-i18next (English / Chinese UI copy)
  - Axios (HTTP client)
  - Lucide React (icons)
  - Three.js (browser 3D previews/viewer shell)

## Development Commands

```bash
task install         # Install Go modules and frontend dependencies
task install-browser # Install Playwright Chromium for browser tests
task dev             # Start development environment (hot reload)
task build           # Build production binary (with embedded frontend)
task build-all       # Cross-compile for multiple platforms
task run             # Run in production mode
task lint            # Auto-fix code style and run checks
task check           # Full checks (backend + frontend types + mod tidy)
task test            # Run tests (race detection + coverage)
task test-browser    # Run deterministic isolated Playwright workbench workflows
task clean           # Remove build artifacts
task update-tools    # Install/update dev tools
```

## Directory Overview

```text
cmd/litecad/                  # Application entry point and local config
internal/config/              # YAML config loading (PostgreSQL / MySQL)
internal/database/            # GORM database connection and schema migration
internal/entity/              # GORM models and persistence types
internal/handler/             # HTTP handlers, route registration, middleware
internal/service/             # Business logic, database operations
pkg/httperr/                  # Application HTTP-status-aware errors
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
      ├── i18n.ts
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
- YAML config contains bootstrap settings such as listen address, database driver, connection string, and optional server-side CAD Agent AI provider settings.
- Configuration files may reference environment variables with `${NAME}` or `${NAME:-fallback}`.
- Do not expose GORM entities directly as HTTP response contracts; handlers should return DTOs or service-level public shapes.
- CAD document mutations, Undo, and Redo require the caller's `expected_revision`; stale revisions must return `409 Conflict`, refresh server state, and must not overwrite another session's edit.

### Frontend

- Routing: React Router v7 in `website/src/router.tsx`.
- Server state management: React Query (`@tanstack/react-query`).
- API calls go in `website/src/api/` and use the shared Axios client.
- Type definitions go in `website/src/types/`.
- Pages go in `website/src/views/`.
- User-facing shell and page copy should use `react-i18next` with English and Chinese resources in `website/src/i18n.ts`; keep language switching through `LanguageSwitcher` or a shared wrapper instead of ad hoc localStorage reads.
- Do not translate project/user/generated content such as project names, uploaded filenames, STEP product/component names, AI messages, code/JSON snippets, or parametric model keys like `DIAMETER`; only fixed UI copy belongs in i18n resources.
- UI components must be implemented with or composed from shadcn/ui primitives whenever shadcn/ui provides the needed component or a reasonable composition path. Use custom component markup only when shadcn/ui has no suitable primitive for the requirement.
- Prefer existing Tailwind styles, shadcn/ui component conventions, Lucide icons, and local layout patterns.
- Do not hard-code backend origins in components; use `/api/v1` through the shared client and Vite proxy.
- Keep project workspace presentation preferences in the versioned `useProjectWorkspacePreferences` browser-local boundary. They are non-sensitive local UI state, not React Query server state or project data; validate stored values and preserve runtime width clamps.
- Keep `ProjectView` as a thin route shell for route params, project detail loading, and loading/error states. Route-level workbench controller assembly belongs in `useProjectWorkbenchRouteControllers(...)`, while top-level workbench slot composition and cross-controller UI callback wiring belong in `ProjectWorkbenchComposition`.
- Keep `ModelPreview` as a thin render surface. Three.js renderer/camera/control/listener lifecycle belongs in `useModelPreviewScene(...)`; object maps and stale async-loader rejection belong in `useModelPreviewResources()`; live callback, selection, visibility, and transform refs belong in `useModelPreviewSelection(...)`; pure world grid/axis geometry belongs in `model-preview-grid.ts`.

### Product Boundaries

- Keep current docs honest about implemented vs planned CAD features.
- LiteCAD is not launched yet, so new AI Parametric Assistant phases can choose clean internal schemas and API contracts over backward-compatible legacy routes or data migrations unless a later requirement explicitly preserves existing sample data.
- Treat CAD tool execution, AI-driven geometry mutation, durable CAD measurement/section semantics, backend export artifact history, durable cross-model assembly semantics, editable B-rep geometry, and full STEP B-rep semantics as roadmap work until code, tests, and UI flows exist.
- AI-generated LiteCAD feature DSL source artifacts have a first end-to-end generated-source path through Assistant draft creation, browser-kernel draft preview before save, browser-kernel preview/export after save, and locally immediate preview updates with debounced revision persistence and stable viewer-scene mesh updates. Do not describe that as AI-driven CAD document mutation, full B-rep generation, or successful OpenSCAD mesh compilation. Do not copy CADAM code; use it only as product-flow reference.
- Project data currently includes project metadata with owner-scoped rename and soft delete, static project-list thumbnail snapshots, uploaded STEP/STP/self-contained GLTF/GLB/STL/SCAD/LCAD source-file records, lightweight source metadata with STEP product/component names, authenticated source download, editable LiteCAD document JSON for source model nodes plus STEP component child nodes and transform/delete-node/box-union operations, database-backed reversible command history with a persisted Undo/Redo head and discarded alternate paths including saved parametric model parameter changes, browser-kernel STEP workbench meshes derived with box-union replay plus scene-level persisted transforms, browser-kernel LiteCAD feature DSL preview meshes for pending generated drafts and saved `.lcad.json` models, direct per-model STEP export downloads, selected multi-model STEP compound downloads, saved `.lcad.json` STEP export through the browser `feature-dsl-export` worker path, preview artifact metadata for backend-published GLTF/GLB/STL previews, derived STL OBJ preview artifacts, multi-source preview composition plus preview-layer edge/section/bounds inspection in the workbench, read-only model tree responses, generated geometry version snapshots, project-scoped CAD Agent conversations with conversation-scoped message history, native OpenAI-compatible `build_parametric_model` tool calls with strict JSON fallback after native tool-call failures, selected-model revision context for Assistant parametric runs, safe persisted Assistant failure messages for invalid provider tool output, parametric generation progress/failure recovery UI, response run telemetry, and persisted artifact-level generation telemetry for list/detail reads, project-owned OpenSCAD-style and LiteCAD feature DSL parametric artifact draft records, draft parameter controls, save-as-`.lcad.json` project model persistence for successful LiteCAD DSL artifacts, saved `.scad`/`.lcad.json` locally immediate parameter edits with debounced revision persistence, saved `.lcad.json` viewer-scene mesh updates, and a worker-level LiteCAD feature DSL compiler for numeric-parameter and structured-expression rectangular/circular-extrude/rectangular/circular-extrude-cut/box/box-cut/cylinder/sphere/ellipsoid/`ellipse_extrude`/cylinder-cut geometry with optional sketch extrusion direction, optional non-zero cylinder axes, bounded linear repeat patterns, and feature-local transforms; it does not include durable kernel shape state, general CAD merge semantics, durable assembly records, backend export artifact persistence, successful OpenSCAD browser mesh compilation of generated artifacts, durable CAD measurement/section records, or AI tool calls that mutate project geometry.
- STEP/STP upload metadata extraction is intentionally lightweight and Go-only. Do not add Python scripts, FreeCAD commands, or other desktop CAD application calls to the upload path; full geometry import belongs behind the browser CAD kernel worker boundary.
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
- Run `task test-browser` when changing project routing, workbench panels, model upload, thumbnail publication, or browser-visible CAD interactions. The suite uses per-test API fixture state and independently covers signed-out route protection, shell, import, transform conflict/Undo/Redo, Assistant parameter persistence, mock-provider prompt-to-artifact generation for a LiteCAD DSL sphere with X/Y/Z through holes, and export. Install Chromium once with `task install-browser`.
- Do not treat `task test-browser` as live AI-provider validation. It uses deterministic fixtures and does not prove that `LITECAD_AI_API_KEY`, provider model names, network reachability, or live provider prompt behavior work in the running server. When changing provider configuration, provider prompts, or deployment AI setup, run and report a separate manual or environment-gated live-provider smoke.

## Pre-commit Checklist

- Run `task check`; do not commit if it fails.
- Verify whether frontend API calls or types need to be updated with backend route/DTO changes.
- Verify whether README, TODO, or agent rules need updates when product capability, setup, or architecture changes.
