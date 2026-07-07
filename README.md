# litecad

Web-based AI-driven 3D design and preview workspace.

litecad started from [miclle/goblet](https://github.com/miclle/goblet) and keeps the Go + React single-binary deployment model while becoming a product surface for prompt-driven CAD exploration, project-scoped design work, and browser-native 3D inspection.

## Current State

The repository is in an early product milestone. The implemented application includes:

- A branded LiteCAD home screen that reports the current import pipeline state without rendering demo CAD geometry.
- Account registration, login, current-user lookup, and logout through an `HttpOnly` `litecad_session` cookie.
- User-owned project creation, project listing, and project detail lookup.
- Project-scoped CAD source uploads for multiple `.step`, `.stp`, self-contained `.gltf`, `.glb`, and `.stl` files with stored filename, format, content type, byte size, timestamps, lightweight source metadata, preview artifact metadata, a read-only geometry document API, and a LiteCAD-owned editable document record for per-model transform and box-union operations.
- A project workbench route with a CAD-style Three.js viewer shell, source-file list, upload control, browser-kernel STEP preview meshes with persisted transform and box-union operation replay, backend-published GLTF/GLB/STL preview artifacts, persisted per-model transform controls, a constrained STEP box-union feature control, and multi-model frontend viewer composition.
- A backend studio status endpoint for the product bootstrap state.
- Single-binary production builds that embed the Vite frontend output.

AI model orchestration, full STEP geometry/B-rep semantics, general CAD merge/boolean workflows beyond the constrained per-model box union, normalized editable B-rep geometry, measurement tools, export, and rich design-history persistence are product direction, not completed capabilities yet.

The target CAD architecture is an embedded browser CAD kernel based on OCCT/OpenCascade.js or an equivalent WebAssembly geometry kernel. The long-term loop is STEP import, browser-side B-rep editing, derived Three.js preview meshes, and STEP export without requiring users to install FreeCAD or another desktop CAD application. The current project workbench previews STEP sources through the browser kernel worker and persists per-model transform edits plus a constrained box-union feature in a LiteCAD document; STEP preview replay applies those operations inside the worker before tessellation. STEP export UI, richer feature operations, and durable kernel shape state are still roadmap work tracked in [Browser CAD Kernel Roadmap](docs/browser-cad-kernel-roadmap.md) and [TODO.md](TODO.md).

## Tech Stack

**Backend**

- Go 1.26
- [fox-gonic/fox](https://github.com/fox-gonic/fox)
- GORM with PostgreSQL by default, MySQL supported
- Viper YAML configuration

**Frontend**

- React 19 + TypeScript 6 + Vite 8
- Tailwind CSS 4
- React Router v7
- React Query v5
- Axios
- Lucide React
- Three.js

## Requirements

- Go 1.26+
- Node.js 22.14+
- PostgreSQL or MySQL for normal runtime
- [Task](https://taskfile.dev/)
- `reflex` for `task dev`
- `staticcheck` and `golangci-lint` for local checks

Install or refresh Go tooling with:

```bash
task update-tools
```

## Quick Start

```bash
git clone https://github.com/miclle/litecad.git
cd litecad
task install
```

Create local config:

```bash
cp cmd/litecad/config.example.yaml cmd/litecad/config.local.yaml
```

Start the development environment:

```bash
task dev
```

This starts Vite on port `46281` and the Go server on port `46280`.

To avoid port conflicts:

```bash
LITECAD_HTTP_PORT=47280 LITECAD_VITE_PORT=47281 task dev
```

`task dev` wires those values through Vite, the Vite `/api/v1` proxy, and the development asset reverse proxy.

## Common Commands

```bash
task install        # Install Go modules and frontend dependencies
task dev            # Start Vite dev server + Go hot reload
task build          # Build production binary with embedded frontend
task build-all      # Cross-compile for linux/darwin/windows x amd64/arm64
task run            # Run the server in production mode with local config
task lint           # Auto-fix Go module/style issues and run frontend lint
task check          # CI-aligned local checks
task test           # Go tests with race/coverage + frontend Vitest
task clean          # Remove build artifacts
task update-tools   # Install/update reflex, staticcheck, golangci-lint
```

## Product Workflows

### Accounts

Users can register or log in at `/register` and `/login`. Successful authentication issues an `HttpOnly` `litecad_session` cookie. The frontend uses `/api/v1/auth/me` to decide whether to show account or navigation actions.

### Projects

Signed-in users can open `/projects`, create a project with a name and optional description, and then navigate to `/projects/:projectId`. Project API queries are scoped to the session user.

### CAD Source Imports

Signed-in users can upload multiple `.step`, `.stp`, self-contained `.gltf`, `.glb`, or `.stl` files from a project workbench. The backend stores the uploaded source bytes and returns project-owned model metadata including parse status, detected asset type, STEP schema and product names when available, length unit, entity count, representation count, and STL triangle count when available. The authenticated model-source endpoint lets the browser kernel worker fetch a project-owned STEP source for client-side import and tessellation.

For STEP/STP workbench preview, the frontend fetches the original source bytes and sends them to the OCCT/OpenCascade.js Web Worker with the model-scoped CAD document operations. The worker replays transform and box-union operations on the imported shape before tessellating browser-kernel mesh buffers for Three.js. GLB uploads and self-contained GLTF uploads without external buffer or image URIs are validated by the backend before being published as preview artifacts, and STL uploads are converted to OBJ preview artifacts in Go. The preview artifact metadata endpoint exposes backend artifact format, content type, byte size, and mesh counts separately from binary payloads. The read-only geometry document endpoint exposes the current project model tree with source format, backend preview artifacts where available, and generated geometry version records. The editable CAD document endpoint persists LiteCAD-owned document JSON, root model nodes, replayable transform and box-union operations, and revision numbers separately from uploaded source bytes and derived preview meshes.

### 3D Preview Shell

The home page no longer renders demo CAD geometry. The project detail route renders a CAD-style viewer shell with grid, axis, view-control, panel UI, parsed source metadata, browser-kernel STEP meshes, backend artifacts for GLB/GLTF/STL previews, persisted X/Y/Z per-model transform controls, and constrained box-union controls for STEP models. When a project has multiple parsed source files with ready preview data, the workbench loads them into one preview scene, uses worker-replayed transform and box-union operations for STEP previews, applies object-level transforms to backend preview artifacts, and frames the combined bounds.

The project workbench keeps reusable view orientation math, ViewCube geometry definitions, ViewCube texture helpers, ViewCube controls, multi-model preview behavior, viewer event helpers, and shared Three.js resource cleanup in focused frontend modules under `website/src/views/project/`, while the route component remains responsible for project loading, source-file state, preview artifact queries, upload mutation flow, and shell layout.

## API Surface

Current backend routes:

```text
GET  /health

GET  /api/v1/studio/status

POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout

GET  /api/v1/projects
POST /api/v1/projects
GET  /api/v1/projects/:projectID
GET  /api/v1/projects/:projectID/geometry
GET  /api/v1/projects/:projectID/cad-document
PATCH /api/v1/projects/:projectID/cad-document/models/:modelID/transform
POST /api/v1/projects/:projectID/cad-document/models/:modelID/box-union
GET  /api/v1/projects/:projectID/models
POST /api/v1/projects/:projectID/models
GET  /api/v1/projects/:projectID/models/:modelID/source
GET  /api/v1/projects/:projectID/models/:modelID/preview-artifact
GET  /api/v1/projects/:projectID/models/:modelID/preview
```

Project routes require a valid `litecad_session` cookie. `POST /api/v1/projects/:projectID/models` accepts multipart form data with a `model` file field and currently supports `.step`, `.stp`, self-contained `.gltf`, `.glb`, and `.stl`. Model responses include lightweight source metadata when parsing succeeds. `GET /api/v1/projects/:projectID/models/:modelID/source` returns the original uploaded source bytes for a project-owned model and is the input path for browser-kernel STEP preview. `GET /api/v1/projects/:projectID/geometry` returns the current read-only model tree, backend preview artifact metadata where applicable, and generated geometry version records. `GET /api/v1/projects/:projectID/cad-document` returns the editable LiteCAD document state, including root model nodes, per-model transform matrices, operation history, unit, schema version, and revision. `PATCH /api/v1/projects/:projectID/cad-document/models/:modelID/transform` persists a transform operation for one project-owned model. `POST /api/v1/projects/:projectID/cad-document/models/:modelID/box-union` persists a constrained axis-aligned box-union operation for a STEP model. STEP models intentionally have no backend preview artifact in the geometry document because the workbench renders them from browser-kernel mesh buffers. `GET /api/v1/projects/:projectID/models/:modelID/preview-artifact` returns preview artifact metadata without binary data for backend-published GLB/GLTF/STL previews and returns `model preview unavailable` for STEP models. `GET /api/v1/projects/:projectID/models/:modelID/preview` returns `model/obj` for STL previews, `model/gltf+json` for validated self-contained GLTF previews, or `model/gltf-binary` for validated GLB previews; STEP previews are browser-kernel generated from `/source`. API clients live in `website/src/api/`, and shared wire types live in `website/src/types/`.

Normal LiteCAD runtime no longer shells out to FreeCAD or Python for STEP preview. Future CAD edit/export work should stay behind the browser-kernel migration plan in [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md).

## Architecture

```text
cmd/litecad/                  # Application entry point and local config
internal/config/              # YAML config loading
internal/database/            # GORM database connection and migration
internal/entity/              # GORM models and persistence types
internal/handler/             # HTTP handlers, route registration, middleware
internal/service/             # Business logic and database operations
internal/errors/              # Legacy centralized status errors
pkg/httperr/                  # HTTP-status-aware error helpers used by handlers
pkg/id/                       # Prefixed ULID helpers
pkg/secret/                   # Random secret and digest helpers
pkg/strutil/                  # Pure string helpers
pkg/gormlog/                  # GORM logger adapter
website/                      # Embedded SPA
  assets_development.go       # Dev mode: reverse-proxy to Vite
  assets_production.go        # Prod mode: go:embed static assets
  src/
    api/                      # Axios API modules
    types/                    # Shared frontend contract types
    views/                    # Route-level UI
      project/                # Project workbench route plus focused viewer helpers
    components/               # Reusable UI components
    layouts/                  # Page layouts
    lib/                      # Shared frontend utilities
scripts/                      # Shell helpers invoked by Taskfile
```

## Single Binary Embedding

- Development builds use `website/assets_development.go` and reverse-proxy static requests to the Vite dev server.
- Production builds use `website/assets_production.go` and embed `website/build/*` with `//go:embed`.
- `/api` paths return JSON 404s when not found; other unknown GET/HEAD paths fall back to the SPA index.

## Configuration

```yaml
addr: "0.0.0.0:${LITECAD_HTTP_PORT:-46280}"
driver: postgres
dsn: "host=localhost port=5432 user=postgres password=postgres dbname=litecad sslmode=disable"
```

Configuration files support `${NAME}` and `${NAME:-fallback}` environment variable expansion. Supported runtime database drivers are `postgres` and `mysql`.

## Verification

Run before committing:

```bash
task check
```

Run tests when backend behavior, API contracts, database models, shared frontend behavior, or viewer interactions change:

```bash
task test
```

CI also runs Go tests, frontend lint/type/test/build, actionlint, dependency review on pull requests, and golangci-lint.

## Roadmap

Active follow-up work is tracked in [TODO.md](TODO.md). Keep completed items out of the roadmap and move durable product or architecture facts back into this README or focused docs.

## License

[MIT](LICENSE)
