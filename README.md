# litecad

Web-based AI-driven 3D design and preview workspace.

litecad is initialized from [miclle/goblet](https://github.com/miclle/goblet), keeping the Go + React single-binary deployment model while turning the template into a product surface for prompt-driven CAD exploration, STEP-first import, and browser-native 3D inspection.

## Product Direction

litecad starts as a fast web studio for early mechanical design loops:

- Write a constrained design brief and preview a generated part shape.
- Inspect geometry in a browser viewport powered by Three.js.
- Build toward STEP / STL / GLB import, conversion, and measurement workflows.
- Keep backend services ready for AI orchestration, model metadata, and design history.
- Deploy as one Go executable that embeds the built React application.

The current implementation is an initialization milestone: it includes product branding, an AI 3D studio first screen, a Three.js preview prototype, and a backend status endpoint. AI generation and STEP parsing are intentionally not claimed as complete yet.

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
- PostgreSQL or MySQL
- [Task](https://taskfile.dev/)
- `reflex` for `task dev`
- `staticcheck` and `golangci-lint` for `task check`

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
task install        # Install Go and frontend dependencies
task dev            # Start Vite dev server + Go hot reload
task build          # Build production binary with embedded frontend
task build-all      # Cross-compile for linux/darwin/windows x amd64/arm64
task run            # Run the production binary with local config
task lint           # Auto-fix Go and frontend style checks
task check          # CI-aligned checks
task test           # Go tests + frontend Vitest
task clean          # Remove build artifacts
task update-tools   # Install/update reflex, staticcheck, golangci-lint
```

## Architecture

```text
cmd/litecad/                  # Application entry point and local config
internal/config/              # YAML config loading
internal/database/            # GORM database connection and migration
internal/entity/              # Data models and domain types
internal/handler/             # HTTP handlers, route registration, middleware
internal/service/             # Business logic and database operations
pkg/                          # Reusable helpers
website/                      # Embedded SPA
  assets_development.go       # Dev mode: reverse-proxy to Vite
  assets_production.go        # Prod mode: go:embed static assets
  src/
    api/                      # Axios API modules
    views/                    # Route-level UI
    components/               # Reusable UI components
    layouts/                  # Page layouts
    lib/                      # Shared frontend utilities
scripts/                      # Shell helpers invoked by Taskfile
```

## API Surface

Current initialization endpoint:

```text
GET /api/v1/studio/status
```

It reports the product bootstrap state and the first planned capability set for the studio.

## Single Binary Embedding

- Development builds use `website/assets_development.go` and reverse-proxy static requests to the Vite dev server.
- Production builds use `website/assets_production.go` and embed `website/build/*` with `//go:embed`.
- `/api` paths return JSON 404s when not found; other unknown paths fall back to the SPA index.

## Configuration

```yaml
addr: "0.0.0.0:${LITECAD_HTTP_PORT:-46280}"
driver: postgres
dsn: "host=localhost port=5432 user=postgres password=postgres dbname=app sslmode=disable"
```

Configuration files support `${NAME}` and `${NAME:-fallback}` environment variable expansion.

## Near-Term Roadmap

- Define design/project entities and persistence.
- Add upload and metadata extraction for STEP / STL / GLB assets.
- Decide the conversion boundary for STEP previews, likely server-side conversion to web-friendly mesh data or GLB.
- Add AI orchestration APIs for prompt-to-design iterations.
- Add measurement, sectioning, edge display, and export workflows in the viewer.

## Verification

Run before committing:

```bash
task check
```

Run tests when backend or shared frontend behavior changes:

```bash
task test
```

## License

[MIT](LICENSE)
