# Nested Assembly Semantics

Updated: 2026-07-14

This note defines the shipped CAD document schema v3 assembly boundary. It separates organizational nesting and suppression, which are implemented, from geometric mate solving and reusable subassembly documents, which are not.

## Shipped Model

One project CAD document owns one assembly root with three ordered collections:

- `groups`: nested organizational nodes with stable IDs, a `parent_group_id`, name, and direct suppression flag.
- `occurrences`: immutable model-revision bindings with a `parent_group_id`, name, order, direct suppression flag, and placement transform.
- `constraints`: validated relationship records. The only accepted kind is `mate`, and every stored record has status `unresolved`.

Groups may be nested to any acyclic depth. A group parent must exist, an occurrence parent must reference an existing group or the assembly root, and empty IDs, duplicate IDs, cycles, and dangling references are rejected. A group can be deleted only after its child groups and occurrences have been moved or deleted.

## Hierarchical Suppression

An occurrence is effectively suppressed when either of these conditions is true:

- the occurrence's own `suppressed` flag is true;
- any ancestor group is suppressed.

Effectively suppressed occurrences remain durable and reversible, but they are excluded from Three.js preview composition and STEP export selection. Restoring the occurrence or ancestor group makes it eligible again. This derivation is shared by backend validation, frontend preview assets, and export target selection.

## Mutation And History

Assembly mutations are owner-scoped, require `expected_revision`, and return `409 Conflict` for stale writes. The schema v3 API includes:

- `POST /api/v1/projects/:projectID/cad-document/groups`
- `PATCH /api/v1/projects/:projectID/cad-document/groups/:groupID`
- `DELETE /api/v1/projects/:projectID/cad-document/groups/:groupID`
- `POST /api/v1/projects/:projectID/cad-document/constraints`
- `DELETE /api/v1/projects/:projectID/cad-document/constraints/:constraintID`
- occurrence updates with `parent_group_id`

Group create/update/delete, occurrence regrouping, and mate-record create/delete append database-backed History commands. Undo and Redo materialize the corresponding document state and survive reloads and other signed-in browser sessions.

## Constraint Boundary

An unresolved mate record names two distinct existing occurrences. It is referential data only:

- it does not identify faces, edges, axes, or datum geometry;
- it does not compute degrees of freedom;
- it does not change either occurrence transform;
- it does not drive preview or export geometry;
- it does not claim a successful or failed solve.

Occurrence or source deletion is rejected while a constraint would be left dangling. A future solver-backed phase must define geometric references, solve inputs and outcomes, placement updates, conflict behavior, and History semantics before any mate can move geometry.

## Deliberate Limits

Schema v3 groups organize occurrences inside one project document. They are not separately versioned or reusable subassembly documents, and they do not preserve an imported STEP product hierarchy. Compound STEP export remains a geometry compound derived from effectively unsuppressed occurrence order and placement; it does not serialize LiteCAD groups as nested STEP assembly structure.
