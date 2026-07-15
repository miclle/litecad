# True Chamfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LiteCAD Feature DSL's accepted-but-no-op `chamfer` modifier with a real OCCT all-edge chamfer that is consistent across browser preview, STEP export, Assistant generation, and saved `.lcad.json` models.

**Architecture:** Keep the existing DSL shape and backend validation contract: `chamfer` follows a prior accumulated solid and accepts one positive `distance`. Define v1 as a symmetric chamfer over every edge of that accumulated shape through `BRepFilletAPI_MakeChamfer.Add_2`; if there are no edges or OCCT cannot build the result, fail the feature explicitly instead of returning the unchanged shape. Preview and export already share `compileFeatureDSLShape`, so the implementation remains inside the worker compiler boundary.

**Tech Stack:** TypeScript 6, Vitest 4, Playwright 1.61, `replicad-opencascadejs` 0.23, Go 1.26, React 19, Three.js 0.185.

## Global Constraints

- Work directly on the synchronized `main` branch because the user explicitly required it.
- Use TDD: run every new behavior test red before production changes, then green after the minimal implementation.
- Keep `chamfer` backend validation and browser protocol unchanged: one positive `distance`, after a prior solid.
- Never silently preserve the source shape when a requested chamfer cannot be built.
- Keep OCCT mesh buffers as derived preview geometry; do not persist Three.js `BufferGeometry` or OCCT shape blobs.
- Run `task check`, `task test`, and `task test-browser` before commit.
- Verify the generated chamfer preview in the Codex in-app browser and inspect console errors.
- Review the complete uncommitted diff with the `code-reviewer` checklist, fix findings, refresh all shipped-truth docs, commit, and push before starting the next phase.

---

### Task 1: Prove The Current Chamfer Is A Geometry No-Op

**Files:**
- Modify: `website/src/cad/opencascade-step.test.ts`

**Interfaces:**
- Consumes: `runFeatureDSLPreviewWithKernel(openCascade, input)`.
- Produces: a regression assertion that a chamfered 10 mm box has more tessellated position data than the same unmodified box.

- [x] **Step 1: Add the focused regression test**

  Add this test beside the other Feature DSL OCCT tests:

  ```ts
  it('changes box geometry when applying a chamfer', async () => {
    const loadOpenCascade = createOpenCascadeLoader(
      initReplicadOpenCascade as unknown as Parameters<typeof createOpenCascadeLoader>[0],
      `${process.cwd()}/node_modules/replicad-opencascadejs/src/replicad_single.wasm`,
    )
    const openCascade = await loadOpenCascade()
    const baseDocument = {
      version: 1 as const,
      unit: 'millimetre' as const,
      features: [{ id: 'base', type: 'box' as const, origin: [0, 0, 0], size: [10, 10, 10] }],
    }
    const base = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'box.lcad.json',
      document: baseDocument,
      parameterValues: {},
    })
    const chamfered = await runFeatureDSLPreviewWithKernel(openCascade, {
      filename: 'chamfered-box.lcad.json',
      document: {
        ...baseDocument,
        features: [...baseDocument.features, { id: 'bevel', type: 'chamfer' as const, distance: 1 }],
      },
      parameterValues: {},
    })

    expect(chamfered.mesh.positions.length).toBeGreaterThan(base.mesh.positions.length)
    expect(Array.from(chamfered.mesh.positions)).not.toEqual(Array.from(base.mesh.positions))
  }, 30000)
  ```

- [x] **Step 2: Run the test red**

  Run: `cd website && npx vitest run src/cad/opencascade-step.test.ts -t 'changes box geometry when applying a chamfer'`

  Expected: fail because `applyFeatureDSLChamfer` returns the unchanged shape.

### Task 2: Build A Real Symmetric All-Edge Chamfer

**Files:**
- Modify: `website/src/cad/feature-dsl/compile-modifiers.ts`
- Test: `website/src/cad/opencascade-step.test.ts`

**Interfaces:**
- Consumes: an accumulated OCCT shape, resolved positive distance, and feature ID.
- Produces: a built OCCT shape with every discovered edge registered through `BRepFilletAPI_MakeChamfer.Add_2`.

- [x] **Step 1: Implement the minimal chamfer builder**

  Replace the no-op body after positive-distance validation with:

  ```ts
  const chamferBuilder = new openCascade.BRepFilletAPI_MakeChamfer(shape)
  let edgeCount = 0
  const explorer = new openCascade.TopExp_Explorer_1()
  for (
    explorer.Init(shape, openCascade.TopAbs_ShapeEnum.TopAbs_EDGE, openCascade.TopAbs_ShapeEnum.TopAbs_SHAPE);
    explorer.More();
    explorer.Next()
  ) {
    chamferBuilder.Add_2(distance, openCascade.TopoDS.Edge_1(explorer.Current()))
    edgeCount += 1
  }
  if (edgeCount === 0) {
    throw new Error(`Feature ${featureID} chamfer found no edges`)
  }
  chamferBuilder.Build(new openCascade.Message_ProgressRange_1())
  if (!chamferBuilder.IsDone()) {
    throw new Error(`Feature ${featureID} chamfer could not be built`)
  }
  return chamferBuilder.Shape()
  ```

- [x] **Step 2: Run the regression green**

  Run: `cd website && npx vitest run src/cad/opencascade-step.test.ts -t 'changes box geometry when applying a chamfer'`

  Expected: pass with one chamfered-box test.

- [x] **Step 3: Add and verify explicit failure coverage**

  Add a test using a 10 mm box and an impossible 20 mm chamfer. Assert `runFeatureDSLPreviewWithKernel` rejects with a message containing `Feature bevel (chamfer) failed` rather than returning a preview.

  Run the focused chamfer tests and confirm the new failure test passes.

- [x] **Step 4: Run the full kernel suite**

  Run: `cd website && npx vitest run src/cad/opencascade-step.test.ts src/cad/kernel-protocol.test.ts src/cad/feature-dsl/compile-feature.test.ts`

  Expected: all selected tests pass.

### Task 3: Align The Assistant Contract With Real Geometry

**Files:**
- Modify: `internal/service/ai_tools_test.go`
- Modify: `internal/service/ai_tools.go`
- Modify: `docs/ai-parametric-assistant.md`

**Interfaces:**
- Consumes: the existing backend-owned Feature DSL capability registry.
- Produces: provider guidance that describes `chamfer` as a symmetric modifier over all eligible edges and never calls it conservative.

- [x] **Step 1: Add the failing prompt-contract assertion**

  Extend the system-prompt test with:

  ```go
  if !strings.Contains(aiParametricSystemPrompt, "all eligible edges") {
      t.Fatalf("system prompt must describe true chamfer semantics")
  }
  if strings.Contains(aiParametricSystemPrompt, "conservative modifier") {
      t.Fatalf("system prompt must not describe chamfer as conservative")
  }
  ```

- [x] **Step 2: Run the prompt test red**

  Run: `go test ./internal/service -run 'TestAIParametricSystemPrompt'`

  Expected: fail because the current prompt still says conservative modifier.

- [x] **Step 3: Update the prompt and tool schema**

  Replace conservative wording in `aiParametricSystemPrompt` and the tool schema description with deterministic v1 semantics: `chamfer` applies one symmetric distance to all eligible edges of the accumulated shape and invalid geometry must fail.

- [x] **Step 4: Run the prompt test green**

  Run: `go test ./internal/service -run 'TestAIParametricSystemPrompt|TestAIParametricToolDefinition'`

  Expected: pass.

### Task 4: Add Browser E2E Coverage For Prompt-To-Chamfer Preview

**Files:**
- Modify: `website/e2e/fixtures/project-api.ts`
- Modify: `website/e2e/project-workbench-parametric.spec.ts`

**Interfaces:**
- Produces: `chamferedBoxFeatureDSLSource`, a box followed by a 1 mm `chamfer`.
- Consumes: the existing mock-provider, browser worker preview, save-as-model, and preview asset flow.

- [x] **Step 1: Add the E2E fixture**

  Export a deterministic source document with parameters `WIDTH`, `DEPTH`, `HEIGHT`, and `CHAMFER`, followed by `box` and `chamfer` features.

- [x] **Step 2: Add the Playwright workflow**

  Add a test that configures the fixture as `Chamfered box`, submits `Create a 40 by 24 by 12 millimeter box with a 1 millimeter chamfer`, waits for the saved `.lcad.json` model, verifies the parameter controls and one preview asset, verifies the worker source request count, opens STEP export, and asserts no captured browser errors.

- [x] **Step 3: Run the focused E2E test**

  Run: `cd website && npx playwright test e2e/project-workbench-parametric.spec.ts -g 'chamfered box'`

  Expected: pass.

### Task 5: In-App Browser Verification, Review, Docs, And Ship

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `docs/ai-parametric-assistant.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`
- Modify: `docs/current-work-handoff.md`
- Modify: this plan

**Interfaces:**
- Produces: shipped-truth documentation for real symmetric all-edge chamfer behavior and the remaining lack of stable user-selectable edge references.

- [x] **Step 1: Run automated phase gates**

  Run: `task check`

  Run: `task test`

  Run: `task test-browser`

  Expected: all commands exit 0.

- [x] **Step 2: Verify in the Codex in-app browser**

  Start the local LiteCAD development stack. In the in-app browser, sign in to the local app if needed, open a project containing the chamfered `.lcad.json` source, verify the bevel is visibly present in the canvas, open STEP export, and confirm there are no console errors or warnings attributable to the flow.

- [x] **Step 3: Review the code before documentation closeout**

  Read the full uncommitted diff and apply the `code-reviewer` checklist for compiler correctness, failure behavior, capability parity, test strength, and unrelated scope. Fix every actionable finding and rerun affected focused tests.

- [x] **Step 4: Refresh documentation**

  Replace `conservative chamfer` and `validates and preserves shape` claims with the exact shipped all-edge behavior. Remove robust true chamfer from `TODO.md`, retain stable edge-selection/topology references as future work, and update the handoff with the phase evidence.

- [x] **Step 5: Run final verification after docs and fixes**

  Run: `git diff --check`

  Run: `task check`

  Run: `task test`

  Run: `task test-browser`

  Expected: all commands exit 0 on the final diff.

- [x] **Step 6: Commit and push Phase 1**

  Commit message:

  ```text
  feat(cad): implement true feature dsl chamfer

  Replace the accepted no-op modifier with OCCT all-edge chamfer geometry across preview and export, and align the Assistant contract and browser coverage.
  ```

  Push `main` to `origin/main`, confirm both resolve to the same commit, then begin the durable Feature Graph phase.
