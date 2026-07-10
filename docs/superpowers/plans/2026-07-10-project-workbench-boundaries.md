# Project Workbench Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore clear ownership boundaries around the LiteCAD project workbench, protect its cross-cutting CAD interactions with integration and browser tests, and remove adjacent backend maintenance hotspots without changing the shipped CAD capability surface.

**Architecture:** Keep `ProjectView` as the route-level composition root. Move server-authoritative CAD command coordination into one React hook, move major workbench surfaces into controlled components, and split the Three.js preview into scene, resource, and selection/transform lifecycle hooks. Keep backend Handler -> Service -> Entity behavior unchanged while splitting project handlers and tests by domain.

**Tech Stack:** React 19, TypeScript 6, React Query 5, shadcn/ui, Three.js, Vitest, Playwright, Go 1.26, fox, GORM.

## Global Constraints

- Preserve every currently shipped workbench interaction and API contract.
- Do not add global client state, a new CAD architecture, durable B-rep state, or AI geometry mutation.
- `ProjectView` remains responsible for route composition, not command queues, autosave timers, or panel internals.
- CAD mutations remain serialized and use the latest cached `expected_revision`; HTTP `409` refreshes document and history state without overwriting server state.
- Use existing shadcn-compatible primitives and current visual language; this is a boundary refactor, not a redesign.
- Every phase updates the applicable docs, runs focused tests plus `task check`, and ends in one scoped commit.
- Behavior changes and non-trivial frontend interactions additionally run `task test`; browser-facing phases run the Playwright smoke suite.

---

### Task 1: CAD command boundary and integration protection

**Files:**
- Create: `website/src/views/project/use-cad-document-commands.ts`
- Test: `website/src/views/project/use-cad-document-commands.test.tsx`
- Create: `website/src/views/project/project-step-export-popover.tsx`
- Test: `website/src/views/project/project-step-export-popover.test.tsx`
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/package.json`
- Modify: `website/package-lock.json`
- Modify: `TODO.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`

**Interfaces:**
- Produces: `useCADDocumentCommands({ projectId })`.
- Produces: `scheduleTransformAutosave(nodeId, translation)`, `deleteNode(nodeId)`, `addBoxUnion(modelId, box)`, `changeHistory(action)`, and `cancelTransformAutosave(nodeId)`.
- Produces: command error state and `isPending` while owning the document/history query keys, command queue, latest transform request versions, autosave timers, and conflict refresh.
- Produces: controlled `ProjectStepExportPopover` whose failure state remains mounted and visible.

- [x] **Step 1: Add the React integration-test harness**

Add `@testing-library/react` and `@testing-library/user-event` as dev dependencies. Tests must mount real hooks/components inside `QueryClientProvider`; API modules may be mocked only at the HTTP boundary.

- [x] **Step 2: Write and run failing integration tests**

Cover these three behaviors:

```text
transform autosave receives HTTP 409 -> document and history queries invalidate,
the conflict callback opens durable feedback, and no stale cache write occurs

history mutation pending -> delete shortcut/action remains disabled until the
serialized command settles

STEP export rejection -> the controlled popover remains open and renders
"STEP export failed"
```

Run: `npm --prefix website test -- use-cad-document-commands project-step-export-popover`

Expected: FAIL because the hook and controlled export surface do not exist.

- [x] **Step 3: Implement the command hook and controlled export popover**

Move the queue, latest revision lookup, transform autosave timers, conflict invalidation, and mutation state out of `ProjectView`. Keep API calls in `website/src/api/projects.ts` and use the existing React Query client.

- [x] **Step 4: Verify behavior and update docs**

Run:

```bash
npm --prefix website test -- use-cad-document-commands project-step-export-popover
task check
task test
```

Update `TODO.md` and the browser-kernel roadmap to describe the new command ownership and remaining component work.

- [x] **Step 5: Commit**

Commit: `refactor(project): isolate cad document commands`

---

### Task 2: Controlled workbench surfaces

**Files:**
- Create: `website/src/views/project/project-history-popover.tsx`
- Test: `website/src/views/project/project-history-popover.test.tsx`
- Create: `website/src/views/project/project-assistant-panel.tsx`
- Test: `website/src/views/project/project-assistant-panel.test.tsx`
- Create: `website/src/views/project/project-model-tree.tsx`
- Test: `website/src/views/project/project-model-tree.test.tsx`
- Create: `website/src/views/project/project-inspector.tsx`
- Test: `website/src/views/project/project-inspector.test.tsx`
- Modify: `website/src/views/project/index.tsx`
- Modify: `TODO.md`
- Modify: `.agents/rules/litecad-architecture.md`

**Interfaces:**
- Produces controlled components with data and callbacks passed explicitly; none may fetch data or own project-level React Query state.
- `ProjectHistoryPopover` receives history entries, paging state, undo/redo capability, and action callbacks.
- `ProjectAssistantPanel` receives open/transition/resize state, messages, draft state, and submit/close callbacks.
- `ProjectModelTree` receives model groups, selection, visibility, loading state, and selection/visibility callbacks.
- `ProjectInspector` receives the selected node/model presentation model and edit/delete callbacks.

- [x] **Step 1: Write failing component interaction tests**

Verify History action disabling, Assistant submit/close behavior, tree source/child selection, visibility toggles, inspector transform edits, and delete action forwarding.

Run: `npm --prefix website test -- project-history-popover project-assistant-panel project-model-tree project-inspector`

Expected: FAIL because the controlled components do not exist.

- [x] **Step 2: Extract History and Assistant**

Move markup without changing copy, motion timing, accessibility labels, or shadcn primitive usage. `ProjectView` retains only the state required to compose the surfaces.

- [x] **Step 3: Extract Project Tree and Inspector**

Move the left-panel model tree and document inspector. Pass presentation data and stable callbacks; do not duplicate source/node ID derivation inside components.

- [x] **Step 4: Verify and update docs**

Run:

```bash
npm --prefix website test -- project-history-popover project-assistant-panel project-model-tree project-inspector
task check
task test
```

Update `TODO.md` and `.agents/rules/litecad-architecture.md` so new workbench responsibilities are added to the extracted surfaces, not to the route component.

- [ ] **Step 5: Commit**

Commit: `refactor(project): split workbench surfaces`

---

### Task 3: Three.js preview lifecycle hooks

**Files:**
- Create: `website/src/views/project/use-model-preview-scene.ts`
- Test: `website/src/views/project/use-model-preview-scene.test.ts`
- Create: `website/src/views/project/use-model-preview-resources.ts`
- Test: `website/src/views/project/use-model-preview-resources.test.ts`
- Create: `website/src/views/project/use-model-preview-selection.ts`
- Test: `website/src/views/project/use-model-preview-selection.test.ts`
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: `website/src/views/project/three-object-resources.ts`
- Modify: `TODO.md`
- Modify: `.agents/rules/threejs-viewer.md`

**Interfaces:**
- `useModelPreviewScene(containerRef, options)` owns renderer, scene, camera, controls, resize, animation frame, world grid, and disposal.
- `useModelPreviewResources(sceneRuntime, previewAssets)` owns loader cancellation, object maps, base transforms, resource replacement, and disposal.
- `useModelPreviewSelection(sceneRuntime, resourceRuntime, options)` owns raycasting, transform controls, selection synchronization, visibility, and draft/persisted translation synchronization.

- [ ] **Step 1: Write failing lifecycle tests**

Use lightweight fake runtime objects to verify one listener/animation lifecycle, cancellation during asset replacement, exactly-once resource disposal, selection clearing, and transform synchronization.

Run: `npm --prefix website test -- use-model-preview-scene use-model-preview-resources use-model-preview-selection`

Expected: FAIL because the hooks do not exist.

- [ ] **Step 2: Extract scene lifecycle**

Move renderer/camera/control creation and cleanup without changing camera defaults, pixel-ratio cap, resize-complete event, zoom behavior, or snapshot timing.

- [ ] **Step 3: Extract resource and selection lifecycles**

Move preview asset loading/replacement and node/model selection/transform synchronization behind explicit runtime handles. Reuse `disposeObject3DResources` and preserve existing orientation behavior.

- [ ] **Step 4: Verify and update docs**

Run:

```bash
npm --prefix website test -- use-model-preview-scene use-model-preview-resources use-model-preview-selection model-preview three-object-resources
task check
task test
```

Update `TODO.md` and `.agents/rules/threejs-viewer.md` with the new lifecycle ownership.

- [ ] **Step 5: Commit**

Commit: `refactor(cad): split preview lifecycles`

---

### Task 4: Supported Playwright workbench smoke suite

**Files:**
- Create: `website/playwright.config.ts`
- Create: `website/e2e/project-workbench.spec.ts`
- Modify: `website/package.json`
- Modify: `website/package-lock.json`
- Modify: `Taskfile.yml`
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces: `npm --prefix website run test:e2e`.
- Produces: `task test-browser`.
- Uses Playwright route interception for deterministic owner-scoped project, empty model, CAD document, history, and Agent responses while exercising the real built React route.

- [ ] **Step 1: Add Playwright and write the failing smoke test**

The test navigates directly to `/projects/project_smoke`, waits for the workbench, opens History and Assistant, checks durable feedback surfaces, closes Assistant, and asserts there are no unexpected page errors or console errors.

Run: `npm --prefix website run test:e2e`

Expected: FAIL because the runner/configuration is absent before implementation, then fail until all route fixtures are complete.

- [ ] **Step 2: Add deterministic fixtures and supported commands**

Configure Chromium, the Vite dev server, trace/screenshot retention on failure, and one worker for deterministic local execution. Add the task runner entry without adding browser download to `task install`.

- [ ] **Step 3: Verify and update docs**

Run:

```bash
npm --prefix website run test:e2e
task check
task test
```

Document browser installation and the smoke command in README and AGENTS. Remove the completed Playwright TODO while leaving broader real-model E2E coverage as future work.

- [ ] **Step 4: Commit**

Commit: `test(project): add workbench browser smoke`

---

### Task 5: Project handler and Go test boundaries

**Files:**
- Create: `internal/handler/project_types.go`
- Create: `internal/handler/project_models.go`
- Create: `internal/handler/project_cad.go`
- Create: `internal/handler/project_agent.go`
- Create: `internal/handler/project_errors.go`
- Modify: `internal/handler/project.go`
- Create: `internal/handler/project_models_test.go`
- Create: `internal/handler/project_cad_test.go`
- Create: `internal/handler/project_agent_test.go`
- Modify: `internal/handler/project_test.go`
- Create: `internal/service/cad_document_nodes_test.go`
- Create: `internal/service/cad_document_features_test.go`
- Modify: `internal/service/cad_document_test.go`
- Modify: `TODO.md`
- Modify: `.agents/rules/litecad-architecture.md`

**Interfaces:**
- Preserve all existing `Ctrl` method names and routes.
- Preserve request/response DTO JSON shapes and `mapProjectError` behavior.
- Keep shared handler test setup in `project_test.go`; split tests by project, models, CAD/history, and Agent domains.
- Split CAD document service tests by document synchronization, node mutation, and box feature behavior without changing package or fixtures.

- [ ] **Step 1: Capture the current handler test inventory**

Run: `go test -tags development ./internal/handler ./internal/service -count=1`

Expected: PASS before the mechanical split.

- [ ] **Step 2: Split production handlers by domain**

Move declarations without changing function bodies, route registration, errors, or imports beyond what compilation requires.

- [ ] **Step 3: Split the large handler and service test files**

Move complete tests and helpers; do not rename tests or weaken assertions.

- [ ] **Step 4: Verify and update docs**

Run:

```bash
go test -tags development ./internal/handler ./internal/service -count=1
task check
task test
```

Update `TODO.md` and `.agents/rules/litecad-architecture.md` with the concrete handler file boundaries.

- [ ] **Step 5: Commit**

Commit: `refactor(projects): split handler domains`

---

### Task 6: Remove the unused legacy HTTP error package

**Files:**
- Delete: `internal/errors/errors.go`
- Delete: `internal/errors/errors_test.go`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`

**Interfaces:**
- `pkg/httperr` remains the application HTTP-status-aware error package.
- `github.com/fox-gonic/fox/httperrors` remains the framework-level SPA/API NotFound response used by website asset handlers.

- [ ] **Step 1: Prove the legacy package is unused**

Run: `rg 'github.com/miclle/litecad/internal/errors' --glob '*.go'`

Expected: no imports.

- [ ] **Step 2: Delete the package and update docs**

Remove the package, remove the resolved TODO decision, and state the `pkg/httperr` ownership boundary in AGENTS and architecture rules.

- [ ] **Step 3: Verify**

Run:

```bash
rg 'github.com/miclle/litecad/internal/errors' --glob '*.go'
task check
task test
```

Expected: no imports and all checks pass.

- [ ] **Step 4: Commit**

Commit: `refactor(errors): remove legacy status package`

---

### Task 7: Final acceptance and documentation audit

**Files:**
- Modify as required: `README.md`, `TODO.md`, `AGENTS.md`, `docs/browser-cad-kernel-roadmap.md`, `.agents/rules/litecad-architecture.md`, `.agents/rules/threejs-viewer.md`

- [ ] **Step 1: Re-run every supported gate**

Run:

```bash
task check
task test
task test-browser
npm --prefix website run build
git diff --check main...HEAD
```

- [ ] **Step 2: Audit boundaries and documentation**

Confirm `ProjectView`, `ModelPreview`, project handlers, and large Go tests are smaller and that docs describe only behavior present at HEAD. Confirm no product-capability claims were added.

- [ ] **Step 3: Record final plan status**

Mark every completed checkbox in this plan and create a final docs-only commit only if the acceptance audit changes documentation.
