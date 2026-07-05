# litecad

Web-based AI-driven 3D design and preview workspace.

litecad started from [miclle/goblet](https://github.com/miclle/goblet) and keeps the Go + React single-binary deployment model while becoming a product surface for prompt-driven CAD exploration, project-scoped design work, and browser-native 3D inspection.

## Current State

The repository is in an early product milestone. The implemented application includes:

- A branded LiteCAD home screen with a Three.js preview prototype.
- Account registration, login, current-user lookup, and logout through an `HttpOnly` `litecad_session` cookie.
- User-owned project creation, project listing, and project detail lookup.
- A project workbench route with a CAD-style Three.js viewer shell and UI controls.
- A backend studio status endpoint for the product bootstrap state.
- Single-binary production builds that embed the Vite frontend output.

AI model orchestration, STEP parsing, CAD file upload, mesh conversion, measurement tools, export, and design-history persistence are product direction, not completed capabilities yet.

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

### 3D Preview Shell

The home page renders a Three.js demo shape. The project detail route renders a CAD-style viewer shell with model-tree, tool, view-control, and panel UI. The current viewer does not load persisted CAD geometry yet.

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
```

Project routes require a valid `litecad_session` cookie. API clients live in `website/src/api/`, and shared wire types live in `website/src/types/`.

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
