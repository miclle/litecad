# Multi-Model Project Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every parsed project model with a ready preview artifact in the project workbench canvas, instead of showing only the newest uploaded model.

**Architecture:** Keep the backend model and preview artifact contract unchanged because it already stores multiple project-owned sources and artifacts. Add small frontend derivation helpers, use React Query to fetch preview metadata and blobs for every parsed model, and render the resulting assets inside one Three.js scene group framed by the combined bounds.

**Tech Stack:** React 19, TypeScript 6, React Query v5, Three.js, Vite/Vitest, Go backend API.

## Global Constraints

- Start implementation or review work with `git status --short`.
- Frontend API calls go through `website/src/api/` and shared Axios client.
- Prefer existing project workbench layout, Tailwind styling, Lucide icons, and local Three.js helper patterns.
- Do not claim editable CAD geometry, true CAD merge, export, measurement, or full STEP B-rep semantics.
- Verify each phase in the in-app browser before updating product docs.
- Run `task check` before committing.
- Run `task test` because this changes non-trivial frontend interaction behavior.

---

### Task 1: Multi-Model Preview Asset Derivation

**Files:**
- Create: `website/src/views/project/project-preview-assets.ts`
- Create: `website/src/views/project/project-preview-assets.test.ts`
- Modify: `website/src/views/project/index.tsx`

**Interfaces:**
- Consumes: `ProjectModel[]`, `ProjectModelPreviewArtifact[]`, and per-model object URLs.
- Produces: `ProjectPreviewAsset[]` with `modelId`, `name`, `previewFormat`, and `previewUrl`.

- [x] **Step 1: Write the failing test**

Verify that two parsed models with two preview artifacts and two object URLs produce two preview assets in project model order.

- [x] **Step 2: Run test to verify it fails**

Run: `npm --prefix website test -- project-preview-assets.test.ts`
Expected: fail because `project-preview-assets` does not exist.

- [x] **Step 3: Implement minimal derivation helper**

Create a pure helper that filters to parsed models, matches artifacts by `model_id`, and keeps only models with a URL.

- [x] **Step 4: Run test and browser check**

Run: `npm --prefix website test -- project-preview-assets.test.ts`, then reload the current project page and confirm the UI still loads without console errors before product docs change.

### Task 2: Multi-Asset Three.js Scene Rendering

**Files:**
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: `website/src/views/project/index.tsx`

**Interfaces:**
- Consumes: `ProjectPreviewAsset[]`.
- Produces: one workbench scene that loads every preview asset into a single group, orients OBJ assets, styles each mesh, computes combined bounds, and frames the camera to all visible assets.

- [x] **Step 1: Write or extend tests around preview asset behavior**
- [x] **Step 2: Change `ModelPreview` props from one URL/format to an asset list**
- [x] **Step 3: Load OBJ/GLTF/GLB assets independently and add them to a shared group**
- [x] **Step 4: Browser verify current project shows both uploaded STEP-derived models**

### Task 3: Product Copy, Docs, Checks, Commit

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `.agents/rules/threejs-viewer.md`

**Interfaces:**
- Consumes: verified multi-model preview behavior.
- Produces: docs that honestly say LiteCAD supports multi-source project preview, while true CAD assembly placement and merge remain roadmap work.

- [x] **Step 1: Update workbench UI copy from single-source preview to multi-source preview**
- [x] **Step 2: Browser verify updated copy and two-model canvas**
- [x] **Step 3: Update docs after browser verification**
- [x] **Step 4: Run `task check`, `task test`, and `git diff --check`**
- [x] **Step 5: Commit with a repo-style Angular message**
