# Durable Feature/Operation Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote saved LiteCAD Feature DSL source revisions from top-level whole-document diffing to a versioned durable Feature/Operation Graph with globally stable recursive node IDs, nested-node editing, path-aware History, Undo/Redo, browser preview, and STEP export parity.

**Architecture:** Keep immutable `.lcad.json` source revisions as the durable source of truth and keep OCCT shapes/Three.js buffers derived. Feature DSL document `version: 1` is also the graph schema version. Every top-level feature and recursive boolean operand is one graph node whose `id` must be globally unique within the document. History stores the before/after model revision IDs plus deterministic recursive transitions; node paths use stable IDs (`features/<root>/operands/<child>`) while explicit sibling indexes capture reordering. The existing owner-scoped `PATCH .../feature-dsl-graph` transaction remains the write boundary, but its diff becomes recursive and its public History shape exposes graph version, nested paths, and moves.

**Tech Stack:** Go 1.26 + GORM, React 19 + TypeScript 6, React Query 5, shadcn/ui Base primitives, i18next, Vitest 4, Playwright 1.61, browser OCCT worker.

## Product And Design Boundary

- The subject is a CAD engineer inspecting and revising a saved parametric model; the editor's single job is to make graph hierarchy and one-node-at-a-time changes legible without hiding the complete source escape hatch.
- Reuse the existing neutral workbench palette and semantic tokens. Body text remains the project's Geist stack; graph IDs, paths, and JSON stay monospace.
- The signature interaction is a compact “graph rail”: an indented vertical hierarchy of stable node IDs that selects a node-scoped JSON editor. The selected row is the only emphasized element; the rest of the Inspector remains quiet.
- Layout:

  ```text
  Feature graph · v1 · 4 nodes
  │ base            box
  └─ body           boolean
     ├─ blank       box
     └─ bore        cylinder

  Selected node · features/body/operands/bore
  [node JSON excluding nested operands]

  ▸ Edit complete source
  [Reset]                           [Apply graph]
  ```

- Use existing shadcn `Button`, `Collapsible`, `Field`, and `Textarea` compositions. Do not add a new component dependency or a decorative visual system.
- Preserve the complete-source editor in a collapsed advanced section so add/remove/reorder remains possible, while ordinary nested updates use the selected-node editor.
- Stable IDs cannot be changed from the node-scoped editor. A node type or parameters may change only after the complete resulting graph compiles successfully in the browser worker.
- This phase is durable source-graph and operation-History semantics. It is not serialized OCCT shape state, stable B-rep topology naming, sketch constraints, or imported STEP feature history.

## Global Constraints

- Work directly on synchronized `main` because the user explicitly required it.
- Use TDD for each backend, protocol, pure utility, and UI behavior.
- Preserve `expected_revision` conflict handling and the atomic model-revision/occurrence-binding/CAD-History transaction.
- Keep preview and STEP export on the same Feature DSL worker compiler.
- Run `task check`, `task test`, and `task test-browser`; verify the nested editor in the Codex in-app browser; review the complete diff; refresh docs; commit and push before Phase 3.

---

### Task 1: Make Recursive Node Identity A Backend Invariant

**Files:**
- Modify: `internal/service/parametric_artifact.go`
- Modify: `internal/service/parametric_artifact_test.go`
- Modify: `internal/service/feature_dsl_graph_test.go`

**Interfaces:**
- Consumes: Feature DSL v1 documents with recursive `boolean.operands`.
- Produces: one globally unique node-ID namespace across top-level features and every nested operand.

- [x] **Step 1: Add failing recursive-ID tests**

  Add creation and graph-update cases where a nested boolean operand duplicates either its parent ID or another top-level/nested ID. Assert `ErrInvalidProjectParametricArtifactInput`.

- [x] **Step 2: Run the tests red**

  Run: `go test ./internal/service -run 'TestCreateProjectParametricArtifactRejectsDuplicateFeatureGraphNodeIDs|TestUpdateLiteCADFeatureGraphRejectsInvalidTransitionsAndAccess'`

  Expected: nested duplicate cases are currently accepted.

- [x] **Step 3: Implement recursive ID collection**

  Replace the top-level-only ID pass with one recursive traversal over `liteCADFeatureDSLValidationFeature.Operands`. Register sketches only from top-level definition nodes, but reject blank or duplicate IDs at any depth before geometry validation.

- [x] **Step 4: Run focused backend validation green**

  Run the focused tests above plus `go test ./internal/service -run 'TestAIParametricRunCreatesPendingLiteCADFeatureDSLArtifact'`.

### Task 2: Persist Versioned Recursive Graph Transitions

**Files:**
- Modify: `internal/service/feature_dsl_graph.go`
- Modify: `internal/service/feature_dsl_graph_test.go`
- Modify: `internal/service/cad_document_history.go`
- Modify: `internal/handler/project_feature_dsl_graph_test.go`

**Interfaces:**
- Produces one flattened node record per recursive feature with `id`, `type`, parent ID, sibling index, stable ID path, and canonical node-local JSON.
- Produces public History with `feature_graph_version = 1` and transitions containing before/after path and sibling index.
- Adds transition change `moved` when an existing stable ID changes parent or sibling index.

- [x] **Step 1: Add failing nested-transition tests**

  Create a graph with a top-level boolean and nested `blank` / `bore` operands. Change only `bore.diameter`; assert History reports only `bore` as updated, not its boolean parent. Add a reorder case and assert a `moved` transition with before/after indexes. Assert Undo/Redo restores exact source revisions.

- [x] **Step 2: Run the focused service tests red**

  Run: `go test ./internal/service -run 'TestUpdateLiteCADFeatureGraph'`

- [x] **Step 3: Implement recursive parsing and canonicalization**

  Parse document version and recursively flatten features. For boolean nodes, exclude `operands` from the node-local canonical value so a descendant edit does not falsely mark every ancestor updated. Build paths from stable IDs, not array offsets.

- [x] **Step 4: Implement deterministic recursive diffing**

  Preserve after-document order for added/updated/moved transitions and before-document order for removals. Emit `updated` for node-local JSON changes and `moved` for parent/index changes. Store graph version and transitions in `cadFeatureGraphHistoryCommand`.

- [x] **Step 5: Expose the expanded public History contract**

  Add graph version, before/after path, and optional before/after index to service and handler response coverage. Keep raw command JSON private.

- [x] **Step 6: Run backend tests green**

  Run: `go test ./internal/service -run 'TestUpdateLiteCADFeatureGraph|TestProjectModelRevisionListAndRestore'`

  Run: `go test ./internal/handler -run 'TestProjectFeatureDSLGraphRoutesUpdateHistoryAndRejectInvalidAccess'`

### Task 3: Align Browser Protocol And Pure Graph Utilities

**Files:**
- Modify: `website/src/cad/kernel-protocol.ts`
- Modify: `website/src/cad/kernel-protocol.test.ts`
- Add: `website/src/cad/feature-dsl-graph.ts`
- Add: `website/src/cad/feature-dsl-graph.test.ts`

**Interfaces:**
- `flattenFeatureDSLGraph(document)` returns memoizable node descriptors with stable ID path, parent ID, index, depth, and node-local JSON.
- `replaceFeatureDSLGraphNode(document, nodeID, nodeLocalValue)` preserves the selected stable ID and preserves existing nested operands unless the complete-source editor changed them.
- Kernel request validation rejects recursive duplicate IDs before worker compilation.

- [x] **Step 1: Add failing protocol and utility tests**

  Cover nested flatten order/path, recursive duplicate rejection, node-local replacement, stable-ID rejection, preserved boolean operands, and immutable input behavior.

- [x] **Step 2: Run the tests red**

  Run: `cd website && npx vitest run src/cad/kernel-protocol.test.ts src/cad/feature-dsl-graph.test.ts`

- [x] **Step 3: Implement the minimal pure graph module**

  Use iterative or recursive traversal with `Set`/`Map` lookups; keep it independent from React and the OCCT compiler. Pretty-print only when producing an edited source document.

- [x] **Step 4: Enforce browser recursive identity parity**

  Extend Feature DSL document validation with the same global recursive ID invariant as Go.

- [x] **Step 5: Run the focused browser contract tests green**

  Run the Vitest command above.

### Task 4: Build The Nested Graph Rail And Node Editor

**Files:**
- Modify: `website/src/views/project/feature-dsl-graph-editor.tsx`
- Modify: `website/src/views/project/feature-dsl-graph-editor.test.tsx`
- Modify: `website/src/views/project/parametric-artifact-editor.test.tsx`
- Modify: `website/src/i18n.ts`

**Interfaces:**
- Renders every recursive node as an accessible button labeled by stable ID and type.
- Edits one selected node's local JSON while preserving descendants and stable ID.
- Keeps complete-source editing inside an explicit advanced `Collapsible`.
- Apply remains gated by unchanged parameter envelope, valid node JSON, current successful worker compile, and no save in progress.

- [x] **Step 1: Add failing nested-editor tests**

  Assert the rail contains nested nodes with depth, selecting `bore` opens node-local JSON without sibling operands, changing diameter rebuilds the complete document passed to the worker, changing the stable ID is rejected, advanced source remains available, and reset restores both source and selection.

- [x] **Step 2: Run the UI tests red**

  Run: `cd website && npx vitest run src/views/project/feature-dsl-graph-editor.test.tsx src/views/project/parametric-artifact-editor.test.tsx`

- [x] **Step 3: Implement the graph rail**

  Use memoized pure graph descriptors and stable button keys. Keep node selection as primitive state and derive the active node; do not mirror the parsed graph in effects.

- [x] **Step 4: Implement node-scoped and advanced editing**

  Use shadcn `Field`/`Textarea` validation semantics. Node-scoped changes replace only the selected node-local value. The advanced source area retains add/remove/reorder capability and updates the rail when valid.

- [x] **Step 5: Add English and Chinese copy**

  Add precise copy for graph version/count, selected node/path, node source, immutable ID error, complete source, and `moved` History.

- [x] **Step 6: Run the UI tests green**

  Run the Vitest command above.

### Task 5: Show Nested History And Cover The Browser Workflow

**Files:**
- Modify: `website/src/types/project.ts`
- Modify: `website/src/views/project/project-history-popover.tsx`
- Modify: `website/src/views/project/project-history-popover.test.tsx`
- Modify: `website/e2e/fixtures/project-api.ts`
- Modify: `website/e2e/project-workbench-parametric.spec.ts`

**Interfaces:**
- History renders the stable nested path and graph version and distinguishes Added, Updated, Moved, and Removed.
- Playwright edits a nested boolean operand, waits for browser-kernel preview, applies it, checks nested History, Undo/Redo, reload persistence, and browser errors.

- [x] **Step 1: Add failing History tests**

  Extend frontend types and popover fixtures with a nested `bore` update and a moved operand. Assert stable path/version copy.

- [x] **Step 2: Implement History rendering**

  Prefer `after_path`, fall back to `before_path`, then `node_id`. Keep the full path in `title` while allowing the narrow popover row to truncate.

- [x] **Step 3: Add the deterministic nested-graph E2E fixture and workflow**

  Seed a saved `.lcad.json` boolean graph, edit one nested operand through the rail, apply after worker success, verify the canvas remains ready, inspect path-aware History, Undo/Redo, reload, and no captured browser errors.

- [x] **Step 4: Run focused browser tests**

  Run: `cd website && npx vitest run src/views/project/project-history-popover.test.tsx src/views/project/feature-dsl-graph-editor.test.tsx`

  Run: `cd website && npx playwright test e2e/project-workbench-parametric.spec.ts -g 'nested feature graph'`

### Task 6: In-App Browser Verification, Review, Docs, And Ship

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/api-contract.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `docs/ai-parametric-assistant.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`
- Modify: `docs/current-work-handoff.md`
- Modify: this plan

- [x] **Step 1: Run automated phase gates**

  Run: `task check`

  Run: `task test`

  Run: `task test-browser`

- [x] **Step 2: Verify in the Codex in-app browser**

  Open a real saved boolean `.lcad.json` model, select a nested operand in the graph rail, change one geometric field, confirm browser-kernel preview success, apply, inspect path-aware History, Undo/Redo, reload persistence, STEP export availability, and console warnings/errors.

- [x] **Step 3: Review the complete diff**

  Use `code-reviewer` for recursive identity parity, canonicalization, transition determinism, transaction/Undo semantics, React derived-state correctness, accessibility, i18n, E2E strength, and unrelated scope. Fix all actionable findings and rerun affected tests.

- [x] **Step 4: Refresh shipped-truth documentation**

  Document versioned recursive source-graph semantics, nested stable IDs and editing, path-aware History, and the continuing lack of durable OCCT shape state, stable B-rep topology naming, sketch constraints, or imported source history.

- [x] **Step 5: Run final verification after review and docs**

  Run: `git diff --check`

  Run: `task check`

  Run: `task test`

  Run: `task test-browser`

- [x] **Step 6: Commit and push Phase 2**

  Commit message:

  ```text
  feat(cad): persist recursive feature graph history

  Enforce stable recursive Feature DSL node identity, expose path-aware versioned History, and add nested-node editing with browser-kernel validation.
  ```

  Push `main` to `origin/main`, confirm both resolve to the same commit, then begin stable topology references and associative inspection semantics.
