# Assembly Occurrence Authoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a flat project assembly contain multiple independently editable occurrences of the same immutable model revision, with durable naming, ordering, suppression, placement, export, and Undo/Redo semantics.

**Architecture:** Source model and STEP component nodes remain reusable model definitions. `CADAssemblyOccurrence` is the sole instance identity and owns display name, order, suppression, revision binding, and placement; explicit occurrence APIs mutate it inside the existing expected-revision and database History transaction. The browser viewer keys scene objects by occurrence ID while retaining model and node IDs for source loading and component selection.

**Tech Stack:** Go 1.26, GORM, fox handlers, React 19, TypeScript, React Query, Three.js, Vitest, Playwright.

## Global Constraints

- Preserve the existing `Handler -> Service -> Entity` layering and CAD document transaction boundary.
- Every mutation requires `expected_revision`; stale writes return `409 Conflict` and refresh client state.
- Do not add nested assemblies, mates, constraints, cross-model booleans, backend export artifacts, or serialized kernel shape state.
- Do not copy source nodes when an occurrence is duplicated; one definition may have many flat occurrences.
- Suppressed occurrences remain durable and Undo/Redo-capable but do not preview or export.
- Existing schema v2 documents and delete-node History payloads must remain readable without a SQL migration.

---

### Task 1: Persist occurrence authoring commands

**Files:**
- Modify: `internal/service/cad_document.go`
- Modify: `internal/service/cad_document_history.go`
- Modify: `internal/service/cad_document_test.go`
- Modify: `internal/service/cad_document_history_test.go`

**Interfaces:**
- Consumes: assembly occurrence IDs and the current CAD document revision.
- Produces: `DuplicateProjectCADOccurrence`, `UpdateProjectCADOccurrence`, `MoveProjectCADOccurrence`, and `DeleteProjectCADOccurrence`, plus reversible `occurrence-create`, `occurrence-update`, `occurrence-move`, and `occurrence-delete` History commands.

- [x] Add failing service tests that duplicate one occurrence without cloning source nodes, preserve its model revision, insert it after the source occurrence, and reject stale revisions.
- [x] Add failing tests for rename, suppression, transform, move, and delete with exact Undo/Redo restoration of occurrence values and list position.
- [x] Extend `CADAssemblyOccurrence` with `suppressed`; generate new occurrence IDs with the shared prefixed-ID helper.
- [x] Implement occurrence mutations in the existing document transaction and append one History entry per user command.
- [x] Make source-node deletion remove and restore every occurrence referencing that source while preserving legacy single-occurrence History payloads.
- [x] Keep sync idempotent: create a default occurrence only when an active source model has no occurrence, and never collapse duplicate occurrences.
- [x] Run focused Go tests and commit `feat(cad): author flat assembly occurrences`.

### Task 2: Expose owner-scoped occurrence APIs

**Files:**
- Modify: `internal/handler/handler.go`
- Modify: `internal/handler/project_cad.go`
- Modify: `internal/handler/project_cad_test.go`
- Modify: `website/src/api/projects.ts`
- Modify: `website/src/types/project.ts`

**Interfaces:**
- Consumes: service occurrence commands.
- Produces: owner-scoped duplicate/update/move/delete endpoints and typed frontend clients.

- [x] Add failing route tests for authentication, duplicate, rename/suppress/transform, reorder, delete, stale `409`, and Undo/Redo.
- [x] Register explicit occurrence routes below `/projects/:projectID/cad-document/occurrences/:occurrenceID`.
- [x] Bind strict request DTOs and map service validation through the existing project error boundary.
- [x] Add frontend payload/result types and API functions; include new command types in History unions.
- [x] Run focused handler and frontend API tests, then include these changes in the Task 1 commit.

### Task 3: Make the workbench occurrence-native

**Files:**
- Modify: `website/src/views/project/project-preview-assets.ts`
- Modify: `website/src/views/project/project-model-tree.tsx`
- Modify: `website/src/views/project/use-project-selection-controller.ts`
- Modify: `website/src/views/project/use-project-workbench-model-state.ts`
- Modify: `website/src/views/project/use-model-preview-resources.ts`
- Modify: `website/src/views/project/use-model-preview-selection.ts`
- Modify: `website/src/views/project/use-model-preview-scene.ts`
- Modify: `website/src/views/project/use-cad-document-commands.ts`
- Modify: `website/src/views/project/project-workbench-sidebar.tsx`
- Modify: `website/src/views/project/project-workbench-composition.tsx`
- Modify: matching Vitest files and `website/src/i18n.ts`

**Interfaces:**
- Consumes: durable occurrence IDs, suppression, placement, and occurrence mutation APIs.
- Produces: occurrence-keyed tree selection, preview object identity, local visibility, transform autosave, and compact duplicate/rename/order/suppress/delete controls.

- [x] Add failing tests proving two occurrences of one model produce two tree rows and two preview assets with distinct occurrence IDs and placements.
- [x] Add failing selection/resource tests proving scene maps and raycast results distinguish occurrences while component picks retain source node identity.
- [x] Render only unsuppressed occurrences in preview; key visibility and transforms by occurrence ID.
- [x] Add tree and Inspector controls using Lucide icons, tooltips, an inline name field, move buttons, a suppression toggle, duplicate, and occurrence delete.
- [x] Route transform drag/autosave through the selected occurrence endpoint; keep component-node transforms on the existing node endpoint.
- [x] Run targeted Vitest suites and commit `feat(workbench): edit assembly occurrences`.

### Task 4: Export, browser workflow, migration evidence, and docs

**Files:**
- Modify: `website/src/views/project/project-step-export.ts`
- Modify: matching export/controller tests
- Modify: `website/tests/project-workbench.spec.ts`
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `.agents/rules/threejs-viewer.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`
- Modify: this plan

**Interfaces:**
- Consumes: ordered unsuppressed occurrences and pinned immutable revision sources.
- Produces: separate/compound STEP output containing repeated instances in occurrence order, plus verified shipped documentation.

- [x] Add failing export tests proving duplicate occurrences emit two targets with distinct names/placements and suppressed occurrences emit none.
- [x] Extend the deterministic browser workflow to duplicate, rename, move, suppress/restore, place, export, Undo/Redo, and reload an occurrence.
- [x] Exercise a persisted pre-authoring schema v2 fixture and prove lazy sync does not collapse or rewrite its occurrence identities.
- [x] Update all truth surfaces to describe shipped flat occurrence authoring and retain explicit future boundaries.
- [x] Run `task check`, `task test`, `task test-browser`, `task build`, `git diff --check`, and a desktop plus narrow screenshot/console pass.
- [x] Mark this plan complete, review the full diff, and commit `docs: record occurrence authoring semantics` as a separate commit.
