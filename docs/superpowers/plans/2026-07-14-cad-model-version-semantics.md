# CAD Model Version Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make immutable project model revisions the durable source of truth for generated CAD source changes and History restoration.

**Architecture:** Replace parameter-only revision records with immutable source-model snapshots. A `ProjectModel` points at its current revision, CAD document model nodes reference an explicit revision, and History stores before/after revision IDs; OCCT shapes and preview meshes remain derived artifacts.

**Tech Stack:** Go 1.26, GORM, PostgreSQL/MySQL with SQLite tests, React Query, React 19, TypeScript 6.

## Global Constraints

- Preserve `Handler -> Service -> Entity` layering and DTO boundaries.
- Every mutation uses the existing CAD document `expected_revision` and returns `409 Conflict` on stale input.
- Do not persist serialized OCCT shapes or claim editable B-rep history.
- Existing project models must receive a deterministic initial revision during migration/backfill.
- Run `task check`, `task test`, `task test-browser`, and `task build`.

---

### Task 1: Introduce immutable model revisions

**Files:**
- Create: `internal/entity/project_model_revision.go`
- Modify: `internal/entity/entity.go`
- Modify: `internal/database/database.go`
- Modify: `internal/database/database_test.go`
- Modify: `internal/service/service_test.go`
- Modify: `internal/handler/auth_test.go`

**Interfaces:**
- Produces: `ProjectModelRevision` with `ID`, `ProjectID`, `ModelID`, `ParentRevisionID`, `Sequence`, `SourceData`, `MetadataJSON`, `ContentChecksum`, `Summary`, and timestamps; `ProjectModel.CurrentRevisionID` references the active snapshot.

- [x] Add failing migration tests asserting the revision table and `project_models.current_revision_id` column exist.
- [x] Run `go test ./internal/database` and confirm the schema assertions fail.
- [x] Add the entity and migration registration, including unique `(model_id, sequence)` indexing.
- [x] Update test database migration helpers.
- [x] Re-run database tests and confirm they pass.

### Task 2: Create and backfill revision 1

**Files:**
- Create: `internal/service/project_model_revision.go`
- Create: `internal/service/project_model_revision_test.go`
- Modify: `internal/service/project.go`
- Modify: `internal/service/parametric_artifact.go`

**Interfaces:**
- Produces: `ensureProjectModelRevision(...)`, `createProjectModelRevision(...)`, and public `ProjectModelRevision` DTOs.
- Guarantees: uploads and saved generated models have revision 1; an existing row without `current_revision_id` is backfilled transactionally from its current source and metadata.

- [x] Add failing service tests for upload revision 1, generated-model revision 1, and idempotent legacy backfill.
- [x] Run the focused service tests and confirm no revision is currently created.
- [x] Implement revision creation and lazy transactional backfill, computing checksums from source plus metadata.
- [x] Return `current_revision_id` and `revision_sequence` in project model DTOs.
- [x] Re-run focused service tests and confirm they pass.

### Task 3: Make parameter edits version transitions

**Files:**
- Modify: `internal/service/parametric_artifact.go`
- Modify: `internal/service/cad_document_history.go`
- Modify: `internal/service/parametric_artifact_test.go`
- Modify: `website/src/types/project.ts`

**Interfaces:**
- Consumes: existing parameter edit requests.
- Produces: a new immutable revision and a `parameter-change` History command containing `before_revision_id` and `after_revision_id`.

- [x] Add failing tests asserting one parameter edit creates sequence 2 without mutating revision 1.
- [x] Add failing Undo/Redo tests asserting `current_revision_id` switches between revisions 1 and 2 and source/metadata reads follow the active revision.
- [x] Replace the parameter-only revision write and metadata-copy History payload with revision creation and revision-ID transitions.
- [x] Update source/model reads to resolve the active revision while retaining model-row compatibility fields as a cache during this phase.
- [x] Re-run service and History tests and confirm they pass.

### Task 4: Expose version history and restore

**Files:**
- Create: `internal/handler/project_model_revisions.go`
- Create: `internal/handler/project_model_revisions_test.go`
- Modify: `internal/handler/handler.go`
- Modify: `website/src/api/projects.ts`
- Modify: `website/src/types/project.ts`
- Modify: `website/src/views/project/parametric-artifact-editor.tsx`

**Interfaces:**
- Produces: owner-scoped list/get revision endpoints and a restore endpoint requiring `expected_revision`.
- UI: shows the current sequence and allows restoring a prior revision through the same History mechanism.

- [x] Add failing route tests for owner scoping, ordered revision listing, restore, and stale restore conflict.
- [x] Implement DTO routes and service methods without exposing GORM entities.
- [x] Add frontend API/type tests and a focused component test for revision display and restore.
- [x] Implement the compact revision selector in the existing Inspector editor.
- [x] Run focused backend and frontend tests.

### Task 5: Bind CAD document nodes to model revisions and update docs

**Files:**
- Modify: `internal/service/cad_document.go`
- Modify: `internal/service/cad_document_nodes_test.go`
- Modify: `website/src/types/project.ts`
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`
- Modify: `docs/ai-parametric-assistant.md`

**Interfaces:**
- Produces: `CADDocumentNode.model_revision_id` for model root nodes; component child nodes continue to reference their source root.

- [x] Add failing tests asserting new and synchronized model nodes carry the current revision ID and parameter changes update that reference through History.
- [x] Implement schema-version-aware document synchronization and upgrade existing document JSON in memory before persistence.
- [x] Update frontend types and preview source resolution to honor the active version returned by model APIs.
- [x] Document immutable source versions, derived worker geometry, and the remaining lack of serialized B-rep feature state.
- [x] Run `task check`, `task test`, `task test-browser`, and `task build`.
- [x] Review the complete diff and commit as `feat(cad): persist immutable model revisions`.
