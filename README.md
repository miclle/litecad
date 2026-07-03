# Goblet

A project template for building Go + React single-page applications that compile into a single binary.

The backend embeds the frontend build output via `//go:embed`, so production deployment is typically a single executable plus a database.

## Tech Stack

**Backend:**

- Go 1.26, [fox-gonic/fox](https://github.com/fox-gonic/fox) (Gin-based HTTP framework)
- GORM with PostgreSQL (default) or MySQL driver
- [Viper](https://github.com/spf13/viper) for configuration

**Frontend:**

- React 19, TypeScript 6, Vite 8, Tailwind CSS 4
- React Router v7, React Query v5
- [shadcn/ui](https://ui.shadcn.com/) v4 component library
- Vitest 4 for unit testing

## Requirements

- Go 1.26+
- Node.js 22.14+
- PostgreSQL or MySQL
- [Task](https://taskfile.dev/) (task runner)
- `reflex` — file-watching hot reload for `task dev`
- `staticcheck` — static analysis for `task check`
- `golangci-lint` — comprehensive linting for `task check`

Run `task update-tools` to install `reflex`, `staticcheck`, and `golangci-lint`.

## Quick Start

```bash
git clone https://github.com/miclle/goblet.git
cd goblet
task install
```

Create local config:

```bash
cp cmd/app/config.example.yaml cmd/app/config.local.yaml
# Edit config.local.yaml with your database settings
```

Start development:

```bash
task dev
```

This starts both the Vite dev server (port 5173) and the Go server with hot reload (port 9000).

To avoid port conflicts when running multiple local apps, override the ports per session:

```bash
GOBLET_HTTP_PORT=9100 GOBLET_VITE_PORT=3100 task dev
```

`task dev` wires those values through Vite, the Vite `/api/v1` proxy, and the development asset reverse proxy.

## Common Commands

```bash
task install        # Install Go and frontend dependencies
task dev            # Start Vite dev server + Go hot reload
task build          # Build production binary with embedded frontend
task build-all      # Cross-compile for linux/darwin/windows × amd64/arm64
task run            # Run the production binary with local config
task lint           # Auto-fix: go mod tidy, gofmt, go vet, staticcheck, ESLint
task check          # CI-aligned checks (read-only, no file modifications)
task test           # Go tests (race + coverage) + frontend Vitest
task clean          # Remove build artifacts
task update-tools   # Install/update reflex, staticcheck, golangci-lint
```

## Architecture

```
.
├── cmd/app/                        → Application entry point
│   ├── main.go
│   └── config.example.yaml
├── internal/
│   ├── config/                     → YAML config loading (Viper)
│   ├── entity/                     → Data models (GORM)
│   ├── handler/                    → HTTP handlers + routes + middleware
│   ├── service/                    → Business logic + DB operations
│   └── errors/                     → Centralized error types
├── pkg/gormlog/                    → GORM logger adapter
├── website/                        → Embedded SPA (React + Vite)
│   ├── assets_development.go       → Dev: reverse-proxy to Vite dev server
│   ├── assets_production.go        → Prod: //go:embed build/*
│   └── src/
│       ├── api/                    → API client (Axios)
│       ├── components/ui/          → shadcn/ui components
│       ├── context/                → React context providers
│       ├── hooks/                  → Custom React hooks
│       ├── layouts/                → Page layout components
│       ├── lib/                    → Utilities (React Query client, cn helper)
│       ├── types/                  → TypeScript type definitions
│       └── views/                  → Page-level route components
├── scripts/                        → Shell helpers invoked by Taskfile
├── .github/workflows/              → CI workflows
└── Taskfile.yaml                   → Task runner configuration
```

### Single Binary Embedding

The key pattern: two Go files with build tags control how frontend assets are served:

- **Development** (`-tags development`): Reverse-proxies requests to Vite dev server at `localhost:5173`
- **Production** (default): Serves assets from `//go:embed build/*`, with SPA fallback for non-API routes

## Configuration

The YAML config (`config.example.yaml`) keeps only bootstrap settings:

```yaml
addr: "0.0.0.0:${GOBLET_HTTP_PORT:-9000}"
driver: postgres   # or "mysql"
dsn: "host=localhost port=5432 user=postgres password=postgres dbname=app sslmode=disable"
```

## Build & Deployment

```bash
task build          # Build production binary (includes frontend)
./bin/app -c config.yaml
```

Cross-compile for all supported platforms:

```bash
task build-all      # Outputs to bin/ for each OS/arch combination
```

## CI

GitHub Actions workflows are included:

- **ci.yml** — runs backend gofmt/vet/staticcheck/tests, frontend lint/type-check/tests/build, and an embedded binary build
- **golangci-lint.yml** — runs golangci-lint on PRs
- **dependency-review.yml** — reviews dependency changes on PRs
- **actionlint.yml** — lints GitHub Actions workflow files

## License

[MIT](LICENSE)
