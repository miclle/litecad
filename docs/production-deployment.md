# Production Deployment

LiteCAD production deployment uses the compact single-binary model: build the Vite frontend, embed `website/build/*` into the Go binary, run the binary with a YAML config file, and provide a PostgreSQL or MySQL database.

## Build

Build the current platform binary:

```bash
task build
```

This runs `npm install && npm run build` in `website/`, then `scripts/build.sh`. The script writes `bin/litecad` by default, builds with `CGO_ENABLED=0`, and injects `main.CommitID` plus `main.BuildTime` through Go linker flags.

Cross-compile all supported targets:

```bash
task build-all
```

`scripts/build-all.sh` defaults to:

```text
linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64
```

Override `BIN_DIR`, `APP_NAME`, or `PLATFORMS` when packaging a release.

## Runtime Config

Start from the example config and keep production secrets in environment variables:

```bash
cp cmd/litecad/config.example.yaml config.production.yaml
```

Minimal PostgreSQL example:

```yaml
addr: "0.0.0.0:${LITECAD_HTTP_PORT:-46280}"
driver: postgres
dsn: "${DATABASE_URL}"
```

MySQL is also supported:

```yaml
addr: "0.0.0.0:${LITECAD_HTTP_PORT:-46280}"
driver: mysql
dsn: "${DATABASE_URL}"
```

LiteCAD expands `${NAME}` and `${NAME:-fallback}` placeholders before parsing YAML. Supported runtime database drivers are `postgres` and `mysql`; SQLite is only used by tests.

The optional CAD Agent provider stays server-side:

```yaml
ai:
  provider: openai_compatible
  base_url: "${LITECAD_AI_BASE_URL:-https://api.openai.com/v1}"
  api_key: "${LITECAD_AI_API_KEY:-}"
  model: "${LITECAD_AI_MODEL:-gpt-4.1-mini}"
  timeout_seconds: 90
  max_output_tokens: 2048
```

Leaving `ai.api_key` or `ai.model` empty disables provider-backed Assistant sends while the rest of the application continues to run.

## Run

Run the built binary with an explicit config path:

```bash
DATABASE_URL="<database connection string>" LITECAD_HTTP_PORT=46280 ./bin/litecad -c config.production.yaml
```

At startup the server:

- reads and validates config,
- connects to the configured database,
- runs GORM `AutoMigrate` for LiteCAD entities,
- initializes the optional OpenAI-compatible client,
- serves `/api/v1/*` routes,
- serves the embedded SPA for non-API `GET` and `HEAD` routes.

The production binary does not need a Vite dev server. Development builds use `website/assets_development.go` to proxy Vite; production builds use `website/assets_production.go` and embedded `website/build/*` assets.

## Operational Notes

- Put LiteCAD behind TLS at the reverse proxy or platform edge.
- Ensure the configured database is reachable before starting the process; startup fails fast on connection or migration errors.
- Configure persistent database backups outside LiteCAD. The app currently stores project metadata, source and immutable model-revision bytes, preview artifacts, thumbnails, CAD documents, History, conversations, parametric artifacts, generated STEP export artifacts, inspection records, and section artifact generations in the database.
- Do not write local `config.local.yaml` values, API keys, private hosts, or production DSNs into the repository.
- If deploying behind a path-rewriting proxy, preserve `/api/v1/*`, `/assets/*`, and SPA fallback behavior.

## Pre-Release Verification

Before publishing or replacing a production binary, run:

```bash
task check
task test
task build
```

Run `task test-browser` when the release changes project routing, protected-route behavior, workbench panels, browser-visible CAD interactions, preview/export flows, or frontend route state.

Run the live AI provider smoke after changing provider config, provider prompts, model names, or deployment environment variables:

```bash
LITECAD_SMOKE_BASE_URL="https://litecad.example.com" task smoke-ai-provider
```

The smoke script creates a temporary account and project on the running server, asks for a 30 mm sphere with 5 mm through holes along X, Y, and Z, verifies that the backend creates a generated-source artifact, and then soft-deletes the temporary project. It defaults to two provider attempts; override `LITECAD_SMOKE_ATTEMPTS` when diagnosing provider flakiness. It validates live provider reachability and artifact creation; it does not replace `task test-browser` for browser-worker compile/save/canvas coverage.

Assistant generation failures are intentionally split by cause. HTTP `503` means the server has no AI provider configured. HTTP `502` means the configured provider could not complete the request, such as a timeout, network failure, or provider tool-call incompatibility. HTTP `422` means the provider answered, but the returned model draft did not pass LiteCAD validation; retry with a more specific prompt or adjust provider prompt/model compatibility.
