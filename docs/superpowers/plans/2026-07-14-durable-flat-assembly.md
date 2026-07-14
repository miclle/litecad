# Durable Flat Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Represent each project's multi-model composition as a durable, versioned flat assembly used by the workbench and compound STEP export.

**Architecture:** Upgrade the CAD document JSON to include one explicit root assembly and flat occurrences. Each occurrence references a model and immutable model revision and owns the persisted placement; CAD document revision/History remains the sole mutation and concurrency envelope, avoiding a second transform source of truth.

**Tech Stack:** Go 1.26, GORM JSON persistence, React 19, TypeScript 6, OpenCascade.js worker, Playwright.

## Global Constraints

- Require the model revision interfaces delivered by the CAD model version plan.
- Store assembly semantics inside the durable CAD document state; do not add a second SQL transform owner.
- Phase one is flat: no nested assemblies, mates, constraints, cross-model booleans, or editable merged parts.
- Compound STEP remains a browser download but must be derived from the assembly record.
- Run `task check`, `task test`, `task test-browser`, and `task build`.

---

### Task 1: Add CAD document schema v2 assembly records

**Files:**
- Modify: `internal/service/cad_document.go`
- Modify: `internal/service/cad_document_nodes_test.go`
- Modify: `website/src/types/project.ts`

**Interfaces:**
- Produces: `CADAssembly { id, name, occurrences }` and `CADAssemblyOccurrence { id, node_id, model_id, model_revision_id, name, transform }` in document schema version 2.

- [ ] Add failing service tests asserting a two-model project receives one assembly with two stable occurrences.
- [ ] Add a failing upgrade test using schema version 1 JSON and assert model root nodes become occurrences without changing transforms or component children.
- [ ] Implement schema v2 creation and idempotent v1-to-v2 upgrade inside the existing document transaction.
- [ ] Update public Go and TypeScript DTOs.
- [ ] Re-run focused document tests.

### Task 2: Route placement and History through occurrences

**Files:**
- Modify: `internal/service/cad_document.go`
- Modify: `internal/service/cad_document_history.go`
- Modify: `internal/service/cad_document_history_test.go`
- Modify: `internal/handler/project_cad.go`
- Modify: `internal/handler/project_cad_test.go`

**Interfaces:**
- Consumes: occurrence IDs plus `expected_revision`.
- Produces: transform and delete commands that mutate assembly occurrences and retain Undo/Redo semantics.

- [ ] Add failing tests for occurrence transform, occurrence deletion, Undo/Redo, and stale revision conflict.
- [ ] Update mutation lookup so top-level model actions target occurrences while STEP component child actions continue to target nodes.
- [ ] Keep existing request compatibility by resolving a model root node ID to its occurrence during schema transition.
- [ ] Re-run service and route tests.

### Task 3: Render the explicit assembly in the project tree

**Files:**
- Modify: `website/src/views/project/project-model-tree.tsx`
- Modify: `website/src/views/project/project-model-tree.test.tsx`
- Modify: `website/src/views/project/use-project-workbench-route-controllers.ts`
- Modify: `website/src/i18n.ts`

**Interfaces:**
- Consumes: `ProjectCADDocument.assembly`.
- Produces: one named assembly root with occurrence children; existing STEP product/component children remain nested below their occurrence.

- [ ] Add a failing component test for the assembly root, occurrence selection, and component nesting.
- [ ] Implement the tree projection using existing selection callbacks and icons.
- [ ] Add localized fixed copy while leaving project/model names untranslated.
- [ ] Re-run focused frontend tests.

### Task 4: Export from assembly occurrences

**Files:**
- Modify: `website/src/views/project/project-step-export-action.ts`
- Modify: `website/src/views/project/project-step-export-action.test.ts`
- Modify: `website/src/cad/opencascade-step.test.ts`
- Modify: `website/e2e/project-workbench-export.spec.ts`

**Interfaces:**
- Consumes: selected assembly occurrence IDs and their pinned model revisions/transforms.
- Produces: separate or compound STEP output with stable occurrence order and names.

- [ ] Add failing unit tests proving export selection and transform lookup come from occurrences rather than ad hoc model arrays.
- [ ] Add a failing worker/export test for two occurrences referencing different model revisions.
- [ ] Update export source construction and preserve current browser download behavior.
- [ ] Extend the deterministic export E2E to assert the assembly-root selection and merged download filename.
- [ ] Re-run focused unit and browser tests.

### Task 5: Document and verify phase-one assembly semantics

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`

**Interfaces:**
- Produces: accurate shipped claims for durable flat occurrences and explicit future boundaries for nesting, mates, cross-model boolean edits, and STEP product-structure fidelity.

- [ ] Update all truth surfaces and remove only the completed flat-assembly roadmap bullets.
- [ ] Run `git diff --check`, `task check`, `task test`, `task test-browser`, and `task build`.
- [ ] Perform a rendered desktop and narrow-viewport check of the project tree and export picker with no overlap or console errors.
- [ ] Review the complete diff and commit as `feat(cad): persist flat assembly semantics`.
