# Testing Rules

These rules apply to Go tests, frontend tests, and verification commands.

## Go Tests

- Prefer table-driven tests with `t.Run()` for multiple cases.
- Use clear human-readable test names.
- Use the standard library or existing project test helpers before adding new test dependencies.
- New `pkg/` packages should include focused unit tests.
- Database behavior should use isolated test databases or be skipped with a clear environment variable gate.

## HTTP Tests

- Prefer handler-level tests through the real router for route binding, status codes, and API shape.
- Test path, query, body, and error cases for non-trivial endpoints.
- Avoid testing service internals through HTTP tests unless the behavior is user-visible.

## Frontend Tests

- Use Vitest and keep tests near the code they cover.
- Test API clients, hooks, route helpers, and state derivation before pure layout details.
- Mock network calls through the API boundary rather than hard-coding backend URLs.

## Browser Tests

- Install the local browser runner once with `task install-browser` before running `task test-browser`.
- Keep deterministic workbench API state in `website/e2e/fixtures/project-api.ts`; create a fresh fixture closure per test instead of module-level mutable state.
- Keep shell, import, transform conflict/Undo/Redo, occurrence/group/mate/reusable-subassembly, inspection/section, Assistant/parameter persistence, and export workflows in independent specs so failures identify the affected product path.
- Use condition-based assertions for worker compilation, autosave, and downloads. Do not assert that an unrelated request count or arbitrary timeout remains unchanged while React Query refreshes in the background.
- Capture page and console errors in every browser-visible workflow. Expected conflict responses may assert their one known browser resource error, but must reject additional errors.
- Treat `task test-browser` as deterministic fixture coverage. It must not depend on external AI provider credentials or live model behavior. When a change depends on actual provider configuration, run and report `task smoke-ai-provider` or an equivalent environment-gated live-provider smoke against the running server.

## Verification

- Run `task check` before committing.
- Run `task test` for behavior, API, database, or UI interaction changes.
- Run `task test-browser` for route, workbench panel, browser CAD worker, and visible interaction changes.
- Run `task smoke-ai-provider` against an already running server when validating real OpenAI-compatible provider credentials, model names, network reachability, or provider prompt changes.
- `task lint` may modify files through `go mod tidy` and `gofmt`; inspect the diff afterward.
- If a command cannot run locally, report the command, the reason, and the remaining risk.
