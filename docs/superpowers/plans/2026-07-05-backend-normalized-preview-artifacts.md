# Backend Normalized Preview Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move LiteCAD import preview toward a backend-owned CAD parsing pipeline where frontend only renders normalized Three.js-friendly preview artifacts.

**Architecture:** Backend accepts CAD source uploads, extracts source metadata, and creates versioned preview artifacts. Frontend consumes preview artifact metadata plus binary preview bytes; it must not parse STEP and should not make decisions from source-file format.

**Tech Stack:** Go 1.26, GORM, FreeCAD headless converter, React 19, TypeScript 6, Three.js.

## Global Constraints

- Start implementation or review work with `git status --short`.
- Follow `Handler -> Service -> Entity` layering.
- Do not expose GORM entities directly as HTTP response contracts.
- Frontend API calls go through `website/src/api/` and shared Axios client.
- Keep README, TODO, AGENTS.md, and `.agents/rules/` synchronized with current code.
- Run `task check` before committing.
- Run `task test` when changing behavior, API contracts, database models, or non-trivial frontend interactions.
- Each stage must be self-verified, documented, and committed before moving to the next stage.

---

### Task 1: Preview Artifact Contract Cleanup

**Files:**
- Modify: `internal/service/model_preview.go`
- Modify: `internal/service/model_preview_test.go`
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: `website/src/types/project.ts`
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `.agents/rules/threejs-viewer.md`

**Interfaces:**
- Consumes: `ProjectModelPreviewArtifact.Format`, `ProjectModelPreviewArtifact.ContentType`, `ProjectModelPreviewArtifact.GeneratorVersion`
- Produces: a code/documentation contract that preview artifacts are backend-generated viewer formats and source formats remain backend concerns.

- [x] **Step 1: Write failing tests**

Add service tests proving source-backed GLTF/GLB/STL preview artifacts are not considered normalized generated artifacts and are explicitly tagged as source passthrough fallback.

- [x] **Step 2: Run tests and verify failure**

Run `go test ./internal/service -run 'Test.*Preview'`.

- [x] **Step 3: Implement minimal backend contract changes**

Rename generator/version constants and helper names so source passthrough is explicit, while preserving current behavior until Task 2 replaces it.

- [x] **Step 4: Remove frontend source-format assumptions**

Ensure `ModelPreview` branches only on preview artifact format, not uploaded model format. Keep only viewer-format loaders that the backend contract exposes.

- [x] **Step 5: Update docs**

Document backend-owned parsing, current OBJ preview artifact fallback, and GLB normalization as the next implementation phase.

- [ ] **Step 6: Verify and commit**

Run `task check`, `task test`, `git diff --check`, then commit this stage.

### Task 2: Backend Canonical GLB Preview Artifact

**Files:**
- Modify: `scripts/freecad_step_to_obj.py` or replace with `scripts/freecad_step_to_preview.py`
- Modify: `internal/service/freecad_preview_converter.go`
- Modify: `internal/service/model_preview.go`
- Modify: `internal/service/model_preview_test.go`
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: docs updated in Task 1

**Interfaces:**
- Consumes: uploaded STEP source data and FreeCAD conversion entrypoint.
- Produces: canonical backend-generated preview artifact, preferably GLB, with OBJ only as a clearly documented fallback if FreeCAD GLB export is unavailable.

- [ ] **Step 1: Write failing converter/service tests**
- [ ] **Step 2: Verify failure**
- [ ] **Step 3: Implement FreeCAD GLB or deterministic fallback strategy**
- [ ] **Step 4: Verify sample STEP import with `/Users/miclle/github/miclle/Macintosh/exports/macintosh_ipad_lcd_case.step`**
- [ ] **Step 5: Update docs and commit**

### Task 3: Source Format Normalization for GLTF/GLB/STL Uploads

**Files:**
- Modify: `internal/service/model_preview.go`
- Modify: `internal/service/freecad_preview_converter.go`
- Modify: `internal/service/model_preview_test.go`
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: docs updated in earlier tasks

**Interfaces:**
- Consumes: GLTF/GLB/STL uploads.
- Produces: backend-generated normalized preview artifacts so the frontend does not load source uploads directly.

- [ ] **Step 1: Write failing tests for non-STEP preview normalization**
- [ ] **Step 2: Verify failure**
- [ ] **Step 3: Implement backend normalization or clear unsupported-preview errors**
- [ ] **Step 4: Remove frontend loaders made unnecessary by canonical preview format**
- [ ] **Step 5: Verify, update docs, and commit**

### Task 4: Geometry API Follow-Through

**Files:**
- Modify: `internal/service/geometry_document.go`
- Modify: `internal/service/project_test.go`
- Modify: `internal/handler/project_test.go`
- Modify: `website/src/api/projects.ts`
- Modify: docs updated in earlier tasks

**Interfaces:**
- Consumes: uploaded source models and preview artifacts.
- Produces: read-only geometry document shape that references normalized preview artifacts and is ready for editable geometry records later.

- [ ] **Step 1: Write failing geometry document tests**
- [ ] **Step 2: Verify failure**
- [ ] **Step 3: Implement contract cleanup**
- [ ] **Step 4: Verify API/frontend types**
- [ ] **Step 5: Update docs and commit**
