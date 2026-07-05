import os
import re
import sys

import FreeCAD
import Import
import MeshPart


def obj_name(label: str, fallback: str) -> str:
    name = (label or fallback).strip() or fallback
    return re.sub(r"\s+", "_", name)


def discretize_edge(edge) -> list:
    try:
        points = edge.discretize(Deflection=0.6)
    except TypeError:
        points = edge.discretize(Number=8)
    if len(points) < 2:
        points = edge.discretize(Number=2)
    return points


def write_obj(mesh_objects: list[tuple[str, object, object]], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8") as output:
        output.write("# Created by LiteCAD FreeCAD preview converter\n")
        vertex_offset = 1
        for label, mesh, shape in mesh_objects:
            points, facets = mesh.Topology
            output.write(f"o {obj_name(label, 'PreviewMesh')}\n")
            for point in points:
                output.write(f"v {point.x:.6f} {point.y:.6f} {point.z:.6f}\n")
            for facet in facets:
                a, b, c = facet
                output.write(f"f {a + vertex_offset} {b + vertex_offset} {c + vertex_offset}\n")
            vertex_offset += len(points)

            output.write(f"o {obj_name(label, 'PreviewMesh')}_edges\n")
            for edge in shape.Edges:
                edge_points = discretize_edge(edge)
                indices = []
                for point in edge_points:
                    output.write(f"v {point.x:.6f} {point.y:.6f} {point.z:.6f}\n")
                    indices.append(vertex_offset)
                    vertex_offset += 1
                if len(indices) >= 2:
                    output.write("l " + " ".join(str(index) for index in indices) + "\n")


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: freecad_step_to_obj.py <input.step> <output.obj>", file=sys.stderr)
        return 2

    input_path = sys.argv[-2]
    output_path = sys.argv[-1]
    doc = FreeCAD.newDocument("litecad_preview")
    Import.insert(input_path, doc.Name)
    doc.recompute()

    mesh_objects = []
    for index, obj in enumerate(doc.Objects):
        if obj.TypeId != "Part::Feature" or not hasattr(obj, "Shape") or obj.Shape.isNull():
            continue
        if len(obj.Shape.Faces) == 0:
            continue
        mesh = MeshPart.meshFromShape(
            Shape=obj.Shape,
            LinearDeflection=0.12,
            AngularDeflection=0.18,
            Relative=False,
        )
        if mesh.CountFacets == 0:
            continue
        mesh_objects.append((obj.Label or obj.Name or f"PreviewMesh_{index}", mesh, obj.Shape))

    if not mesh_objects:
        print("no meshable STEP shapes found", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    write_obj(mesh_objects, output_path)
    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        print("OBJ export produced no data", file=sys.stderr)
        return 1
    return 0


raise SystemExit(main())
