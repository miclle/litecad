# Nested Assembly And Point-Mate Semantics

Updated: 2026-07-15

This note defines the shipped CAD document schema v4 assembly boundary. It separates implemented organizational nesting and deterministic point-translation solving from general mechanical constraint solving and reusable subassembly documents, which remain future work.

## Shipped Model

One project CAD document owns one assembly root with three ordered collections:

- `groups`: nested organizational nodes with stable IDs, a `parent_group_id`, name, and direct suppression flag.
- `occurrences`: immutable model-revision bindings with a `parent_group_id`, name, order, direct suppression flag, and affine placement transform.
- `constraints`: legacy unresolved mate records or solver-backed `point-coincident-v1` mates.

Groups may be nested to any acyclic depth. A group parent must exist, an occurrence parent must reference an existing group or the assembly root, and empty IDs, duplicate IDs, cycles, and dangling references are rejected. A group can be deleted only after its child groups and occurrences have been moved or deleted.

## Hierarchical Suppression

An occurrence is effectively suppressed when either of these conditions is true:

- the occurrence's own `suppressed` flag is true;
- any ancestor group is suppressed.

Effectively suppressed occurrences remain durable and reversible, but they are excluded from Three.js preview composition and STEP export selection. Restoring the occurrence or ancestor group makes it eligible again. This derivation is shared by backend validation, frontend preview assets, and export target selection.

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
- occurrence updates with `parent_group_id`, suppression, naming, and placement

Group, occurrence, and mate changes append database-backed History commands. Creating a point mate records its initial driven-placement adjustment. Moving a driver records every downstream occurrence changed by the solve. Undo and Redo restore all affected placements together, materialize the corresponding document state, and survive reloads and other signed-in browser sessions. The legacy model/node transform API follows the same driver/driven rules and cannot bypass the solver.

Deleting a mate leaves the current occurrence placement in place and releases the driven occurrence for direct editing. Occurrence or source deletion is rejected while any constraint would be left dangling.

## Legacy Schema V3 Records

Schema v3 `mate` records with `status: unresolved` upgrade to schema v4 without a solver, anchors, or geometry movement. They remain reversible referential records so existing documents are not silently repositioned. New mate creation always produces a solved `point-coincident-v1` record.

## Deliberate Limits

Schema v4 groups still organize occurrences inside one project document. They are not separately versioned or reusable subassembly documents, and they do not preserve an imported STEP product hierarchy. Compound STEP export remains a geometry compound derived from effectively unsuppressed occurrence order and solved placement; it does not serialize LiteCAD groups or constraints as nested STEP assembly structure.
