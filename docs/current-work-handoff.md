# Current Work Handoff

Updated: 2026-07-28

This is the operational cross-machine entrypoint for the current LiteCAD mainline. Stable product facts live in `README.md`; active follow-up work lives in `TODO.md`; deeper CAD boundaries live in the focused documents linked below.

## Current Mainline

- Development is on `main`, with `origin/main` as the shared integration branch.
- The product baseline immediately before this documentation refresh is `b345559 feat(cad): simplify position link management`.
- The preceding user-visible mainline increments are `c52ea72 feat(assistant): stream chat responses` and `5604311 feat(website): add interactive homepage preview`.
- Completed implementation plans have been reduced to short historical summaries under `docs/superpowers/plans/`; use current docs and code for capability truth.

## Recent Shipped Boundaries

### Landing Page And Workbench Data

- The public landing page lazy-loads a self-contained Three.js mechanical-flange sample with shared orientation controls, drag/zoom/keyboard interaction, reduced-motion handling, bilingual accessible copy, idle render-loop suspension, and an explicit WebGL-unavailable fallback.
- That flange is labeled sample content. It is not a project model, persisted source, preview artifact, or editable CAD document.
- The project workbench remains data-driven: its model geometry comes from project-owned source bytes, browser-kernel meshes, saved LiteCAD DSL models, or backend-published preview artifacts. It must not substitute decorative geometry for missing project data.

### Assistant Streaming

- Ordinary Assistant sends use authenticated POST SSE at `/api/v1/projects/:projectID/agent/conversations/:conversationID/messages/stream`; the JSON message route remains for compatibility.
- The backend emits truthful execution stages, streams only provider-supplied reasoning summaries and content, persists the final result, and uses a persisted `client_request_id` to reconcile an exact response after a post-persistence disconnect.
- Route or conversation replacement aborts the browser request; stale callbacks are ignored. Partial output is retained with explicit recovery guidance when a stream fails.
- Deterministic browser tests do not prove live provider credentials, model compatibility, or network reachability. Use `task smoke-ai-provider` against a running server when those inputs change.

### Position Links And Assembly Semantics

- CAD document schema v4 stores deterministic `point-coincident-v1` mates. The first occurrence drives the second occurrence's translation from two local anchors and a world offset through an acyclic, single-inbound solver graph.
- Raw anchor and offset authoring remains available through the owner-scoped API, not the default workbench. When no constraints exist, the sidebar omits the section; existing records appear only in collapsed advanced position-link management and can be removed.
- Solved records identify the follower and driver. Migrated `status: unresolved` records are labeled as inactive legacy links and never move geometry or claim a following relationship.
- Driven occurrence placement remains read-only in both Inspector inputs and Three.js transform controls. Deleting a solved link leaves the current placement in place and releases the occurrence for direct editing.
- The complete grouping, solver, migration, History, and immutable reusable-snapshot contract is in `docs/nested-assembly-semantics.md`.

### Browser CAD Kernel And Saved Models

- STEP/STP preview and export use the browser OCCT worker. Workbench preview/export respects immutable occurrence revisions, nested group suppression, solver-resolved placement, reusable-instance pinned placement, constrained box-union replay, and selected separate or compound STEP output.
- Saved LiteCAD Feature DSL models support browser-kernel preview/export, immutable source revisions, parameter editing, recursive stable-node graph editing, and reversible History. OCCT shapes and Three.js buffers remain derived runtime state.
- Preview-visible AABB measurements remain separate from exact aggregate OCCT B-rep inspection records. Section-edge STEP artifacts use immutable association generations with explicit stale/current/superseded state and user-triggered regeneration.
- OpenSCAD remains a parameter-editable source-draft format without bundled browser compilation, normal Save as model, or project export under the current runtime decision.

## Verification Baseline

The `b345559` product baseline passed:

```bash
task check
task test
task test-browser
```

- `task test` passed the Go race/coverage suite and 89 Vitest files / 468 frontend tests. The full Vitest run still emits the existing Node `MaxListenersExceededWarning` warnings.
- `task test-browser` passed all 20 Playwright workflows, including the interactive landing sample/WebGL fallback, route protection, import, History, existing position-link management, reusable snapshots, inspection/section flows, Assistant generation and persistence, and STEP export.
- This documentation refresh passed `task --list`, `git diff --check`, local Markdown-link validation, and `task check` before commit.

## Active Roadmap

Use `TODO.md` as the authoritative active list. The highest-level open decisions are:

- design a novice-facing canvas or automatically derived position-link creation flow before returning mate authoring to the default workbench;
- define reusable-subassembly definition revision evolution, rename/delete lifecycle, and safe pinned-instance behavior before nested/live/cross-project reuse;
- define cross-revision topology mapping before user-selectable point/edge/face measurements or topology-bound feature authoring;
- decide whether explicit section generations become automatic or CAD-document-integrated associative features;
- continue the LiteCAD Feature DSL only through narrow end-to-end slices spanning backend validation, provider prompting, browser preview/export, tests, and docs;
- define launch-time source/artifact retention, quotas, backups, and operator procedures.

Do not describe durable editable B-rep state, general rotational/mechanical mates, live-linked reusable documents, preserved source STEP assembly structure, cross-model editable booleans, successful OpenSCAD browser compilation, or AI tool calls that directly mutate CAD documents as shipped.

## Focused Documentation

- `README.md` — user-facing product, setup, configuration, workflows, and current limits.
- `TODO.md` — unfinished product, data, and operations work.
- `docs/browser-cad-kernel-roadmap.md` — browser-kernel architecture and completed phase history.
- `docs/nested-assembly-semantics.md` — schema v4 grouping, point-translation solver, legacy records, and reusable snapshots.
- `docs/ai-parametric-assistant.md` — current Assistant and LiteCAD Feature DSL workflow.
- `docs/openscad-browser-runtime-decision.md` — bundled OpenSCAD runtime rejection and reconsideration gates.
- `docs/production-deployment.md` — single-binary build, runtime configuration, reverse-proxy SSE requirements, and release checks.

## Resume Checklist

For an existing checkout:

```bash
git fetch origin
git switch main
git pull --ff-only
git status --short --branch
task install
task check
```

For a fresh checkout, clone the repository and run the same `task install` and `task check` steps on `main`. Use `git log -1 --oneline` and `git rev-list --left-right --count main...origin/main` to confirm the local and remote branch state instead of relying on an old commit named in a handoff.

Database contents, browser-local workspace preferences, AI provider secrets, and `cmd/litecad/config.local.yaml` are machine-local and are not transferred through Git. Recreate local configuration from `cmd/litecad/config.example.yaml`; never commit credentials, private hosts, or production DSNs.
