# CAD History Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Persist project CAD operation history in the database and provide server-authoritative Undo/Redo that survives reloads and switching browsers or computers.

**Architecture:** Keep `ProjectCADDocument.DocumentJSON` as the materialized current document state. Store each user edit as a reversible `ProjectCADHistoryEntry` with a parent link, status, summary, and typed command payload; keep the document's current history head in the database. Every edit, undo, and redo runs in one transaction, checks the caller's expected document revision, conditionally updates the document row, and returns the current document plus `can_undo`/`can_redo` state.

**Tech Stack:** Go 1.26, GORM, PostgreSQL/MySQL with SQLite service tests, React 19, TypeScript 6, React Query 5, shadcn/ui, Vitest, Three.js.

## Global Constraints

- No compatibility layer or legacy-history migration is required because the product is not deployed.
- `ProjectCADDocument.Revision` remains monotonic and increments for edit, undo, and redo.
- History is server-authoritative; browser memory and local storage are not sources of truth.
- New edits after Undo discard the redo path logically but retain discarded records in the database.
- Source upload/model synchronization is not an undoable CAD edit.
- Do not introduce durable B-rep state, general assembly semantics, or AI geometry mutation.
- Follow Handler -> Service -> Entity layering and keep owner scoping on every history path.

---

### Task 1: Persistent reversible history model

**Files:**
- Modify: `internal/entity/entity.go`
- Modify: `internal/database/database.go`
- Modify: `internal/service/service_test.go`
- Modify: `internal/handler/auth_test.go`
- Test: `internal/service/cad_document_history_test.go`
- Modify: `internal/service/cad_document.go`

**Interfaces:**
- Produces: `entity.ProjectCADHistoryEntry`, document fields `HistorySequence` and `HistoryHeadID`.
- Produces: public `CADHistoryState` and `CADHistoryEntrySummary` DTOs.
- Produces: `ErrCADDocumentConflict` for stale revisions.

- [x] **Step 1: Write failing persistence and history-state tests**

```go
func TestUpdateProjectCADNodeTransformCreatesHistoryEntry(t *testing.T) {
    // Create project/document, update a node using ExpectedRevision,
    // assert one applied transform history entry with before/after payload,
    // and assert document History.CanUndo=true and CanRedo=false.
}

func TestProjectCADDocumentRejectsStaleRevision(t *testing.T) {
    // Submit two edits with the same ExpectedRevision and assert the second
    // returns ErrCADDocumentConflict without changing state or history.
}
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `go test -tags development ./internal/service -run 'Test(UpdateProjectCADNodeTransformCreatesHistoryEntry|ProjectCADDocumentRejectsStaleRevision)'`

Expected: compilation failure because history fields and `ExpectedRevision` do not exist.

- [x] **Step 3: Add entity fields and reversible command types**

```go
type ProjectCADHistoryEntry struct {
    ID            string
    CreatedAt     time.Time
    UpdatedAt     time.Time
    ProjectID     string
    DocumentID    string
    Sequence      int64
    ParentEntryID string
    Status        string
    CommandType   string
    TargetID      string
    Summary       string
    CommandJSON   []byte
}

type cadTransformHistoryCommand struct {
    NodeID string       `json:"node_id"`
    Before CADTransform `json:"before"`
    After  CADTransform `json:"after"`
}
```

Add a unique index on `(document_id, sequence)` and indexes for `(document_id, status)` and `parent_entry_id`. Add `history_sequence` and `history_head_id` to `ProjectCADDocument`.

- [x] **Step 4: Centralize history mutation persistence**

Add `mutateProjectCADDocument(ctx, owner, project, expectedRevision, command)` which:

```text
loads the owner-scoped project and document
checks document.Revision == expectedRevision
decodes current state
applies one typed forward command
marks existing undone records discarded
creates one applied history entry whose parent is HistoryHeadID
conditionally updates the document WHERE id=? AND revision=?
increments Revision and HistorySequence
returns ErrCADDocumentConflict when RowsAffected != 1
```

- [x] **Step 5: Run focused service tests and verify GREEN**

Run: `go test -tags development ./internal/service -run 'Test(UpdateProjectCADNodeTransformCreatesHistoryEntry|ProjectCADDocumentRejectsStaleRevision)'`

Expected: PASS.

---

### Task 2: Undo/Redo service and operation coverage

**Files:**
- Test: `internal/service/cad_document_history_test.go`
- Modify: `internal/service/cad_document.go`
- Create: `internal/service/cad_document_history.go`

**Interfaces:**
- Produces: `UndoProjectCADDocument(ctx, ModifyProjectCADHistoryInput)`.
- Produces: `RedoProjectCADDocument(ctx, ModifyProjectCADHistoryInput)`.
- Produces: `ListProjectCADHistory(ctx, ownerUserID, projectID, limit, beforeSequence)`.

- [x] **Step 1: Write failing tests for all command types and branch semantics**

```go
func TestUndoRedoProjectCADTransform(t *testing.T) {}
func TestUndoRedoProjectCADBoxUnion(t *testing.T) {}
func TestUndoRedoProjectCADNodeDelete(t *testing.T) {}
func TestNewEditAfterUndoDiscardsRedoButKeepsHistory(t *testing.T) {}
func TestUndoRedoHistorySurvivesServiceReload(t *testing.T) {}
```

Each test asserts materialized nodes/operations, monotonic revision, head movement, status transitions, and `CanUndo`/`CanRedo`.

- [x] **Step 2: Run focused tests and verify RED**

Run: `go test -tags development ./internal/service -run 'Test(UndoRedo|NewEditAfterUndo)'`

Expected: compilation failure because Undo/Redo functions do not exist.

- [x] **Step 3: Implement typed forward/inverse commands**

```go
type cadDeleteNodeHistoryCommand struct {
    Node           CADDocumentNode `json:"node"`
    NodeIndex      int             `json:"node_index"`
    DeleteOperation CADOperation   `json:"delete_operation"`
    OperationIndex int             `json:"operation_index"`
}

type cadBoxUnionHistoryCommand struct {
    Operation      CADOperation `json:"operation"`
    OperationIndex int          `json:"operation_index"`
}
```

Undo applies inverse and changes the current applied entry to `undone`; Redo finds the unique undone child of the current head, reapplies forward, and marks it `applied`.

- [x] **Step 4: Fix effective transform replay semantics**

Keep only the latest root-model transform as an effective placement and apply geometry features before that final transform. Historical transform commands remain in `ProjectCADHistoryEntry`, not in the kernel replay stream.

- [x] **Step 5: Run service and worker-focused tests and verify GREEN**

Run: `go test -tags development ./internal/service -run 'Test(UndoRedo|NewEditAfterUndo)'`

Run: `cd website && npx vitest run src/views/project/project-preview-assets.test.ts src/cad/opencascade-step.test.ts`

Expected: PASS.

---

### Task 3: Owner-scoped HTTP history API

**Files:**
- Modify: `internal/handler/handler.go`
- Modify: `internal/handler/project.go`
- Test: `internal/handler/project_test.go`
- Modify: `pkg/httperr/httperr.go`

**Interfaces:**
- Produces: `GET /api/v1/projects/:projectID/cad-document/history`.
- Produces: `POST /api/v1/projects/:projectID/cad-document/history/undo`.
- Produces: `POST /api/v1/projects/:projectID/cad-document/history/redo`.
- Updates existing CAD mutation bodies to require `expected_revision`.

- [x] **Step 1: Write failing handler tests**

Test edit -> Undo -> reload -> Redo, owner isolation, stale `expected_revision` returning `409`, and paginated history ordering.

- [x] **Step 2: Run handler tests and verify RED**

Run: `go test -tags development ./internal/handler -run 'TestProjectCAD.*History|TestProjectCAD.*Undo|TestProjectCAD.*Redo'`

Expected: 404 or compilation failure because routes and request DTOs do not exist.

- [x] **Step 3: Implement routes and DTO mapping**

Use request shape `{ "expected_revision": 4 }`. Return `{ "document": ..., "history": ... }` for edit/undo/redo and `{ "entries": [...], "next_before_sequence": 12 }` for history listing. Map `ErrCADDocumentConflict` to HTTP `409 Conflict`.

- [x] **Step 4: Run handler tests and verify GREEN**

Run: `go test -tags development ./internal/handler -run 'TestProjectCAD.*History|TestProjectCAD.*Undo|TestProjectCAD.*Redo'`

Expected: PASS.

---

### Task 4: React Query history client and workbench controls

**Files:**
- Modify: `website/src/types/project.ts`
- Modify: `website/src/api/projects.ts`
- Create: `website/src/views/project/cad-document-history.ts`
- Test: `website/src/views/project/cad-document-history.test.ts`
- Modify: `website/src/views/project/index.tsx`

**Interfaces:**
- Produces: `undoProjectCADDocument`, `redoProjectCADDocument`, `fetchProjectCADHistory` API functions.
- Produces: `isCADHistoryShortcut(event)` and history-list presentation helpers.

- [x] **Step 1: Write failing frontend tests**

```ts
test('maps Cmd+Z and Ctrl+Z to undo')
test('maps Cmd+Shift+Z and Ctrl+Shift+Z to redo')
test('does not intercept editable fields with an uncommitted value')
test('labels applied, undone, and discarded history entries')
```

- [x] **Step 2: Run tests and verify RED**

Run: `cd website && npx vitest run src/views/project/cad-document-history.test.ts`

Expected: failure because helper module does not exist.

- [x] **Step 3: Add server-backed controls**

Add compact shadcn `Button` controls with Lucide `Undo2`, `Redo2`, and `History` icons. Display a right-aligned popover with a paginated operation list, timestamps, target labels, current/undone/discarded status, and clear empty/loading/error states.

All CAD mutations send the query cache's current `revision`. On `409`, invalidate document and history queries and show `Document changed in another session. Latest version loaded.` Do not automatically replay stale mutations.

- [x] **Step 4: Serialize workbench history mutations**

Disable edit/undo/redo controls while a document mutation is pending. Commit one transform command after the 500ms debounce; keyboard Undo first cancels an uncommitted transform draft, otherwise calls the server.

- [x] **Step 5: Run frontend tests and verify GREEN**

Run: `cd website && npx vitest run src/views/project/cad-document-history.test.ts src/views/project/cad-document-cache.test.ts src/views/project/project-preview-assets.test.ts`

Expected: PASS.

---

### Task 5: Documentation and acceptance verification

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`
- Modify: `docs/superpowers/plans/2026-07-10-cad-history-undo-redo.md`

**Interfaces:**
- Produces: honest documentation of persisted History and current Undo/Redo boundaries.

- [x] **Step 1: Update capability documentation**

Document database-backed operation History, cross-browser Undo/Redo, concurrency conflicts, supported command types, and exclusions such as source upload/export history and general B-rep feature history.

- [x] **Step 2: Run complete repository verification**

Run: `task check`

Run: `task test`

Run: `cd website && npm run build`

Expected: all commands exit 0.

- [x] **Step 3: Run browser acceptance flow**

Use the real local app to create a project, upload a STEP source, perform transform and box-union edits, Undo, reload the route, Redo, and confirm History persists with no unexpected console errors.

- [x] **Step 4: Review the final diff**

Run: `git diff --check`

Run: `git status --short`

Confirm every changed behavior has a test and docs do not claim general CAD feature-history semantics.
