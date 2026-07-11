# AI Parametric Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build LiteCAD's AI Assistant into a project-scoped, multi-session text-to-CAD workflow that can generate, preview, save, and edit parameterized models, with imported STEP remaining one supported source path rather than the only way to create geometry.

**Architecture:** Add parameterized model sources as first-class project assets beside uploaded STEP/GLB/GLTF/STL sources. The first shippable path uses an OpenSCAD-style artifact because it gives LiteCAD a fast text-to-parametric-CAD loop: Assistant tool call -> source code artifact -> browser worker compile -> mesh preview -> parameter extraction -> saved project model. Keep the later OCCT/B-rep feature-DSL path explicit, but do not block the OpenSCAD MVP on durable kernel shape state.

**Tech Stack:** Go 1.26, fox, GORM, PostgreSQL/MySQL, React 19, TypeScript 6, Vite 8, React Query 5, Three.js, shadcn/ui, Lucide React, AI provider via OpenAI-compatible chat completions first, browser Web Workers for CAD compilation and preview, Vitest, Go tests, Playwright smoke tests.

## Global Constraints

- Do not copy CADAM source code into LiteCAD; use CADAM only as a reference for product flow and implementation boundaries.
- Before bundling OpenSCAD WASM, BOSL/BOSL2, MCAD, or any generated asset pipeline dependency, record the license decision in the implementation commit and avoid introducing a distribution conflict with LiteCAD's MIT license.
- Preserve the existing single-binary deployment shape: the Go backend embeds frontend build output, and browser workers/WASM assets must work through Vite build and `website/assets_production.go`.
- Imported STEP remains a valid project source, but AI-generated parameterized models must also be stored as project-owned source assets.
- The current CAD Agent is advisory until this plan implements structured tool calls, design artifacts, and explicit apply/save flows.
- Multi-session Assistant conversations are mandatory so long chats do not pollute future model-generation context.
- Generated models must be previewed and saved as durable project assets before product copy claims they are part of the project.
- Parameter edits must be local-previewable, persistable, and reloadable without requiring another model call.
- User-visible browser changes require `task test-browser` or a documented Playwright-equivalent rendered verification.
- Every phase runs focused tests plus `task check`; behavior/API/database phases also run `task test`.
- Keep shipped facts in README/docs and unfinished work in `TODO.md`; do not move roadmap claims into product language until the code and tests exist.

---

## Product Direction

The desired user loop is:

```text
Project -> Assistant session -> New chat -> "Make a parametric clamp..."
  -> model calls build_parametric_model
  -> browser compiles source
  -> workbench shows preview and editable parameters
  -> user saves generated source as a project model
  -> user can edit parameters later without reusing the old chat context
```

Imported CAD follows a parallel loop:

```text
Project -> upload STEP/GLB/GLTF/STL
  -> source is stored as a project model
  -> workbench previews it with the appropriate source pipeline
  -> Assistant can discuss or later propose edits using explicit tools
```

These loops share the project model tree, preview surface, thumbnail snapshots, and eventual export UX. They do not require every source type to share the same CAD kernel representation in the first milestone.

## Reference Analysis

CADAM's most useful pattern is not its storage stack or its whole frontend. The useful pattern is its constrained generation loop:

- The model is instructed to call a CAD build tool rather than paste source code into a normal reply.
- The tool input is a complete artifact with title, version, and OpenSCAD code.
- The browser compiles the artifact and returns compile status plus a multi-view inspection preview.
- The model can iterate after compile or visual failure before producing the final user-facing answer.
- Parameters are represented directly in source with Customizer-style comments and parsed into UI controls.

LiteCAD should adapt that pattern to its own architecture:

- The backend remains Go and owner-scoped.
- Project assets live in LiteCAD's project model tables and storage, not a separate Supabase-style conversation store.
- The workbench remains the project route composition root.
- React Query owns server state.
- The browser preview path uses workers so OpenSCAD/OCCT CPU work does not block React.
- The existing STEP OCCT pipeline remains intact and separate from the new OpenSCAD compile pipeline.

## Target Data Model

Add conversation and parameterized artifact concepts without collapsing them into the existing advisory `project_agent_messages` table.

```text
project_agent_conversations
  id
  project_id
  title
  active_model_id
  archived_at
  created_at
  updated_at

project_agent_messages
  id
  conversation_id
  role
  parts_json
  created_at
  updated_at

project_parametric_artifacts
  id
  project_id
  conversation_id
  message_id
  title
  source_kind        // "openscad" for the MVP
  source_code
  parameter_values_json
  compile_status
  compile_error
  preview_model_id
  created_at
  updated_at
```

Then extend project models so an AI-generated parameterized source can become a normal project asset.

```text
project_models
  format includes "scad"
  original_filename can be generated from artifact title
  metadata_json includes source_kind, parameter_count, compile mesh summary
  storage bytes contain source_code or a source package
```

The exact database representation may use existing `ProjectModel` storage for final saved source bytes and a separate artifact table for draft/chat state. The important split is:

- Conversation: creative process and model context.
- Artifact draft: generated source and compile feedback before save.
- Project model: durable project-owned asset after save.

## Assistant Context Rules

Each Assistant request must build context from a small, explicit set:

- Current project name and description.
- Current selected model summary if any.
- Saved parametric source summary if the user is editing a generated model.
- Recent messages from the selected conversation only.
- The latest artifact source if the user asks to edit that artifact.

New conversations must not include old chat transcript text by default. They may reference saved project assets through metadata and source summaries because assets are project state, not chat memory.

---

### Task 1: License and dependency decision record

**Files:**
- Create: `docs/ai-parametric-assistant.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`

**Interfaces:**
- Produces: a durable architecture and licensing decision section named `Dependency Decision`.
- Produces: a plan entry in `TODO.md` linking to this implementation plan and the product design document.
- Produces: an agent rule that generated parametric models are roadmap work until implemented and that CADAM code must not be copied.

- [x] **Step 1: Write the product design document**

Create `docs/ai-parametric-assistant.md` with these sections:

```markdown
# AI Parametric Assistant

LiteCAD's AI Assistant target is text-to-parameterized-CAD: users can start a project-scoped Assistant session, generate a parameterized model from text, preview it in the browser, edit exposed parameters, and save the result as a project-owned model source.

## Current Status

The current CAD Agent is advisory. It stores project-scoped messages and can include project/source metadata in provider context, but it does not yet create parametric artifacts, execute CAD tools, compile generated source, or save generated models.

## Source Model Direction

Imported STEP, GLB, GLTF, and STL files are source assets. AI-generated parameterized models are also source assets. The first generated-source kind is OpenSCAD-style source because it supports a fast browser compile and parameter extraction loop.

## Dependency Decision

Implementation must not copy CADAM code. Before bundling OpenSCAD WASM or library archives, record the chosen upstream package, license, asset size, and production-serving path. If the license review blocks bundling, implement the LiteCAD feature DSL path first instead of shipping copied or incompatible artifacts.

## Assistant Sessions

Each project can own multiple Assistant conversations. New conversations start with project/model context only, not old chat transcript text. Saved project assets remain available to later conversations through project metadata and source summaries.

## MVP Workflow

1. Create or select an Assistant conversation.
2. Send a text prompt.
3. The model calls `build_parametric_model`.
4. The browser compiles the returned source in a worker.
5. LiteCAD shows preview, compile status, and parameters.
6. The user saves the artifact as a project model.
7. Parameter edits recompile locally and persist without another model call.
```

- [x] **Step 2: Add the roadmap pointer**

Modify `TODO.md` under `Product Capability` by replacing the current broad CAD Agent bullet with:

```markdown
- Build the AI Parametric Assistant described in [docs/ai-parametric-assistant.md](docs/ai-parametric-assistant.md) and [docs/superpowers/plans/2026-07-11-ai-parametric-assistant.md](docs/superpowers/plans/2026-07-11-ai-parametric-assistant.md): project-scoped Assistant conversations, structured tool calls, generated OpenSCAD-style parametric artifacts, browser compile/preview, parameter editing, saved generated model sources, and later LiteCAD-native OCCT feature DSL support. The current CAD Agent remains advisory until those end-to-end flows ship.
```

- [x] **Step 3: Update agent guidance**

Add this product boundary to `AGENTS.md` and `.agents/rules/litecad-architecture.md`:

```markdown
- AI-generated parameterized CAD is planned but not shipped until LiteCAD has structured tool calls, generated source artifacts, browser compilation, parameter editing, and save-as-project-model persistence. Do not copy CADAM code; use it only as product-flow reference.
```

- [x] **Step 4: Verify documentation links**

Run:

```bash
git diff --check
rg -n "ai-parametric-assistant|AI Parametric Assistant|CADAM" README.md TODO.md AGENTS.md docs .agents/rules
```

Expected:

- `git diff --check` exits 0.
- `rg` shows the new design document, roadmap pointer, and agent boundary.
- No wording claims the feature is already shipped.

- [x] **Step 5: Commit**

```bash
git add docs/ai-parametric-assistant.md TODO.md AGENTS.md .agents/rules/litecad-architecture.md
git commit -m "docs(ai): plan parametric assistant"
```

---

### Task 2: Multi-session Assistant persistence

**Files:**
- Modify: `internal/entity/entity.go`
- Modify: `internal/database/database.go`
- Modify: `internal/service/ai.go`
- Test: `internal/service/ai_test.go`
- Modify: `internal/handler/project_agent.go`
- Test: `internal/handler/project_agent_test.go`
- Modify: `website/src/types/project.ts`
- Modify: `website/src/api/projects.ts`
- Modify: `website/src/views/project/index.tsx`

**Decision:** LiteCAD is not in production, so this phase does not keep old `/agent/messages` compatibility routes and does not include legacy message migration. New messages require a `conversation_id`.

**Interfaces:**
- Produces: `ProjectAgentConversation`.
- Produces: `ListProjectAgentConversations(ctx, ownerUserID, projectID string)`.
- Produces: `CreateProjectAgentConversation(ctx, input CreateProjectAgentConversationInput)`.
- Produces: `ListProjectAgentMessages(ctx, ownerUserID, projectID, conversationID string)`.
- Produces: `SendProjectAgentMessage(ctx, input ProjectAgentMessageInput)` with `ConversationID`.
- Produces routes:
  - `GET /api/v1/projects/:projectID/agent/conversations`
  - `POST /api/v1/projects/:projectID/agent/conversations`
  - `GET /api/v1/projects/:projectID/agent/conversations/:conversationID/messages`
  - `POST /api/v1/projects/:projectID/agent/conversations/:conversationID/messages`

- [x] **Step 1: Write failing service tests**

Add tests that assert:

```go
func TestProjectAgentConversationsAreProjectScoped(t *testing.T) {
    // user A creates project A conversation
    // user B cannot list or send messages to it
    // expected error: ErrProjectNotFound
}

func TestNewProjectAgentConversationStartsWithoutOldMessages(t *testing.T) {
    // create project
    // create conversation one and store user/assistant pair
    // create conversation two
    // send first message in conversation two
    // fake AI client should receive system context plus only conversation two user message
}
```

Run:

```bash
go test ./internal/service -run 'TestProjectAgentConversation'
```

Expected: FAIL because conversation entities and APIs do not exist.

- [x] **Step 2: Add entities and migration**

Create `entity.ProjectAgentConversation`:

```go
type ProjectAgentConversation struct {
    ID            string     `gorm:"primaryKey;type:varchar(64)"`
    ProjectID     string     `gorm:"not null;index;type:varchar(64)"`
    Title         string     `gorm:"not null;type:varchar(160)"`
    ActiveModelID string     `gorm:"type:varchar(64)"`
    ArchivedAt    *time.Time `gorm:"index"`
    CreatedAt     time.Time
    UpdatedAt     time.Time
}
```

Add required `ConversationID string` to `ProjectAgentMessage` and index it. Migrate both tables in the existing database migration path.

- [x] **Step 3: Add service methods**

Add explicit inputs:

```go
type CreateProjectAgentConversationInput struct {
    OwnerUserID string
    ProjectID   string
    Title       string
}

type ProjectAgentMessageInput struct {
    OwnerUserID    string
    ProjectID      string
    ConversationID string
    Messages       []AIChatMessage
}
```

`SendProjectAgentMessage` must load conversation by `id + project_id` after loading the owner-scoped project. It must call `listRecentProjectAgentMessages(ctx, project.ID, conversation.ID, maxAIChatMessages)`, not all messages for the project.

- [x] **Step 4: Add handler routes and DTOs**

Register routes in `internal/handler/handler.go`. Keep request/response DTOs named and exported only where already local patterns require it. Return `404` through existing `projectError` for cross-project/cross-owner conversation access. Remove old project-level `/agent/messages` routes.

- [x] **Step 5: Add frontend API types**

Add:

```ts
export interface ProjectAgentConversation {
  id: string
  project_id: string
  title: string
  active_model_id: string
  archived_at?: string
  created_at: string
  updated_at: string
}

export interface ProjectAgentConversationsResponse {
  conversations: ProjectAgentConversation[]
}
```

Add API functions:

```ts
export function fetchProjectAgentConversations(projectId: string)
export function createProjectAgentConversation(projectId: string, payload: { title?: string })
export function fetchProjectAgentConversationMessages(projectId: string, conversationId: string)
export function sendProjectAgentConversationMessage(projectId: string, conversationId: string, payload: SendProjectAgentMessagePayload)
```

The current project view now uses the conversation API by fetching conversations, creating an initial conversation on first send, and loading messages for the selected conversation.

- [x] **Step 6: Verify**

Run:

```bash
go test ./internal/service -run 'TestProjectAgentConversation|TestProjectAgentMessage'
go test ./internal/handler -run 'TestProjectAgent'
npm --prefix website test -- projects
task check
task test
```

Expected:

- Service tests prove conversation isolation.
- Handler tests prove owner scoping and route behavior.
- Frontend API type tests compile.
- `task check` and `task test` pass.

Verification results:

- `go test ./internal/service -run 'TestProjectAgentConversation|TestProjectAgentMessage'` passed.
- `go test ./internal/handler -run 'TestProjectAgent'` passed.
- `npm --prefix website test -- projects` passed.
- `task check` passed.
- `task test` passed.
- `task test-browser` passed after updating the deterministic workbench fixture to the new conversation endpoint.

- [x] **Step 7: Commit**

```bash
git add internal/entity internal/database internal/service internal/handler website/src/types/project.ts website/src/api/projects.ts
git commit -m "feat(ai): add assistant conversations"
```

Committed and pushed as `39b01ed`.

---

### Task 3: Assistant conversation UI

**Files:**
- Modify: `website/src/views/project/project-assistant-panel.tsx`
- Test: `website/src/views/project/project-assistant-panel.test.tsx`
- Modify: `website/src/views/project/index.tsx`
- Test: `website/src/views/project/index.test.tsx`
- Modify: `website/src/api/projects.ts`

**Interfaces:**
- Produces UI actions: `New chat`, conversation selector, conversation title display, archived-state filtering if archive is implemented in the same task.
- Consumes Task 2 API functions.
- Preserves the accepted main-level two-column Assistant layout.

- [x] **Step 1: Write failing UI tests**

Add tests:

```tsx
it('creates a new Assistant conversation and clears the draft transcript', async () => {
  // render ProjectAssistantPanel with two conversations and one active message list
  // click New chat
  // expect onCreateConversation called
  // expect selected conversation changes through callback
})

it('does not send messages when no conversation is selected', async () => {
  // render with empty conversations
  // expect Send Assistant message disabled until a conversation exists
})
```

Run:

```bash
npm --prefix website test -- project-assistant-panel
```

Expected: FAIL because the component has no conversation controls.

- [x] **Step 2: Add controlled props**

Extend `ProjectAssistantPanelProps`:

```ts
type AssistantConversationSummary = {
  id: string
  title: string
  updated_at: string
}

type ProjectAssistantPanelProps = {
  conversations: AssistantConversationSummary[]
  activeConversationId?: string
  onCreateConversation: () => void
  onSelectConversation: (conversationId: string) => void
  // existing props remain
}
```

Use shadcn-compatible button/menu patterns and Lucide icons. Keep the panel width and resize behavior unchanged.

- [x] **Step 3: Wire ProjectView state**

In `ProjectView`, fetch conversations when the Assistant is opened. If there are no conversations, require `New chat` before sending and create the conversation from that action. Use React Query keys:

```ts
['project-agent-conversations', projectId]
['project-agent-messages', projectId, conversationId]
```

Messages shown in the panel must come from the active conversation only.

- [x] **Step 4: Verify**

Run:

```bash
npm --prefix website test -- project-assistant-panel
npm --prefix website test -- index
task check
task test
```

Expected:

- The Assistant panel still submits and closes.
- New chat can be created without retaining old messages in the active panel.
- No layout regression in existing workbench tests.

Verification results:

- `npm --prefix website test -- project-assistant-panel` passed.
- `npm --prefix website test -- index` passed.
- `npm --prefix website test -- projects` passed.
- `task check` passed.
- `task test` passed.

- [x] **Step 5: Browser verification**

Run:

```bash
task test-browser
```

Expected:

- The deterministic smoke opens the project workbench, opens Assistant, creates or selects a conversation, sends a message through mocked owner-scoped APIs, closes Assistant, and sees no unexpected console/page errors.

Verification result:

- `task test-browser` passed with a stateful mocked conversation/message API.

- [x] **Step 6: Commit**

```bash
git add website/src/views/project website/src/api/projects.ts
git commit -m "feat(projects): add assistant conversations UI"
```

---

### Task 4: Parametric artifact schema and storage

**Files:**
- Modify: `internal/entity/entity.go`
- Modify: `internal/database/database.go`
- Create: `internal/service/parametric_artifact.go`
- Test: `internal/service/parametric_artifact_test.go`
- Create: `internal/handler/project_parametric.go`
- Test: `internal/handler/project_parametric_test.go`
- Modify: `internal/handler/handler.go`
- Modify: `website/src/types/project.ts`
- Modify: `website/src/api/projects.ts`

**Interfaces:**
- Produces `ProjectParametricArtifact`.
- Produces routes:
  - `GET /api/v1/projects/:projectID/parametric-artifacts`
  - `GET /api/v1/projects/:projectID/parametric-artifacts/:artifactID`
  - `POST /api/v1/projects/:projectID/parametric-artifacts`
  - `PATCH /api/v1/projects/:projectID/parametric-artifacts/:artifactID`
- Produces draft artifact fields: title, source_kind, source_code, parameter_values, compile_status, compile_error.

- [x] **Step 1: Write failing service tests**

Test:

```go
func TestCreateProjectParametricArtifactScopesToOwner(t *testing.T) {
    // user A can create artifact in project A
    // user B cannot fetch artifact A
}

func TestProjectParametricArtifactRejectsInvalidSource(t *testing.T) {
    // source_kind must be "openscad"
    // source_code must be non-empty and bounded, for example <= 256 KiB
}
```

Run:

```bash
go test ./internal/service -run 'TestProjectParametricArtifact'
```

Expected: FAIL because artifact service does not exist.

- [x] **Step 2: Add entity and validation**

Entity:

```go
type ProjectParametricArtifact struct {
    ID                  string          `gorm:"primaryKey;type:varchar(64)"`
    ProjectID           string          `gorm:"not null;index;type:varchar(64)"`
    ConversationID      string          `gorm:"type:varchar(64);index"`
    MessageID           string          `gorm:"type:varchar(64);index"`
    Title               string          `gorm:"not null;type:varchar(160)"`
    SourceKind          string          `gorm:"not null;type:varchar(32)"`
    SourceCode          string          `gorm:"not null"`
    ParameterValuesJSON json.RawMessage `gorm:"type:json"`
    CompileStatus       string          `gorm:"not null;type:varchar(32)"`
    CompileError        string          `gorm:"not null"`
    PreviewModelID      string          `gorm:"type:varchar(64)"`
    CreatedAt           time.Time
    UpdatedAt           time.Time
}
```

Validation:

- `SourceKind == "openscad"`.
- `Title` trimmed, non-empty, max 160 runes.
- `SourceCode` trimmed, non-empty, max 256 KiB for the first milestone.
- `CompileStatus` one of `pending`, `success`, `error`.
- `ParameterValuesJSON` must decode to an object when present.

- [x] **Step 3: Add handlers and frontend API**

DTO:

```ts
export interface ProjectParametricArtifact {
  id: string
  project_id: string
  conversation_id: string
  message_id: string
  title: string
  source_kind: 'openscad'
  source_code: string
  parameter_values: Record<string, unknown>
  compile_status: 'pending' | 'success' | 'error'
  compile_error: string
  preview_model_id: string
  created_at: string
  updated_at: string
}
```

- [x] **Step 4: Verify**

Run:

```bash
go test ./internal/service -run 'TestProjectParametricArtifact'
go test ./internal/handler -run 'TestProjectParametricArtifact'
npm --prefix website test -- projects
task check
task test
```

Expected:

- Owner scoping passes.
- Invalid source is rejected.
- Frontend types compile through `task check`.

Verification results:

- `go test ./internal/service -run 'TestProjectParametricArtifact'` passed.
- `go test ./internal/handler -run 'TestProjectParametricArtifact'` passed.
- `go test ./internal/database -run 'TestMigrateCreatesUserTable'` passed.
- `npm --prefix website test -- projects` passed.
- `task check` passed.
- `task test` passed.

- [x] **Step 5: Commit**

```bash
git add internal/entity internal/database internal/service internal/handler website/src/types/project.ts website/src/api/projects.ts
git commit -m "feat(projects): persist parametric artifacts"
```

---

### Task 5: OpenSCAD worker feasibility and parameter parser

**Files:**
- Create: `website/src/cad/openscad-protocol.ts`
- Create: `website/src/cad/openscad-worker-handler.ts`
- Create: `website/src/cad/openscad.worker.ts`
- Create: `website/src/cad/openscad-client.ts`
- Create: `website/src/cad/openscad-parameters.ts`
- Test: `website/src/cad/openscad-protocol.test.ts`
- Test: `website/src/cad/openscad-parameters.test.ts`
- Modify: `website/package.json`
- Modify: `website/package-lock.json`
- Modify: `docs/ai-parametric-assistant.md`

**Interfaces:**
- Produces `compileOpenSCADInWorker({ code, parameterValues })`.
- Produces `parseOpenSCADParameters(code): OpenSCADParameter[]`.
- Produces worker result with STL/OFF bytes or mesh buffers, compile duration, stderr/stdout, and parameter metadata.

- [x] **Step 1: Write failing protocol and parser tests**

Parser cases:

```ts
width = 50;        // [10:1:200]
style = "round";   // [round, square, hex]
enabled = true;
body_color = "SteelBlue";
/* [Mount] */
hole_diameter = 5; // [1:0.5:12]
```

Expected parsed output:

```ts
[
  { name: 'width', type: 'number', value: 50, range: { min: 10, step: 1, max: 200 }, group: '' },
  { name: 'style', type: 'string', value: 'round', options: ['round', 'square', 'hex'], group: '' },
  { name: 'enabled', type: 'boolean', value: true, group: '' },
  { name: 'body_color', type: 'color', value: 'SteelBlue', group: '' },
  { name: 'hole_diameter', type: 'number', value: 5, range: { min: 1, step: 0.5, max: 12 }, group: 'Mount' },
]
```

Run:

```bash
npm --prefix website test -- openscad-protocol openscad-parameters
```

Expected: FAIL because files do not exist.

- [x] **Step 2: Add protocol without WASM dependency**

Define:

```ts
export type OpenSCADCompileRequest = {
  id: string
  type: 'openscad-compile'
  payload: {
    code: string
    parameterValues?: Record<string, string | number | boolean>
    output?: 'preview'
  }
}
```

Add runtime validators like the existing CAD kernel protocol. Keep this testable without loading WASM.

- [x] **Step 3: Add parameter parser**

Implement a conservative parser for top-of-file assignments before the first `module` or `function`. Do not parse executable OpenSCAD generally. Reject multiline values in the first milestone. Treat `*_color` string parameters as color controls.

- [ ] **Step 4: Add worker loader behind license gate**

Status: deferred. Initial package review found GPL-licensed OpenSCAD WASM candidates (`openscad-wasm` is GPL-2.0; `@bascanada/openscad-compiler` is GPL-3.0-only), so this phase adds the worker/client shape and structured unavailable error only. A later phase must either deliberately accept a compatible distribution model or switch to the LiteCAD-native feature DSL path.

After dependency decision is recorded, add the chosen OpenSCAD WASM dependency or vendored asset path. The worker must:

- Instantiate OpenSCAD in a Web Worker.
- Write `/input.scad`.
- Compile preview output.
- Return structured compile errors instead of throwing raw provider or WASM internals into UI.
- Clean up virtual files between runs.

- [x] **Step 5: Verify**

Run:

```bash
npm --prefix website test -- openscad-protocol openscad-parameters
npm --prefix website run build
git diff --check
```

Expected:

- Protocol and parser tests pass.
- Vite build succeeds. It does not emit OpenSCAD WASM assets until Step 4 selects a dependency.
- `docs/ai-parametric-assistant.md` records that no OpenSCAD dependency is bundled yet and that license, size, and production path remain unset.

Partial verification results:

- `npm --prefix website test -- openscad-protocol openscad-parameters` passed.
- `npm --prefix website run build` passed.
- `task check` passed.
- `task test` passed.

- [ ] **Step 6: Browser smoke**

Create a temporary dev-only smoke page or a Playwright test fixture that compiles:

```scad
width = 20; // [5:1:80]
height = 10; // [5:1:80]
depth = 12; // [5:1:80]
cube([width, depth, height], center = true);
```

Expected:

- Compile status success.
- Mesh or STL bytes are non-empty.
- Parameter parser returns three number controls.
- Recompile with `width = 40` changes the mesh bounds or output bytes.

- [ ] **Step 7: Commit**

```bash
git add website/src/cad website/package.json website/package-lock.json docs/ai-parametric-assistant.md
git commit -m "feat(cad): add openscad worker foundation"
```

---

### Task 6: Structured Assistant tool calls for parametric artifacts

**Files:**
- Modify: `internal/service/ai.go`
- Create: `internal/service/ai_tools.go`
- Test: `internal/service/ai_tools_test.go`
- Modify: `internal/handler/project_agent.go`
- Modify: `website/src/types/project.ts`
- Modify: `website/src/api/projects.ts`

**Interfaces:**
- Produces tool schema `build_parametric_model`.
- Produces assistant message parts that can represent text, tool input, tool output, and artifact references.
- Keeps OpenAI-compatible chat completions as the first provider path; if native tool-calling is unavailable for a provider, use strict JSON object output and validate it server-side.

- [x] **Step 1: Write failing tool parser tests**

Test valid model output:

```json
{
  "tool": "build_parametric_model",
  "input": {
    "title": "Mounting bracket",
    "version": "v1",
    "source_kind": "openscad",
    "code": "width = 40; // [10:1:100]\ncube([width, 10, 5]);"
  }
}
```

Expected parsed struct:

```go
AIParametricToolCall{
    Tool: "build_parametric_model",
    Input: AIParametricArtifactInput{
        Title: "Mounting bracket",
        Version: "v1",
        SourceKind: "openscad",
        Code: "...",
    },
}
```

Test invalid output:

- Empty code -> `ErrInvalidAIChatInput`.
- Unsupported source kind -> `ErrInvalidAIChatInput`.
- Plain text claiming "I created it" without tool call for design request -> provider result rejected for model-generation route.

- [x] **Step 2: Split advisory and design routes**

Keep the current advisory route behavior for normal project Q&A. Add a parametric generation route:

```text
POST /api/v1/projects/:projectID/agent/conversations/:conversationID/parametric-runs
```

Request:

```json
{ "message": "Make a parametric bracket with four M5 holes" }
```

Response:

```json
{
  "message": { "role": "assistant", "parts": [...] },
  "artifact": { "id": "...", "source_kind": "openscad", "source_code": "..." }
}
```

- [x] **Step 3: Add system prompt**

Use a prompt with these hard rules:

```text
You are LiteCAD Assistant. When the user asks to create or edit a parameterized CAD model, call build_parametric_model. Do not claim that a model was created unless a valid tool call is returned. The tool input is the source artifact shown in LiteCAD. Use OpenSCAD source for the first milestone. Declare editable parameters at the top of the file with Customizer-style comments.
```

- [x] **Step 4: Persist generated artifact**

When a valid tool call arrives, create a `ProjectParametricArtifact` with `compile_status = "pending"`. Do not create a final `ProjectModel` until the browser compile succeeds and the user saves it.

- [x] **Step 5: Verify**

Run:

```bash
go test ./internal/service -run 'TestAIParametric|TestProjectAgent'
go test ./internal/handler -run 'TestProjectAgent'
task check
task test
```

Expected:

- Design route stores one user message, one assistant tool message, and one pending artifact.
- Advisory route continues to return normal text messages.
- Invalid tool outputs do not create artifacts.

Verification result on 2026-07-11:

- `go test ./internal/service -run 'TestAIParametric|TestProjectAgent'` passed.
- `go test ./internal/handler -run 'TestProjectAgent'` passed.
- `npm --prefix website test -- projects` passed.
- `git diff --check` passed.
- Documentation search for `ai-parametric-assistant`, `AI Parametric Assistant`, `build_parametric_model`, `parametric-run`, and `CADAM` passed.
- `task check` passed.
- `task test` passed with 40 frontend test files and 161 Vitest tests.

- [x] **Step 6: Commit**

```bash
git add internal/service internal/handler website/src/types/project.ts website/src/api/projects.ts
git commit -m "feat(agent): generate parametric artifacts"
```

---

### Task 7: Parametric preview and editor panel

**Files:**
- Create: `website/src/views/project/parametric-artifact-editor.tsx`
- Test: `website/src/views/project/parametric-artifact-editor.test.tsx`
- Create: `website/src/views/project/use-parametric-artifact-preview.ts`
- Test: `website/src/views/project/use-parametric-artifact-preview.test.tsx`
- Modify: `website/src/views/project/model-preview.tsx`
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/src/views/project/project-model-tree.tsx`
- Modify: `website/src/api/projects.ts`

**Interfaces:**
- Produces `ParametricArtifactEditor` with source preview, compile state, parameter controls, save button, and error display.
- Produces `useParametricArtifactPreview({ artifact, parameterValues })`.
- Consumes `compileOpenSCADInWorker` from Task 5.

- [ ] **Step 1: Write failing component tests**

Test:

```tsx
it('renders parsed parameters and recompiles when a slider changes', async () => {
  // artifact source has width parameter
  // compile hook is mocked
  // move slider from 20 to 40
  // expect compile called with parameterValues.width = 40
})

it('keeps compile errors visible and does not enable Save as model', async () => {
  // compile returns error
  // expect error text visible
  // expect Save disabled
})
```

Run:

```bash
npm --prefix website test -- parametric-artifact-editor use-parametric-artifact-preview
```

Expected: FAIL because editor does not exist.

- [ ] **Step 2: Implement preview hook**

Hook responsibilities:

- Debounce parameter changes, for example 250 ms.
- Cancel stale compile responses.
- Return `{ status, meshOrBlob, parameters, error }`.
- Dispose generated Three.js resources when inputs change.

- [ ] **Step 3: Implement editor panel**

Use controls by parameter type:

- number -> slider plus numeric input
- boolean -> switch
- enum string -> select
- color -> color swatch/input
- free string -> input

Do not add in-app explanatory text that describes how the feature works. The UI should show commands and state, not tutorial copy.

- [ ] **Step 4: Integrate with workbench**

When an Assistant tool message has an artifact, show it in the CAD preview region and open the editor panel in the Inspector area or a controlled right-side section. Preserve the existing Assistant column layout.

- [ ] **Step 5: Verify**

Run:

```bash
npm --prefix website test -- parametric-artifact-editor use-parametric-artifact-preview model-preview project-model-tree
npm --prefix website run build
task check
task test
```

Expected:

- Parameter controls render from source.
- Recompile is debounced.
- Compile errors are durable in the panel.
- Existing STEP preview tests still pass.

- [ ] **Step 6: Browser verification**

Run a Playwright path that:

1. Opens a project.
2. Opens Assistant.
3. Uses mocked parametric-run API to return an artifact.
4. Waits for preview compile success.
5. Changes a parameter.
6. Confirms the preview updates and no console errors occur.

Expected:

- Canvas is nonblank.
- Parameter change triggers exactly one settled compile after debounce.
- Save is enabled only on successful compile.

- [ ] **Step 7: Commit**

```bash
git add website/src/views/project website/src/api/projects.ts
git commit -m "feat(projects): preview parametric artifacts"
```

---

### Task 8: Save generated artifact as project model

**Files:**
- Modify: `internal/service/parametric_artifact.go`
- Modify: `internal/service/project.go`
- Test: `internal/service/parametric_artifact_test.go`
- Modify: `internal/handler/project_parametric.go`
- Test: `internal/handler/project_parametric_test.go`
- Modify: `website/src/api/projects.ts`
- Modify: `website/src/types/project.ts`
- Modify: `website/src/views/project/parametric-artifact-editor.tsx`
- Modify: `website/src/views/project/project-preview-assets.ts`
- Test: `website/src/views/project/project-preview-assets.test.ts`

**Interfaces:**
- Produces route:
  - `POST /api/v1/projects/:projectID/parametric-artifacts/:artifactID/save-model`
- Produces saved `ProjectModel` with `format = "scad"` or `format = "parametric"` after final naming decision.
- Produces metadata fields: source_kind, parameter_count, compile_summary.

- [ ] **Step 1: Write failing service tests**

Test:

```go
func TestSaveParametricArtifactCreatesProjectModel(t *testing.T) {
    // create project
    // create successful openscad artifact
    // save as model
    // assert ProjectModel exists with generated .scad filename
    // assert source download returns OpenSCAD source bytes
}

func TestSaveParametricArtifactRejectsFailedCompile(t *testing.T) {
    // artifact compile_status = error
    // save route returns ErrInvalidProjectModelInput or ErrInvalidCADDocumentInput
}
```

Run:

```bash
go test ./internal/service -run 'TestSaveParametricArtifact'
```

Expected: FAIL because save route does not exist.

- [ ] **Step 2: Extend model format**

Add `scad` to backend and frontend project model format validation. Ensure existing STEP/GLB/GLTF/STL behavior remains unchanged.

- [ ] **Step 3: Save source bytes**

Use the existing project model storage path conventions. Store source code as `.scad` bytes with content type `text/plain; charset=utf-8`. Generated filenames should be stable and safe:

```text
<artifact-title-slug>-litecad.scad
```

- [ ] **Step 4: Preview saved model**

For saved `scad` models, route preview through the OpenSCAD worker and existing mesh rendering path. The project list thumbnail snapshot can reuse the workbench-generated static snapshot path after the model renders.

- [ ] **Step 5: Verify**

Run:

```bash
go test ./internal/service -run 'TestSaveParametricArtifact|TestProjectModel'
go test ./internal/handler -run 'TestProjectParametric|TestProjectModel'
npm --prefix website test -- project-preview-assets
task check
task test
```

Expected:

- Saved generated source appears in model list.
- Source download returns `.scad`.
- Existing uploads are unaffected.

- [ ] **Step 6: Browser verification**

Run:

```bash
task test-browser
```

Add or update smoke so it can:

1. Generate a parametric artifact through mocked Assistant response.
2. Compile preview.
3. Save it as a project model.
4. Reload project route.
5. Confirm the generated model remains visible.

Expected:

- Reload shows the saved model in tree.
- Preview canvas remains nonblank.
- No unexpected console or page errors.

- [ ] **Step 7: Commit**

```bash
git add internal/service internal/handler website/src/types/project.ts website/src/api/projects.ts website/src/views/project
git commit -m "feat(projects): save generated parametric models"
```

---

### Task 9: Edit saved parametric models

**Files:**
- Create: `internal/entity/project_parametric_revision.go`
- Modify: `internal/database/migrate.go`
- Modify: `internal/service/parametric_artifact.go`
- Test: `internal/service/parametric_artifact_test.go`
- Modify: `internal/handler/project_parametric.go`
- Modify: `website/src/views/project/parametric-artifact-editor.tsx`
- Modify: `website/src/views/project/project-inspector.tsx`
- Test: `website/src/views/project/parametric-artifact-editor.test.tsx`

**Interfaces:**
- Produces revision history for parameter value changes.
- Produces `PATCH /api/v1/projects/:projectID/models/:modelID/parametric-parameters`.
- Consumes saved model source and parameter parser.

- [ ] **Step 1: Write failing tests**

Backend:

```go
func TestUpdateParametricModelParametersPersistsRevision(t *testing.T) {
    // save generated scad model
    // update width parameter
    // assert revision row created
    // assert model metadata latest parameter_values changed
}
```

Frontend:

```tsx
it('loads a saved parametric model and persists parameter edits', async () => {
  // selected scad model
  // editor displays saved width
  // change width
  // save
  // expect API patch called with parameter_values
})
```

- [ ] **Step 2: Add revision entity**

Track:

```go
type ProjectParametricRevision struct {
    ID                  string
    ProjectID           string
    ModelID             string
    ParameterValuesJSON json.RawMessage
    SourceCode          string
    Summary             string
    CreatedAt           time.Time
}
```

Store the complete source code with each revision only if source edits are supported in this task. If only parameter values are supported, store parameter values plus the model source checksum.

- [ ] **Step 3: Implement parameter update route**

Validate:

- Model belongs to owner-scoped project.
- Model format is `scad` or selected parametric format.
- Parameter keys exist in parsed source.
- Values match parsed parameter types.

- [ ] **Step 4: Update editor**

When a saved parametric model is selected, show the same parameter controls used for drafts. `Save` persists values; `Reset` returns to source defaults or last saved values depending on UI decision.

- [ ] **Step 5: Verify**

Run:

```bash
go test ./internal/service -run 'TestUpdateParametricModelParameters'
go test ./internal/handler -run 'TestProjectParametric'
npm --prefix website test -- parametric-artifact-editor project-inspector
task check
task test
```

Expected:

- Parameter edits survive reload.
- Invalid parameter names or types are rejected.
- Existing CAD document History tests are unaffected because parametric parameter history is separate in this milestone.

- [ ] **Step 6: Commit**

```bash
git add internal/entity internal/database internal/service internal/handler website/src/views/project
git commit -m "feat(projects): edit parametric model parameters"
```

---

### Task 10: Documentation, product copy, and verification closure

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `.agents/rules/threejs-viewer.md`
- Modify: `docs/ai-parametric-assistant.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`

**Interfaces:**
- Produces updated product docs that distinguish shipped OpenSCAD parametric generation from future LiteCAD-native OCCT feature DSL.
- Removes completed roadmap bullets from `TODO.md`.
- Leaves future work for feature DSL, STEP/B-rep parametric export, richer boolean operations, source editing, and cost controls if still unfinished.

- [ ] **Step 1: Update README**

Add to current implemented surface only after browser verification passes:

```markdown
- Project-scoped Assistant conversations for AI-assisted parametric model generation.
- OpenSCAD-style generated source artifacts with browser worker preview, editable parameters, and save-as-project-model persistence.
```

Keep product boundary:

```markdown
Generated OpenSCAD-style models are parameterized source assets. They are not the same as durable OCCT B-rep feature graphs, preserved source-application history, or general STEP assembly semantics.
```

- [ ] **Step 2: Update TODO**

Remove completed bullets for multi-session Assistant and OpenSCAD generated model MVP. Keep future bullets:

```markdown
- Add LiteCAD-native OCCT feature DSL for generated models that need durable STEP/B-rep editing beyond OpenSCAD-style source assets.
- Add cost controls, provider-specific structured tool-call support, and richer Assistant run failure states.
- Add source-code editing and diff review for generated parametric artifacts if product usage demands direct code control.
```

- [ ] **Step 3: Update agent rules**

State exactly what is shipped and what remains future work. Make sure later agents do not treat OpenSCAD generated source as full editable B-rep state.

- [ ] **Step 4: Final verification bundle**

Run:

```bash
git diff --check
task check
task test
task test-browser
```

Expected:

- All commands pass.
- Browser smoke covers Assistant conversation creation, generated artifact preview, parameter edit, save as model, reload, and no unexpected browser errors.

- [ ] **Step 5: Commit**

```bash
git add README.md TODO.md AGENTS.md .agents/rules docs
git commit -m "docs(project): document parametric assistant"
```

---

## Testing Matrix

| Layer | Coverage | Command |
| --- | --- | --- |
| Go service | conversation isolation, artifact validation, save-as-model, parameter revisions | `go test ./internal/service -run 'TestProjectAgentConversation|TestProjectParametricArtifact|TestSaveParametricArtifact|TestUpdateParametricModelParameters'` |
| Go handler | owner-scoped routes and error mapping | `go test ./internal/handler -run 'TestProjectAgent|TestProjectParametric|TestProjectModel'` |
| Frontend API/types | contract compile checks | `task check` |
| Worker protocol | request validation and compile error shape | `npm --prefix website test -- openscad-protocol` |
| Parameter parsing | sliders, enums, booleans, colors, groups | `npm --prefix website test -- openscad-parameters` |
| UI components | conversation selector, parametric editor, compile errors, save state | `npm --prefix website test -- project-assistant-panel parametric-artifact-editor` |
| Preview integration | nonblank render, debounced compile, resource disposal | `npm --prefix website test -- use-parametric-artifact-preview model-preview` |
| Browser smoke | end-to-end generated model workflow | `task test-browser` |
| Full repo | backend, frontend, module tidy | `task check` |
| Behavior regression | non-trivial API/database/frontend behavior | `task test` |

## Verification Result Guidance

Use this section to interpret failures without guessing.

- `OpenSCAD worker initializes but first compile takes too long`: record cold and warm timings. If cold compile blocks UX, lazy-load worker only when Assistant generates a parametric artifact and show a bounded loading state.
- `Vite build cannot emit WASM asset`: verify the dependency exposes an importable `?url` path like the existing OCCT worker. Do not hard-code a localhost path.
- `Parameter parser misses a value`: keep parser conservative. Add one failing fixture and support the exact source shape generated by the prompt. Do not build a full OpenSCAD parser in the MVP.
- `Model says it created a model without a tool call`: reject the generation route response and store a failure message; adjust system prompt/tool forcing before allowing the UI to show a successful artifact.
- `Generated source compiles but preview is visually empty`: treat this as compile failure for product UX. The editor should show a durable error and keep Save disabled.
- `Save-as-model works but reload loses parameters`: check model metadata and parameter revision persistence before debugging Three.js.
- `New chat still sees old transcript`: inspect provider message assembly in `SendProjectAgentMessage` or parametric run service. Only selected conversation messages should be loaded.
- `task test-browser fails on layout overlap`: preserve the existing main-level two-column Assistant layout and rerun the narrower desktop viewport check that previously caught Assistant/CAD panel overlap.
- `License review blocks OpenSCAD bundling`: pause the OpenSCAD implementation path and switch Task 5 onward to a LiteCAD-native feature DSL compiled by the existing OCCT worker.

## Future Phase: LiteCAD-Native Feature DSL

After the OpenSCAD MVP ships, design a compact LiteCAD feature DSL for models that need durable STEP/B-rep editing:

```json
{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 80, "min": 20, "max": 200 }
  },
  "features": [
    { "id": "base", "type": "box", "size": ["width", 40, 6] },
    { "id": "hole_1", "type": "cylinder_cut", "diameter": 5, "depth": 8, "origin": [10, 10, 0] }
  ]
}
```

This future DSL should compile to OCCT operations, export STEP through the existing browser kernel path, and eventually share History with CAD document operations. It should not replace the faster OpenSCAD MVP until it can generate useful models, expose parameters, preview reliably, and export current geometry.

## Completion Criteria

This plan is complete only when:

- A project can own multiple Assistant conversations.
- New chat starts without old transcript context.
- A user can generate a parameterized model from text.
- The generated source compiles in a browser worker.
- The workbench shows a nonblank preview.
- Parameters are editable without another model call.
- The user can save the generated model as a project asset.
- The saved generated model survives reload.
- The README/TODO/AGENTS/docs surfaces describe exactly what shipped and what remains future work.
