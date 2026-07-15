# Nested Assembly, Point-Mate, And Reusable Snapshot Semantics

Updated: 2026-07-15

This note defines the shipped CAD document schema v4 assembly boundary. It separates implemented organizational nesting, deterministic point-translation solving, and immutable project-local reusable-assembly snapshots from general mechanical constraint solving and live, nested, or cross-project subassembly documents, which remain future work.

## Shipped Model

One project CAD document owns one assembly root with four ordered collections:

- `groups`: nested organizational nodes with stable IDs, a `parent_group_id`, name, direct suppression flag, and optional reusable-definition ID/revision tags on instantiated groups.
- `occurrences`: immutable model-revision bindings with a `parent_group_id`, name, order, direct suppression flag, affine placement transform, and optional reusable member ID.
- `constraints`: legacy unresolved mate records or solver-backed `point-coincident-v1` mates.
- `subassemblies`: immutable project-local definition revisions whose members pin node/model/revision identity, name, suppression, and a transform relative to the capture origin.

Groups may be nested to any acyclic depth. A group parent must exist, an occurrence parent must reference an existing group or the assembly root, and empty IDs, duplicate IDs, cycles, and dangling references are rejected. A group can be deleted only after its child groups and occurrences have been moved or deleted.

## Hierarchical Suppression

An occurrence is effectively suppressed when either of these conditions is true:

- the occurrence's own `suppressed` flag is true;
- any ancestor group is suppressed.

Effectively suppressed occurrences remain durable and reversible, but they are excluded from Three.js preview composition and STEP export selection. Restoring the occurrence or ancestor group makes it eligible again. This derivation is shared by backend validation, frontend preview assets, and export target selection.

## Reusable Assembly Snapshots

Capture accepts one ordinary leaf group with at least one direct ordinary occurrence. The group may not contain child groups, linked reusable members, or be an existing reusable instance. Revision 1 stores the direct occurrences in their current order and pins each member's node ID, model ID, immutable model revision ID, name, suppression, and affine transform. Translation is normalized against the first member, so that member becomes the definition origin while all relative offsets and linear transforms are preserved.

Instantiation creates one tagged organizational group and expands every definition member into an ordinary occurrence at an explicit XYZ translation. An optional parent must be an ordinary group rather than another reusable instance. Preview, inspection, hierarchical suppression, separate export, and compound export therefore keep using the existing occurrence pipeline instead of a second geometry representation.

Expanded member occurrences are immutable. They cannot be renamed, reordered, regrouped, suppressed independently, duplicated, deleted, transformed, used as mate endpoints, deleted through their source node/model, or updated to a model's newer current revision. The tagged instance group cannot be renamed, reparented, nested into, or deleted; version 1 intentionally supports only whole-instance suppression and reversible creation. Capturing a definition does not alter the source group or its original occurrences.

Definitions and existing instances do not live-update. Editing or restoring the current source model revision affects ordinary occurrences while already instantiated members remain pinned to the revision captured by their definition.

## Point-Mate Solver

A new mate uses `solver: point-coincident-v1` and `status: solved`. The first occurrence is the driver and the second is the driven occurrence. Each side stores one occurrence-local anchor point plus a world-space offset. The server preserves the driven occurrence's existing 3 x 3 linear transform and solves only its translation so:

```text
world(driver_anchor) + offset = world(driven_anchor)
```

The residual is the Euclidean distance between those two world-space points after solving. Solver constraints form a directed acyclic graph: a driven occurrence has at most one inbound point mate, a driver may feed multiple downstream mates, and cycles are rejected. Moving a driver resolves its complete downstream graph in the same expected-revision transaction. The Inspector inputs and canvas transform control are read-only for a driven occurrence; move its driver or delete the mate instead.

This is a point-translation solver. It does not solve rotation, degrees of freedom, planes, axes, concentricity, tangency, tolerance stacks, over-constraints, or topology-selected geometric references.

## Mutation And History

Assembly mutations are owner-scoped, require `expected_revision`, and return `409 Conflict` for stale writes. The schema v4 API includes:

- `POST /api/v1/projects/:projectID/cad-document/groups`
- `PATCH /api/v1/projects/:projectID/cad-document/groups/:groupID`
- `DELETE /api/v1/projects/:projectID/cad-document/groups/:groupID`
- `POST /api/v1/projects/:projectID/cad-document/constraints`
- `DELETE /api/v1/projects/:projectID/cad-document/constraints/:constraintID`
- `POST /api/v1/projects/:projectID/cad-document/subassemblies`
- `POST /api/v1/projects/:projectID/cad-document/subassemblies/:definitionID/instances`
- occurrence updates with `parent_group_id`, suppression, naming, and placement

Group, occurrence, mate, reusable-definition capture, and reusable-instance creation changes append database-backed History commands. Creating a point mate records its initial driven-placement adjustment. Moving a driver records every downstream occurrence changed by the solve. Capturing a definition records `subassembly-definition-create`; creating a tagged group with all expanded members records one `subassembly-instance-create`. Undo and Redo restore the complete affected definition or instance together, materialize the corresponding document state, and survive reloads and other signed-in browser sessions. The legacy model/node transform API follows the same driver/driven and reusable-member rules and cannot bypass them.

Deleting a mate leaves the current occurrence placement in place and releases the driven occurrence for direct editing. Occurrence or source deletion is rejected while any constraint would be left dangling.

## Legacy Schema V3 Records

Schema v3 `mate` records with `status: unresolved` upgrade to schema v4 without a solver, anchors, or geometry movement. They remain reversible referential records so existing documents are not silently repositioned. New mate creation always produces a solved `point-coincident-v1` record.

## Deliberate Limits

Schema v4 reusable definitions are immutable revision-1 snapshots inside one project document. They do not yet support definition evolution, rename/delete lifecycle, nested definitions or instances, live propagation, cross-project libraries, editable linked members, or serialized OCCT document state. They also do not preserve an imported STEP product hierarchy. Compound STEP export remains a geometry compound derived from effectively unsuppressed expanded occurrence order and solved or pinned placement; it does not serialize LiteCAD groups, reusable-definition identity, or constraints as nested STEP assembly structure.
