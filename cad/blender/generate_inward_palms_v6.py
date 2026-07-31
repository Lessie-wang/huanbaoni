#!/usr/bin/env python3
"""Generate an open ring whose flush palms face the inner circle."""

from __future__ import annotations

import math
from pathlib import Path

from generate_printable_v1 import (
    Mesh,
    add,
    mesh_from_polygon_extrusion,
    mul,
    solid_png,
    validate_mesh,
    write_binary_stl,
    write_obj,
)
from generate_luxury_v2 import beam_xy
from generate_minimal_v4 import minimal_open_ring


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "inward_palms_v6"
PREVIEWS = ROOT / "cad" / "previews"


def point_from_basis(origin, tangent, inward, tangent_offset, inward_offset):
    return add(origin, add(mul(tangent, tangent_offset), mul(inward, inward_offset)))[:2]


def bent_finger(name, origin, tangent, inward, lane, z_half):
    start_tangent = 0.65 + lane * 1.08
    start = point_from_basis(origin, tangent, inward, start_tangent, 2.55)
    middle = point_from_basis(origin, tangent, inward, start_tangent - 0.08 + lane * 0.08, 4.35)
    end = point_from_basis(origin, tangent, inward, start_tangent - 0.22 + lane * 0.14, 6.20)
    mesh = Mesh(name)
    mesh.merge(beam_xy(name + "_base", start, middle, 1.05 - lane * 0.08, 0.82 - lane * 0.06, -z_half, z_half))
    mesh.merge(beam_xy(name + "_tip", middle, end, 0.82 - lane * 0.06, 0.62 - lane * 0.05, -z_half, z_half))
    return mesh


def inward_hand(name, side, major_radius, gap_degrees):
    mesh = Mesh(name)
    angle = math.radians(90 + gap_degrees / 2 if side == "left" else 90 - gap_degrees / 2)
    radial = (math.cos(angle), math.sin(angle), 0.0)
    inward = (-radial[0], -radial[1], 0.0)
    tangent = (math.sin(angle), -math.cos(angle), 0.0) if side == "left" else (-math.sin(angle), math.cos(angle), 0.0)
    origin = mul(radial, major_radius)

    palm = [
        point_from_basis(origin, tangent, inward, -0.8, -1.85),
        point_from_basis(origin, tangent, inward, 0.45, 2.25),
        point_from_basis(origin, tangent, inward, 3.35, 3.10),
        point_from_basis(origin, tangent, inward, 4.05, 1.10),
        point_from_basis(origin, tangent, inward, 3.25, -1.45),
        point_from_basis(origin, tangent, inward, 0.55, -2.15),
    ]
    mesh.merge(mesh_from_polygon_extrusion(name + "_palm", palm, -1.70, 1.70))

    for lane, z_half in enumerate((1.28, 1.17, 1.06)):
        mesh.merge(bent_finger(f"{name}_finger_{lane}", origin, tangent, inward, lane, z_half))

    thumb_start = point_from_basis(origin, tangent, inward, 2.55, -1.20)
    thumb_mid = point_from_basis(origin, tangent, inward, 2.55, 1.15)
    thumb_end = point_from_basis(origin, tangent, inward, 1.95, 3.25)
    mesh.merge(beam_xy(name + "_thumb_base", thumb_start, thumb_mid, 1.35, 1.0, -1.38, 1.38))
    mesh.merge(beam_xy(name + "_thumb_tip", thumb_mid, thumb_end, 1.0, 0.68, -1.38, 1.38))
    return mesh


def build_ring(inner_diameter):
    gap_degrees = 72
    name = f"feelingmosaic_inward_palms_ring_{inner_diameter:.1f}mm"
    ring = minimal_open_ring(name, inner_diameter, gap_degrees=gap_degrees, major_steps=72)
    major_radius = inner_diameter / 2 + math.hypot(1.75, 2.45) + 0.35
    ring.merge(inward_hand("left_inward_hand", "left", major_radius, gap_degrees))
    ring.merge(inward_hand("right_inward_hand", "right", major_radius, gap_degrees))
    return ring


def export(mesh):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_binary_stl(mesh, OUTPUT / f"{mesh.name}.stl")
    write_obj(mesh, OUTPUT / f"{mesh.name}.obj")
    bounds = mesh.bounds()
    dimensions = tuple(bounds[axis][1] - bounds[axis][0] for axis in range(3))
    print(mesh.name, "validation", validate_mesh(mesh), "dimensions", dimensions)


def main():
    rings = [build_ring(diameter) for diameter in (18.5, 19.5, 20.5)]
    for ring in rings:
        export(ring)
    palette = [(91, 89, 87)]
    solid_png(
        [rings[1]],
        PREVIEWS / "inward_palms_ring_v6_top.png",
        camera=(0.0, -0.15, 1.0),
        width=900,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "inward_palms_ring_v6_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "inward_palms_ring_v6_front.png",
        camera=(0.0, -1.0, 0.15),
        width=1100,
        height=720,
        palette=palette,
    )


if __name__ == "__main__":
    main()
