# Selected Model Transform Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move per-model transform editing out of the model tree and into a selected-model workflow with canvas selection, a DOCUMENT property inspector, and mouse-driven translate controls.

**Architecture:** Keep the backend CAD document API unchanged. `ProjectView` remains the owner of selected model state, transform drafts, and autosave; `ModelPreview` owns canvas picking and translate gizmo events; helper modules continue to own transform parsing and preview asset signatures.

**Tech Stack:** React 19, React Query, TypeScript, Three.js `Raycaster`, Three.js `TransformControls`, shadcn/base UI primitives, existing LiteCAD CAD document transform helpers.

## Global Constraints

- Keep the current `Handler -> Service -> Entity` backend layering untouched.
- Do not add FreeCAD, Python, or another desktop CAD runtime to preview or edit paths.
- STEP/STP geometry import/edit/export must stay behind the browser CAD kernel worker boundary.
- Do not imply durable B-rep feature history, durable cross-model assembly semantics, or full CAD boolean editing beyond the currently implemented constrained box-union feature.
- Every phase must update TODO/docs, run `task check`, run focused or full tests, and commit before the next phase begins.

---

### Task 1: Selected Model Inspector

**Files:**
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: `TODO.md`
- Modify: `docs/superpowers/plans/2026-07-08-selected-model-transform-controls.md`

**Interfaces:**
- Produces: `selectedModelID: string`, `onSelectModel(modelID: string)`, `onClearSelection()`, and `selectedModel` inspector UI in the left-panel DOCUMENT area.
- Consumes: existing `updateTransformDraft(modelID, axis, value)` autosave flow.

- [x] **Step 1: Document phased target**

Update this plan and `TODO.md` to record the selected model transform workflow.

- [x] **Step 2: Add selection state in ProjectView**

Add selected model state and derive `selectedModel`, `selectedModelDisplayName`, `selectedTransformDraft`, and error/status values.

- [x] **Step 3: Add model list selection affordance**

Make each model row selectable with `aria-selected`, visible selected styling, and click handling while preserving the visibility button.

- [x] **Step 4: Move transform controls into DOCUMENT inspector**

Remove inline position controls from model rows. Add a DOCUMENT inspector that shows either document summary or selected model details with Move position fields and STEP box feature controls.

- [x] **Step 5: Wire canvas selection prop**

Phase 1 keeps canvas selection for Task 2 and completes the list-driven selected-model inspector instead.

- [x] **Step 6: Verify and commit**

Run:

```bash
task check
task test
cd website && npm run build
```

Commit:

```bash
git add TODO.md docs/superpowers/plans/2026-07-08-selected-model-transform-controls.md website/src/views/project/index.tsx website/src/views/project/model-preview.tsx
git commit -m "feat(cad): add selected model inspector"
```

### Task 2: Canvas Selection And Translate Gizmo

**Files:**
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/src/views/project/model-preview*.test.ts` or add focused helper tests if transform math is extracted.
- Modify: `TODO.md`
- Modify: `docs/superpowers/plans/2026-07-08-selected-model-transform-controls.md`

**Interfaces:**
- Consumes: `selectedModelId`, `onSelectModel(modelID)`, `onClearSelection()`, and `onModelTranslationChange(modelID, translation)`.
- Produces: canvas click selection, selection highlight, and Three.js `TransformControls` translate drag events that update the same transform draft/autosave path as numeric inputs.

- [ ] **Step 1: Add raycast picking**

Use a canvas-local `Raycaster` against preview objects. Click selects the closest visible model object; clicking empty canvas clears selection.

- [ ] **Step 2: Add selected model highlight**

Apply a restrained selected-state visual treatment to the selected preview object without replacing source materials permanently.

- [ ] **Step 3: Add TransformControls translate mode**

Attach `TransformControls` to the selected preview object. Disable trackball controls while dragging, then re-enable them on drag end.

- [ ] **Step 4: Convert preview position back to CAD translation**

For CAD-oriented STEP/OBJ preview assets, convert preview-space deltas back to CAD `(x, y, z)` before calling the parent transform draft handler. Preserve direct Three.js coordinates for GLTF/GLB assets.

- [ ] **Step 5: Verify and commit**

Run:

```bash
task check
task test
cd website && npm run build
```

Commit:

```bash
git add TODO.md docs/superpowers/plans/2026-07-08-selected-model-transform-controls.md website/src/views/project/index.tsx website/src/views/project/model-preview.tsx website/src/views/project
git commit -m "feat(cad): add canvas translate controls"
```
