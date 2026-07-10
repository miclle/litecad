# LiteCAD

LiteCAD is a browser-native workspace for exploring real CAD sources with an AI-assisted design companion.

It is built for an early but concrete product loop: sign in, create a project, upload CAD files, inspect them in a 3D workbench, make lightweight document-level edits, export STEP results, and keep a CAD Agent beside the model for project-aware discussion.

## What Works Today

LiteCAD currently supports:

- Account registration, login, current-user lookup, and logout with an `HttpOnly` session cookie.
- User-owned projects with names, descriptions, project-list cards, and static thumbnail snapshots generated from the workbench.
- Uploads for `.step`, `.stp`, self-contained `.gltf`, `.glb`, and `.stl` files.
- Lightweight CAD source metadata, including STEP schema/product/component/unit/entity summaries and STL triangle counts where available.
- A project workbench with a Three.js viewer, source list, document inspector, ViewCube/orientation controls, model visibility toggles, and multi-model preview composition.
- Browser-kernel STEP/STP preview through an OCCT/OpenCascade.js Web Worker, without requiring FreeCAD or another desktop CAD application at runtime.
- Persisted per-model transform edits, model/source node deletion with STEP component child deletion, and a constrained STEP box-union operation in a LiteCAD document.
- Database-backed operation History with owner-scoped Undo/Redo for transforms, box unions, and node deletion, including persisted redo state across reloads and devices.
- Direct per-model STEP downloads and selected multi-model STEP compound downloads from the current document state.
- Backend-published preview artifacts for validated GLB, self-contained GLTF, and STL-to-OBJ previews.
- A project-scoped CAD Agent chat panel when an OpenAI-compatible provider is configured.

The home page and workbench use project-owned CAD data rather than hard-coded demo geometry.

## Product Boundaries

LiteCAD is not a full parametric CAD system yet. Current edits are limited to persisted placement, model/source node deletion with STEP component child deletion, and a constrained STEP box-union operation. LiteCAD records those edits as reversible project history, but this is not preserved source-application history or a general parametric B-rep feature graph. Projects do not yet store durable kernel shape state, editable B-rep geometry, durable assemblies, measurement data, sectioning, or backend export artifact history.

The CAD Agent is advisory today. It can use project and source metadata as context for chat, but it cannot mutate CAD documents, call geometry tools, run measurements, or generate durable CAD features.

Future CAD architecture and phase notes live in [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md). Active follow-up work lives in [TODO.md](TODO.md).

## Quick Start

Requirements:

- Go 1.26.2+
- Node.js 22.14+
- PostgreSQL or MySQL
- [Task](https://taskfile.dev/)
- `reflex`, `staticcheck`, and `golangci-lint` for local development checks
- Playwright Chromium for the optional browser smoke suite

Install or refresh local Go tools:

```bash
task update-tools
```

Install dependencies:

```bash
git clone https://github.com/miclle/litecad.git
cd litecad
task install
```

Install the browser used by the workbench smoke suite once:

```bash
npx --prefix website playwright install chromium
```

Create local config:

```bash
cp cmd/litecad/config.example.yaml cmd/litecad/config.local.yaml
```

Start the development environment:

```bash
task dev
```

This starts the Go server on `http://localhost:46280` and Vite on `http://localhost:46281`.

To avoid port conflicts:

```bash
LITECAD_HTTP_PORT=47280 LITECAD_VITE_PORT=47281 task dev
```

## Using LiteCAD

### Projects

After signing in, open `/projects`, create a project, and enter its workbench at `/projects/:projectId`. Project data is scoped to the signed-in user.

### CAD Imports

Upload STEP/STP, self-contained GLTF/GLB, or STL files from the workbench. LiteCAD stores the original source bytes, extracts lightweight metadata, and shows parsed sources in the project tree. STEP product/component names are displayed as children under the uploaded source file when the STEP text exposes them.

For STEP/STP files, the browser fetches the original source and sends it to the CAD kernel worker for tessellation. The workbench replays box-union geometry in the worker, then applies the persisted absolute transform in the Three.js scene. STEP export replays the geometry operations followed by the latest absolute transform in the worker. For GLB/GLTF/STL files, the workbench uses backend-published preview artifacts and applies persisted transforms in the viewer.

### Workbench

The workbench is the main product surface. It combines:

- A CAD-style viewer with grid, axes, ViewCube, model selection, and combined-bounds framing.
- A source/model tree with visibility controls, parse status, and imported STEP product/component nodes grouped under the imported model.
- Independent document selection, position editing, and deletion for imported STEP component nodes.
- A document inspector for selected-model placement and STEP box-union controls.
- Compact Undo/Redo controls and a persisted operation History panel. A new edit after Undo keeps the old record as an alternate path while clearing it from the active Redo path.
- STEP export controls for selected files or a merged compound download.
- A CAD Agent panel for project-aware design discussion when AI configuration is present.

### CAD Agent

The CAD Agent sends project and source metadata context to a configured OpenAI-compatible chat provider and stores the final user/assistant messages for the project. If no provider is configured, sending a message returns a configuration error while the rest of LiteCAD continues to run.

## Configuration

The local config file is `cmd/litecad/config.local.yaml`, copied from `cmd/litecad/config.example.yaml`.

```yaml
addr: "0.0.0.0:${LITECAD_HTTP_PORT:-46280}"
driver: postgres
dsn: "host=localhost port=5432 user=postgres password=postgres dbname=litecad sslmode=disable"

# Optional CAD Agent AI provider. Keep api_key in an environment variable.
ai:
  provider: openai_compatible
  base_url: "${LITECAD_AI_BASE_URL:-https://api.openai.com/v1}"
  api_key: "${LITECAD_AI_API_KEY:-}"
  model: "${LITECAD_AI_MODEL:-gpt-4.1-mini}"
  timeout_seconds: 30
```

Configuration supports `${NAME}` and `${NAME:-fallback}` environment variable expansion. Runtime database drivers are `postgres` and `mysql`. Leaving `ai.api_key` or `ai.model` empty disables CAD Agent sends.

## Development Commands

```bash
task install        # Install Go modules and frontend dependencies
task dev            # Start Vite dev server + Go hot reload
task build          # Build production binary with embedded frontend
task build-all      # Cross-compile for linux/darwin/windows x amd64/arm64
task run            # Run the server in production mode with local config
task lint           # Auto-fix Go module/style issues and run frontend lint
task check          # CI-aligned local checks
task test           # Go tests with race/coverage + frontend Vitest
task test-browser   # Deterministic Playwright workbench smoke
task clean          # Remove build artifacts
task update-tools   # Install/update reflex, staticcheck, golangci-lint
```

Production builds keep the compact single-binary deployment model inherited from `miclle/goblet`: the Go backend embeds the built Vite frontend, so deployment needs one executable plus a configured database.

## Verification

Run before committing:

```bash
task check
```

Run tests when behavior, API contracts, database models, shared frontend behavior, or viewer interactions change:

```bash
task test
```

Run the browser-level workbench smoke after changing project routing, panels, or user-visible CAD interactions:

```bash
task test-browser
```

The smoke suite starts an isolated Vite server, intercepts owner-scoped API responses with deterministic fixtures, opens the real project route, exercises History and Assistant, and fails on unexpected browser console or page errors. It does not require a local database.

CI also runs Go tests, frontend lint/type/test/build, actionlint, dependency review on pull requests, and golangci-lint.

## Roadmap

Near-term product work is focused on turning the current preview/edit/export loop into a richer CAD workflow: durable kernel shape state, broader feature operations, measurement and sectioning, clearer assembly semantics, stronger CAD Agent tool boundaries, project management polish, and production deployment guidance.

Active follow-up items are tracked in [TODO.md](TODO.md). The browser-kernel architecture plan and phase history live in [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md).

## License

[MIT](LICENSE)
