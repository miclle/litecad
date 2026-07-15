# API Contract Rules

These rules apply to HTTP APIs, frontend API clients, tests, examples, and future SDK or CLI contracts.

## Routes

- Main application APIs should live under `/api/v1/...`.
- Register all API routes in `internal/handler/handler.go`.
- Health checks, embedded SPA assets, and clearly documented integration endpoints may live outside `/api/v1`.
- Keep docs, tests, and frontend API clients synchronized with the actual route paths.

## JSON Contracts

- Use explicit `json` tags on Go request and response DTOs.
- Prefer `snake_case` wire fields for API JSON, such as `created_at` and `user_id`.
- Do not support duplicate field spellings for the same meaning unless there is a documented versioning plan.
- Frontend types should reflect the backend wire contract. If UI code needs camelCase, convert at the API boundary.

## DTO Boundaries

- Do not expose GORM entities as HTTP response bodies.
- Keep HTTP DTOs near the handlers that use them.
- Keep database entities, provider SDK structs, and frontend UI state as separate types.
- When changing an API, check handler DTOs, service inputs/results, frontend `website/src/api/`, frontend `website/src/types/`, tests, and docs.

## Status And Errors

- Creating a resource should usually return `201 Created`.
- Successful deletes or commands with no response body should usually return `204 No Content`.
- Map internal, database, and provider errors to stable HTTP status responses before they reach clients.
- Do not expose DSNs, credentials, SQL details, or provider internals in error responses.

## CAD Document Concurrency

- CAD document edit, Undo, and Redo requests must include `expected_revision` from the latest server document response.
- Reject stale CAD document mutations with `409 Conflict`; never silently overwrite a newer revision from another browser or device.
- Keep the database-backed History head and materialized CAD document update in the same service transaction.
- `POST /api/v1/projects/:projectID/cad-document/subassemblies` captures the direct ordinary occurrences of one leaf group as an immutable revision-1 project-local definition. `POST /api/v1/projects/:projectID/cad-document/subassemblies/:definitionID/instances` creates a tagged group and expanded revision-pinned member occurrences at an explicit translation. Both requests require `expected_revision`, reject stale writes, and append reversible History commands atomically.
- Reusable-instance member occurrences are immutable: occurrence, model/node, source deletion, mate, transform, regroup, duplicate, rename, reorder, suppression, and current-model revision updates must not rewrite a linked member. The tagged instance group supports whole-group suppression only; parent destinations for ordinary occurrence/group edits and new instances must not be another instance group.
- `PATCH /api/v1/projects/:projectID/models/:modelID/feature-dsl-graph` accepts a complete validated `.lcad.json` source plus `expected_revision`. It must preserve the parameter envelope, enforce globally unique already-trimmed recursive node IDs, create an immutable model revision, update occurrence revision bindings, and append one reversible graph-versioned `feature-graph-change` History entry with JSON-Pointer-safe paths and added/updated/moved/removed transitions atomically.
