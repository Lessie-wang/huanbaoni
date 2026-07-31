#!/usr/bin/env python3
"""Generate the printable upright-hand ring with visibly opened thumbs."""

from __future__ import annotations

import math
from pathlib import Path

from generate_long_round_fingers_v8 import rounded_hand
from generate_minimal_v4 import minimal_open_ring
from generate_printable_v1 import solid_png, validate_mesh, write_binary_stl, write_obj
from generate_standing_palms_v7 import minimum_vertex_clearance, stand_hand


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "open_thumbs_v9"
PREVIEWS = ROOT / "cad" / "previews"


def build_ring(inner_diameter):
    gap_degrees = 68
    name = f"feelingmosaic_open_thumbs_ring_{inner_diameter:.1f}mm"
    ring = minimal_open_ring(name, inner_diameter, gap_degrees=gap_degrees, major_steps=72)
    major_radius = inner_diameter / 2 + math.hypot(1.75, 2.45) + 0.35
    left_hand = stand_hand(
        rounded_hand("left_open_thumb_hand", "left", major_radius, gap_degrees, spread_thumb=True),
        "left",
        major_radius,
        gap_degrees,
    )
    right_hand = stand_hand(
        rounded_hand("right_open_thumb_hand", "right", major_radius, gap_degrees, spread_thumb=True),
        "right",
        major_radius,
        gap_degrees,
    )
    clearance = minimum_vertex_clearance(left_hand, right_hand)
    ring.merge(left_hand)
    ring.merge(right_hand)
    return ring, clearance


def export(mesh, clearance):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_binary_stl(mesh, OUTPUT / f"{mesh.name}.stl")
    write_obj(mesh, OUTPUT / f"{mesh.name}.obj")
    bounds = mesh.bounds()
    dimensions = tuple(bounds[axis][1] - bounds[axis][0] for axis in range(3))
    print(mesh.name, "validation", validate_mesh(mesh), "dimensions", dimensions, "clearance", clearance)


def main():
    built = [build_ring(diameter) for diameter in (18.5, 19.5, 20.5)]
    for ring, clearance in built:
        export(ring, clearance)
    ring = built[1][0]
    palette = [(91, 89, 87)]
    solid_png(
        [ring],
        PREVIEWS / "open_thumbs_ring_v9_gap.png",
        camera=(0.0, 0.92, 0.38),
        width=1100,
        height=820,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "open_thumbs_ring_v9_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "open_thumbs_ring_v9_front.png",
        camera=(0.0, -1.0, 0.12),
        width=1100,
        height=720,
        palette=palette,
    )


if __name__ == "__main__":
    main()
