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
- LiteCAD is not launched yet, so future AI Parametric Assistant phases may choose clean internal schemas and API contracts over backward-compatible legacy routes or data migrations unless a later requirement explicitly preserves existing local sample data.

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

- [x] **Step 7: Commit**

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

**Implementation note:** Task 5 found no license-accepted OpenSCAD WASM runtime to bundle yet. This phase implements the editor, parameter controls, worker compile request path, durable compile-error display, Assistant generate button, and browser smoke coverage for the current unavailable runtime state. Mesh preview success and Save enablement remain blocked on the OpenSCAD runtime decision.

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

- [x] **Step 1: Write failing component tests**

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

- [x] **Step 2: Implement preview hook**

Hook responsibilities:

- Debounce parameter changes, for example 250 ms.
- Cancel stale compile responses.
- Return `{ status, meshOrBlob, parameters, error }`.
- Dispose generated Three.js resources when inputs change.

- [x] **Step 3: Implement editor panel**

Use controls by parameter type:

- number -> slider plus numeric input
- boolean -> switch
- enum string -> select
- color -> color swatch/input
- free string -> input

Do not add in-app explanatory text that describes how the feature works. The UI should show commands and state, not tutorial copy.

- [x] **Step 4: Integrate with workbench**

When an Assistant parametric run returns an artifact, open the editor panel in the Inspector area. Preserve the existing Assistant column layout.

- [x] **Step 5: Verify**

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

Verification result on 2026-07-11:

- `npm --prefix website test -- parametric-artifact-editor use-parametric-artifact-preview` first failed because the editor and hook did not exist.
- `npm --prefix website test -- parametric-artifact-editor use-parametric-artifact-preview project-assistant-panel` passed.
- `npm --prefix website test -- parametric-artifact-editor use-parametric-artifact-preview model-preview project-model-tree project-assistant-panel` passed with 11 files and 24 tests.
- `npm --prefix website run build` passed. Vite emitted existing large chunk and browser-externalized Node built-in warnings for the OCCT bundle.
- `task check` passed.
- `task test` passed with 42 frontend test files and 166 Vitest tests.
- `task test-browser` passed with the parametric-run smoke path.

- [x] **Step 6: Browser verification**

Run a Playwright path that:

1. Opens a project.
2. Opens Assistant.
3. Uses mocked parametric-run API to return an artifact.
4. Waits for preview compile success.
5. Changes a parameter.
6. Confirms the preview updates and no console errors occur.

Expected:

- The existing canvas/workbench remains stable with no unexpected browser errors.
- The mocked parametric-run API returns an artifact, opens the editor, renders the `width` parameter, and shows `OpenSCAD runtime is not configured`.
- Save remains disabled while compile is unavailable.

- [x] **Step 7: Commit**

```bash
git add website/src/views/project website/src/api/projects.ts
git commit -m "feat(projects): preview parametric artifacts"
```

---

### Task 8: Save generated artifact as project model

**Implementation note:** This phase implements the backend/API persistence path for artifacts whose `compile_status` is already `success`. The normal browser flow cannot produce that status yet because no OpenSCAD runtime is bundled; saved SCAD mesh preview and browser save smoke remain deferred until the runtime gate is resolved.

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

- [x] **Step 1: Write failing service tests**

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

- [x] **Step 2: Extend model format**

Add `scad` to backend and frontend project model format validation. Ensure existing STEP/GLB/GLTF/STL behavior remains unchanged.

- [x] **Step 3: Save source bytes**

Use the existing project model storage path conventions. Store source code as `.scad` bytes with content type `text/plain; charset=utf-8`. Generated filenames should be stable and safe:

```text
<artifact-title-slug>-litecad.scad
```

- [ ] **Step 4: Preview saved model**

For saved `scad` models, route preview through the OpenSCAD worker and existing mesh rendering path. The project list thumbnail snapshot can reuse the workbench-generated static snapshot path after the model renders.

Deferred result on 2026-07-11: saved `.scad` models appear as source records and source download works, but mesh preview remains blocked on the OpenSCAD runtime decision recorded in Task 5.

- [x] **Step 5: Verify**

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

Verification result on 2026-07-11:

- `go test ./internal/service -run 'TestSaveParametricArtifact|TestUploadProjectModel|TestProjectModel'` passed.
- `go test ./internal/handler -run 'TestProjectParametric|TestProjectModel'` passed.
- `npm --prefix website test -- projects project-preview-assets parametric-artifact-editor` passed with 4 files and 41 tests.
- `npm --prefix website run build` passed. Vite emitted existing large chunk and browser-externalized Node built-in warnings for the OCCT bundle.
- `task check` passed.
- `task test` passed with 42 frontend test files and 167 Vitest tests.
- `task test-browser` passed.

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

Deferred result on 2026-07-11: browser save verification remains blocked because normal generated artifacts cannot reach compile success without the OpenSCAD runtime. The browser smoke continues to verify that pending generated artifacts keep Save disabled while compile is unavailable.

- [ ] **Step 7: Commit**

```bash
git add internal/service internal/handler website/src/types/project.ts website/src/api/projects.ts website/src/views/project
git commit -m "feat(projects): save generated parametric models"
```

---

### Task 9: Edit saved parametric models

**Files:**
- Create: `internal/entity/project_parametric_revision.go`
- Modify: `internal/database/database.go`
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

- [x] **Step 1: Write failing tests**

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

- [x] **Step 2: Add revision entity**

Track:

```go
type ProjectParametricRevision struct {
    ID                  string
    ProjectID           string
    ModelID             string
    ParameterValuesJSON json.RawMessage
    SourceChecksum      string
    Summary             string
    CreatedAt           time.Time
}
```

Implemented with parameter values plus the model source SHA-256 checksum because this milestone only supports parameter value edits, not source-code edits.

- [x] **Step 3: Implement parameter update route**

Validate:

- Model belongs to owner-scoped project.
- Model format is `scad` or selected parametric format.
- Parameter keys exist in parsed source.
- Values match parsed parameter types.

- [x] **Step 4: Update editor**

When a saved parametric model is selected, show the same parameter controls used for drafts. `Save` persists values; `Reset` returns to source defaults or last saved values depending on UI decision.

- [x] **Step 5: Verify**

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

Actual Task 9 verification before full gate:

```bash
go test ./internal/service -run 'TestUpdateParametricModelParameters|TestSaveParametricArtifact'
go test ./internal/handler -run 'TestProjectParametricArtifact'
npm --prefix website test -- parametric-artifact-editor projects
npm --prefix website run build
git diff --check
```

Result on 2026-07-11: all commands passed. `npm --prefix website run build` still reports the existing large chunk / browser-externalized Node module warnings for the WASM stack, but the build exits successfully.

Full Task 9 gate on 2026-07-11:

```bash
task check
task test
task test-browser
```

Result: all commands passed. `task test` reported 42 frontend test files and 168 Vitest tests passing; `task test-browser` reported the deterministic project workbench, History, and Assistant smoke passing.

- [x] **Step 6: Commit**

```bash
git add internal/entity internal/database internal/service internal/handler website/src/views/project
git commit -m "feat(projects): edit parametric model parameters"
```

Committed on 2026-07-11 as `feat(projects): edit parametric model parameters`.

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

- [x] **Step 1: Update README**

Add to current implemented surface only after browser verification passes:

```markdown
- Project-scoped Assistant conversations for AI-assisted parametric model generation.
- OpenSCAD-style generated source artifacts with browser worker preview, editable parameters, and save-as-project-model persistence.
```

Keep product boundary:

```markdown
Generated OpenSCAD-style models are parameterized source assets. They are not the same as durable OCCT B-rep feature graphs, preserved source-application history, or general STEP assembly semantics.
```

Execution note on 2026-07-11: browser worker mesh preview was not added to README as shipped behavior because the compatible OpenSCAD runtime gate has not passed. README instead documents the implemented Assistant conversations, draft artifacts, parameter controls, save-as-`.scad`, and saved parameter revisions, while keeping OpenSCAD mesh compilation as future work.

- [x] **Step 2: Update TODO**

Remove completed bullets for multi-session Assistant and OpenSCAD generated model MVP. Keep future bullets:

```markdown
- Add LiteCAD-native OCCT feature DSL for generated models that need durable STEP/B-rep editing beyond OpenSCAD-style source assets.
- Add cost controls, provider-specific structured tool-call support, and richer Assistant run failure states.
- Add source-code editing and diff review for generated parametric artifacts if product usage demands direct code control.
```

- [x] **Step 3: Update agent rules**

State exactly what is shipped and what remains future work. Make sure later agents do not treat OpenSCAD generated source as full editable B-rep state.

Updated on 2026-07-11 to keep shipped Assistant conversations, OpenSCAD-style artifact drafts, save-as-`.scad`, and saved parameter revisions separate from the still-unshipped OpenSCAD mesh runtime and future LiteCAD-native OCCT feature DSL. Also updated `docs/browser-cad-kernel-roadmap.md` and `.agents/rules/threejs-viewer.md` so later viewer work treats `.scad` records as source assets, not renderable Three.js geometry or durable B-rep shape state.

- [x] **Step 4: Final verification bundle**

Run:

```bash
git diff --check
task check
task test
task test-browser
```

Expected:

- All commands pass.
- Browser smoke covers the currently implemented Assistant/workbench shell without unexpected browser errors. Generated artifact mesh preview, browser save smoke, and nonblank OpenSCAD preview remain deferred until the OpenSCAD runtime gate is resolved.

Actual Task 10 verification on 2026-07-11:

```bash
git diff --check
task check
task test
task test-browser
```

Result: all commands passed. `task test` reported 42 frontend test files and 168 Vitest tests passing. `task test-browser` reported the deterministic project workbench, History, and Assistant smoke passing without unexpected browser errors.

- [x] **Step 5: Commit**

```bash
git add README.md TODO.md AGENTS.md .agents/rules docs
git commit -m "docs(project): document parametric assistant"
```

Committed and pushed on 2026-07-11 as `docs(project): document parametric assistant`.

---

### Task 11: LiteCAD-native feature DSL worker foundation

**Why this task exists:** OpenSCAD runtime bundling is still blocked by license/distribution review. The plan's fallback guidance says to switch to a LiteCAD-native feature DSL compiled by the existing OCCT worker when that gate blocks progress. This task creates the smallest verifiable worker foundation for that path without claiming a full Assistant/UI integration.

**Files:**
- Modify: `website/src/cad/kernel-protocol.ts`
- Modify: `website/src/cad/kernel-worker-client.ts`
- Modify: `website/src/cad/kernel-worker-handler.ts`
- Modify: `website/src/cad/kernel.worker.ts`
- Modify: `website/src/cad/opencascade-step.ts`
- Test: `website/src/cad/kernel-protocol.test.ts`
- Test: `website/src/cad/kernel-worker-client.test.ts`
- Test: `website/src/cad/kernel-worker-handler.test.ts`
- Test: `website/src/cad/opencascade-step.test.ts`
- Modify docs: `docs/ai-parametric-assistant.md`, `docs/browser-cad-kernel-roadmap.md`, `TODO.md`, `AGENTS.md`

**Interfaces:**
- Produces `feature-dsl-preview` worker requests.
- Produces `feature-dsl-export` worker requests.
- Consumes a minimal LiteCAD feature DSL JSON document:

```json
{
  "version": 1,
  "unit": "millimetre",
  "parameters": {
    "width": { "type": "number", "default": 80, "min": 20, "max": 200 }
  },
  "features": [
    { "id": "base", "type": "box", "origin": [0, 0, 0], "size": ["width", 40, 6] }
  ]
}
```

- Returns browser-kernel mesh buffers for preview.
- Returns exported STEP text for export.

- [x] **Step 1: Write failing tests**

RED tests added for protocol validation, worker client request/response handling, worker handler dispatch, and OCCT export of a parameterized `box` feature.

- [x] **Step 2: Add protocol and client**

Added `CadKernelFeatureDSLDocument`, `feature-dsl-preview`, `feature-dsl-export`, `runFeatureDSLPreviewInWorker(...)`, and `runFeatureDSLExportInWorker(...)`.

- [x] **Step 3: Add OCCT adapter**

Implemented numeric parameter resolution, `box` feature compilation through `BRepPrimAPI_MakeBox`, preview tessellation through the existing OCCT mesh path, and STEP export through the existing STEP writer path.

- [x] **Step 4: Verify**

Commands:

```bash
npm --prefix website test -- kernel-protocol kernel-worker-handler kernel-worker-client opencascade-step
npm --prefix website run build
task check
task test
task test-browser
```

Browser worker smoke on 2026-07-11 used a real Vite/Chromium run and dynamically imported `runFeatureDSLPreviewInWorker(...)` plus `runFeatureDSLExportInWorker(...)`. A parameterized 96 x 42 x 6 box produced a mesh summary of `vertexCount: 24`, `triangleCount: 12`, `hasNormals: true`, and exported STEP text of 15403 bytes starting with `ISO-10303-21`; no browser console messages or HTTP 404s were observed in the final clean run.

Result: all verification commands passed. `npm --prefix website run build` still reports the existing Vite warnings about browser-externalized Node modules and large chunks for the WASM stack, but exits successfully. `task test` reported 42 frontend test files and 173 Vitest tests passing; `task test-browser` reported the deterministic project workbench, History, and Assistant smoke passing.

- [x] **Step 5: Commit**

```bash
git add website/src/cad docs TODO.md AGENTS.md
git commit -m "feat(cad): add feature dsl worker path"
```

Committed and pushed on 2026-07-11 as `feat(cad): add feature dsl worker path`.

Remaining after this task:

- The Assistant route still emits OpenSCAD-style artifacts.
- Project persistence does not yet store a LiteCAD feature DSL model format.
- Inspector parameter editing is not yet wired to feature DSL documents.
- Project workbench preview does not yet route saved DSL models through `feature-dsl-preview`.

---

### Task 12: Assistant and project persistence for LiteCAD feature DSL

**Why this task exists:** Task 11 proved the license-safe OCCT worker path for a minimal LiteCAD feature DSL, but the Assistant and project asset flow still only accepted OpenSCAD-style generated artifacts. This task makes `litecad-feature-dsl` a first-class generated source kind without yet wiring saved DSL models into the project preview/export UI.

**Files:**
- Modify: `internal/service/parametric_artifact.go`
- Modify: `internal/service/project.go`
- Modify: `internal/service/ai_tools.go`
- Test: `internal/service/parametric_artifact_test.go`
- Test: `internal/service/ai_tools_test.go`
- Test: `internal/handler/project_parametric_test.go`
- Modify: `website/src/types/project.ts`
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/src/views/project/use-parametric-artifact-preview.ts`
- Test: `website/src/views/project/use-parametric-artifact-preview.test.ts`
- Test: `website/src/views/project/parametric-artifact-editor.test.tsx`
- Modify docs: `docs/ai-parametric-assistant.md`, `docs/browser-cad-kernel-roadmap.md`, `TODO.md`, `AGENTS.md`, `.agents/rules/litecad-architecture.md`, `.agents/rules/threejs-viewer.md`

**Interfaces:**
- Accepts AI tool calls and artifact API payloads with `source_kind = "litecad-feature-dsl"`.
- Saves successful DSL artifacts as project models with:
  - `format = "lcad"`
  - generated filename `<title-slug>-litecad.lcad.json`
  - content type `application/json`
  - metadata `asset_type = "lcad"`, `source_kind = "litecad-feature-dsl"`, `schema = "litecad-feature-dsl"`
- Extracts DSL `unit`, parameter defaults, artifact parameter values, and feature count into model metadata.
- Lets saved `.lcad.json` model parameter values persist through the existing parametric revision route.
- Lets the Inspector read DSL parameter defaults and edit saved parameter values without calling the OpenSCAD worker.

- [x] **Step 1: Write failing tests**

RED tests covered:

- `litecad-feature-dsl` artifact creation and save-as-model.
- AI parser and parametric run accepting `litecad-feature-dsl`.
- Handler route saving DSL artifact as `format = "lcad"`.
- Saved DSL parameter revision persistence.
- Frontend API/types, project tree behavior, preview hook, and editor behavior for DSL artifacts.

Initial RED result:

```bash
go test ./internal/service -run 'TestSaveLiteCADFeatureDSLArtifactCreatesProjectModel|TestAIParametricToolCallParserAcceptsLiteCADFeatureDSL|TestAIParametricRunCreatesPendingLiteCADFeatureDSLArtifact'
go test ./internal/handler -run 'TestProjectParametricArtifactRoutesSaveLiteCADFeatureDSL'
go test ./internal/service -run 'TestUpdateLiteCADFeatureDSLModelParametersPersistsRevision'
```

Expected failures were observed: `litecad-feature-dsl` was rejected by service/parser/handler validation, and saved DSL models were rejected by the parameter update route.

- [x] **Step 2: Extend backend source kind, model format, and metadata**

Implemented:

- `projectParametricSourceKindLiteCADDSL = "litecad-feature-dsl"`.
- Source-kind validation for OpenSCAD and LiteCAD DSL, including JSON validity for DSL source.
- Save-as-model storage selection for `.scad` and `.lcad.json`.
- `ExtractLiteCADFeatureDSLMetadata(...)` for unit, version, parameter values, and feature count.
- Artifact parameter-value merging into saved model metadata.
- `UpdateParametricModelParameters(...)` support for saved `lcad` models and revision records.

- [x] **Step 3: Extend AI tool parser and prompt**

Updated strict tool-call parsing to accept `litecad-feature-dsl`, reject invalid DSL JSON, and prompt the provider to prefer LiteCAD feature DSL unless the user explicitly asks for OpenSCAD source.

- [x] **Step 4: Extend frontend type/API/editor recognition**

Updated TypeScript contracts for `format = "lcad"` and `source_kind = "litecad-feature-dsl"`. The Inspector can now represent a saved `.lcad.json` model as a parametric artifact, parse DSL parameters from JSON defaults, and edit saved parameter values without sending DSL JSON to the unavailable OpenSCAD worker.

- [x] **Step 5: Verify**

Run:

```bash
go test ./internal/service -run 'TestSaveLiteCADFeatureDSLArtifactCreatesProjectModel|TestAIParametricToolCallParserAcceptsLiteCADFeatureDSL|TestAIParametricRunCreatesPendingLiteCADFeatureDSLArtifact|TestUpdateLiteCADFeatureDSLModelParametersPersistsRevision|TestUploadProjectModelMarksInvalidLiteCADFeatureDSLError|TestSaveParametricArtifactCreatesProjectModel|TestUpdateParametricModelParametersPersistsRevision'
go test ./internal/handler -run 'TestProjectParametricArtifactRoutesSaveLiteCADFeatureDSL|TestProjectParametricArtifactRoutes'
npm --prefix website test -- projects project-preview-assets use-parametric-artifact-preview parametric-artifact-editor index
npm --prefix website run build
git diff --check
task check
task test
task test-browser
```

Expected:

- OpenSCAD artifact save/edit behavior remains green.
- LiteCAD DSL artifact save/edit behavior is green.
- TypeScript accepts `lcad`/`litecad-feature-dsl`.
- Browser smoke remains green, while saved DSL preview mesh remains explicitly future work.

Verification result on 2026-07-11:

- `go test ./internal/service -run 'TestSaveLiteCADFeatureDSLArtifactCreatesProjectModel|TestAIParametricToolCallParserAcceptsLiteCADFeatureDSL|TestAIParametricRunCreatesPendingLiteCADFeatureDSLArtifact|TestUpdateLiteCADFeatureDSLModelParametersPersistsRevision|TestUploadProjectModelMarksInvalidLiteCADFeatureDSLError|TestSaveParametricArtifactCreatesProjectModel|TestUpdateParametricModelParametersPersistsRevision'` passed.
- `go test ./internal/handler -run 'TestProjectParametricArtifactRoutesSaveLiteCADFeatureDSL|TestProjectParametricArtifactRoutes'` passed.
- `npm --prefix website test -- projects project-preview-assets use-parametric-artifact-preview parametric-artifact-editor index` passed with 5 files and 48 tests.
- `npm --prefix website run build` passed. Vite still reports the existing WASM large chunk and browser-externalized Node module warnings for the OCCT bundle.
- `git diff --check` passed.
- `task check` passed.
- `task test` passed with 42 frontend test files and 177 Vitest tests.
- `task test-browser` passed.

- [x] **Step 6: Commit**

```bash
git add internal/service internal/handler website/src docs TODO.md AGENTS.md .agents/rules
git commit -m "feat(agent): persist feature dsl artifacts"
```

Committed and pushed on 2026-07-11 as `feat(agent): persist feature dsl artifacts`.

Remaining after this task:

- Project export UI does not yet expose saved DSL model STEP export through `feature-dsl-export`.
- The DSL still supports only the minimal worker feature set from Task 11.

---

### Task 13: Saved LiteCAD feature DSL project preview

**Why this task exists:** Task 12 made LiteCAD feature DSL artifacts durable project assets, but saved `.lcad.json` models still appeared only as source records. This task routes saved DSL project models through the existing browser CAD kernel `feature-dsl-preview` path so generated parametric source can produce a real workbench mesh.

**Files:**
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/src/views/project/project-preview-assets.ts`
- Create: `website/src/views/project/project-feature-dsl-preview.ts`
- Test: `website/src/views/project/project-feature-dsl-preview.test.ts`
- Test: `website/src/views/project/project-preview-assets.test.ts`
- Modify docs: `docs/ai-parametric-assistant.md`, `docs/browser-cad-kernel-roadmap.md`, `TODO.md`, `AGENTS.md`, `.agents/rules/litecad-architecture.md`, `.agents/rules/threejs-viewer.md`, this plan

**Interfaces:**
- Saved `format = "lcad"` models use `fetchProjectModelSource(...)` to load `.lcad.json` source text.
- The project view builds `CadKernelFeatureDSLInput` from source JSON plus numeric saved parameter values.
- The project view calls `runFeatureDSLPreviewInWorker(...)`.
- `buildProjectPreviewAssets(...)` treats `lcad` worker results as `kernel-mesh` preview assets.
- Backend preview artifact fetches are skipped for `lcad` models.

- [x] **Step 1: Write failing tests**

RED tests added:

```bash
npm --prefix website test -- project-feature-dsl-preview project-preview-assets
```

Expected failures were observed:

- `project-feature-dsl-preview.ts` did not exist.
- `buildProjectPreviewAssets(...)` returned no preview asset for an `lcad` model even when worker mesh data was available.

- [x] **Step 2: Add feature DSL preview input helper**

Implemented `buildFeatureDSLPreviewInput(...)` to parse saved `.lcad.json` source and pass only numeric saved parameter values declared by the DSL document to the worker.

- [x] **Step 3: Wire project preview**

Implemented:

- `browserKernelFeatureDSLPreviewModels` in the project route.
- `runFeatureDSLPreviewInWorker(...)` React Query calls for saved `lcad` models.
- Combined STEP and DSL worker results into the existing `kernelMeshesByModelID` map.
- Excluded `lcad` from backend preview-artifact queries.
- Allowed `buildProjectPreviewAssets(...)` to emit `kernel-mesh` assets for saved `lcad` models.

- [x] **Step 4: Verify**

Run:

```bash
npm --prefix website test -- project-feature-dsl-preview project-preview-assets index
npm --prefix website run build
git diff --check
task check
task test
task test-browser
```

Expected:

- Saved `.lcad.json` models produce `kernel-mesh` preview assets when `feature-dsl-preview` returns mesh data.
- Existing STEP browser-kernel preview remains green.
- Backend GLB/GLTF/STL preview paths remain unchanged.
- Browser smoke remains green.

Verification result on 2026-07-11:

- `npm --prefix website test -- project-feature-dsl-preview project-preview-assets` passed after the RED failures.
- `npm --prefix website test -- project-feature-dsl-preview project-preview-assets index` passed with 3 files and 25 tests.
- `npm --prefix website run build` passed. Vite still reports the existing WASM large chunk and browser-externalized Node module warnings for the OCCT bundle.
- Real browser worker smoke through Vite/Chromium imported `buildFeatureDSLPreviewInput(...)` and `runFeatureDSLPreviewInWorker(...)`; a saved-model-shaped `.lcad.json` source produced `vertexCount: 24`, `triangleCount: 12`, `hasNormals: true`, 72 position values, 72 normal values, and 36 indices with no console messages or HTTP 404s.
- `git diff --check` passed.
- `task check` passed.
- `task test` passed with 43 frontend test files and 179 Vitest tests.
- `task test-browser` passed.

- [x] **Step 5: Commit**

```bash
git add website/src/views/project docs TODO.md AGENTS.md .agents/rules
git commit -m "feat(projects): preview feature dsl models"
```

Commit result on 2026-07-11:

- Committed and pushed as `d8ab5a4 feat(projects): preview feature dsl models`.

Remaining after this task:

- Project export UI does not yet expose saved DSL model STEP export through `feature-dsl-export`; Task 14 addresses this.
- The DSL still supports only the minimal worker feature set from Task 11.

---

### Task 14: Saved LiteCAD feature DSL STEP export UI

**Why this task exists:** Task 13 made saved `.lcad.json` models previewable, but export still only considered imported STEP targets. This task makes saved LiteCAD feature DSL models first-class STEP export targets by routing them through the existing browser CAD kernel `feature-dsl-export` request before download or compound assembly export.

**Files:**
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/src/views/project/project-step-export.ts`
- Modify: `website/src/views/project/project-step-export-action.ts`
- Modify: `website/src/views/project/project-feature-dsl-preview.ts`
- Test: `website/src/views/project/project-step-export.test.ts`
- Test: `website/src/views/project/project-step-export-action.test.ts`
- Test: `website/src/views/project/project-step-export-popover.test.tsx`
- Modify docs: `docs/ai-parametric-assistant.md`, `docs/browser-cad-kernel-roadmap.md`, `TODO.md`, `AGENTS.md`, `.agents/rules/litecad-architecture.md`, `.agents/rules/threejs-viewer.md`, this plan

**Interfaces:**
- `StepExportTarget` includes `sourceFormat: "step" | "lcad"` and optional saved parameter values.
- `buildStepExportTargets(...)` includes visible saved `format = "lcad"` models.
- Single-target export routes `lcad` through `runFeatureDSLExportInWorker(...)`.
- Merged export converts `lcad` targets to STEP text first, then passes that text to `runStepAssemblyExportInWorker(...)`.
- Imported STEP target behavior remains unchanged.

- [x] **Step 1: Write failing tests**

RED tests added:

```bash
npm --prefix website test -- project-step-export project-step-export-action
```

Expected failures were observed:

- `buildStepExportTargets(...)` omitted `lcad` models.
- `exportStepTarget(...)` treated an `lcad` target as STEP round-trip input and failed to publish the DSL-produced STEP text.
- `exportMergedStepTargets(...)` did not call `runFeatureDSLExport(...)` before compound STEP assembly.

- [x] **Step 2: Implement saved DSL export targets**

Implemented:

- `StepExportTarget.sourceFormat`.
- Saved parameter values on `lcad` export targets.
- `buildFeatureDSLKernelInput(...)` as a shared source parser for preview and export.
- Separate export using `feature-dsl-export` for `lcad` targets.
- Merged export that converts `lcad` targets to STEP text before compound STEP export.
- Project route wiring to pass `runFeatureDSLExportInWorker(...)` into both export modes.

- [x] **Step 3: Verify**

Run:

```bash
npm --prefix website test -- project-step-export project-step-export-action project-step-export-popover
npm --prefix website run build
```

Expected:

- Saved `.lcad.json` targets appear in the STEP export selection list.
- Separate saved DSL export publishes worker-produced STEP text.
- Merged export includes converted DSL STEP text and preserves existing STEP operation replay.
- Existing export failure feedback remains durable in the popover.

Verification result on 2026-07-11:

- `npm --prefix website test -- project-step-export project-step-export-action project-step-export-popover` passed with 3 files and 13 tests.
- `npm --prefix website run build` passed. Vite still reports the existing WASM large chunk and browser-externalized Node module warnings for the OCCT bundle.
- Real browser worker smoke through Vite/Chromium imported `buildFeatureDSLKernelInput(...)` and `runFeatureDSLExportInWorker(...)`; a saved-model-shaped `.lcad.json` source with `width = 96` returned STEP text beginning with `ISO-10303-21`, containing `END-ISO-10303-21`, and measuring 15403 bytes. The only console output was OCCT transfer statistics.

- [x] **Step 4: Final gates, review, docs, commit, and push**

Run:

```bash
git diff --check
task check
task test
task test-browser
git add website/src/views/project docs TODO.md AGENTS.md .agents/rules
git commit -m "feat(projects): export feature dsl models"
git push
```

Expected:

- Full repository checks pass.
- Code review finds no blocking issue.
- Documentation no longer says saved DSL export UI is future work.

Verification result on 2026-07-11:

- `npm --prefix website test -- project-feature-dsl-preview project-step-export project-step-export-action project-step-export-popover` passed with 4 files and 15 tests.
- `npm --prefix website run build` passed. Vite still reports the existing WASM large chunk and browser-externalized Node module warnings for the OCCT bundle.
- `git diff --check` passed.
- `task check` passed.
- `task test` passed with Go race tests and 43 frontend test files / 181 Vitest tests.
- `task test-browser` passed with the project workbench, History, and Assistant smoke.
- Code review found no blocking issue after narrowing the shared DSL helper return type to `CadKernelFeatureDSLInput`.
- Commit result: `feat(projects): export feature dsl models`, pushed to `origin/main`.

Remaining after this task:

- The DSL still supports only the minimal worker feature set from Task 11.
- Saved DSL exports do not imply durable B-rep feature graph, general CAD History integration, or arbitrary AI geometry mutation.
- OpenSCAD mesh preview/export remains unavailable until a compatible runtime is deliberately selected and bundled.

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
