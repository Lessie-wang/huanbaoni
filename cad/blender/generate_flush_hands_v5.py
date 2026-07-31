#!/usr/bin/env python3
"""Generate a geometric open ring with hands flowing along the circle."""

from __future__ import annotations

import math
from pathlib import Path

from generate_printable_v1 import (
    Mesh,
    mesh_from_polygon_extrusion,
    solid_png,
    validate_mesh,
    write_binary_stl,
    write_obj,
)
from generate_luxury_v2 import beam_xy
from generate_minimal_v4 import minimal_open_ring


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "flush_hands_v5"
PREVIEWS = ROOT / "cad" / "previews"


def polar(radius, angle_degrees):
    angle = math.radians(angle_degrees)
    return (radius * math.cos(angle), radius * math.sin(angle))


def curved_finger(name, radius, start_angle, end_angle, width_start, width_end, z_half, segments=4):
    mesh = Mesh(name)
    points = [
        polar(radius, start_angle + (end_angle - start_angle) * index / segments)
        for index in range(segments + 1)
    ]
    for index in range(segments):
        proportion = index / max(1, segments - 1)
        next_proportion = (index + 1) / segments
        start_width = width_start + (width_end - width_start) * proportion
        end_width = width_start + (width_end - width_start) * next_proportion
        mesh.merge(
            beam_xy(
                f"{name}_{index}",
                points[index],
                points[index + 1],
                start_width,
                end_width,
                -z_half,
                z_half,
            )
        )
    return mesh


def flush_hand(name, side, major_radius, gap_degrees):
    """A palm and fingers that remain inside the ring's height envelope."""
    mesh = Mesh(name)
    direction = -1 if side == "left" else 1
    endpoint_angle = 90 + gap_degrees / 2 if side == "left" else 90 - gap_degrees / 2
    palm_inner_angle = endpoint_angle + direction * 8
    palm_outer_angle = endpoint_angle + direction * 17

    ring_inner = major_radius - 2.2
    ring_outer = major_radius + 2.2
    palm = [
        polar(ring_inner, endpoint_angle - direction * 2),
        polar(ring_outer, endpoint_angle - direction * 1),
        polar(ring_outer + 0.15, palm_inner_angle),
        polar(ring_outer - 0.25, palm_outer_angle),
        polar(ring_inner + 0.25, palm_outer_angle + direction * 1.5),
        polar(ring_inner - 0.25, palm_inner_angle),
    ]
    mesh.merge(mesh_from_polygon_extrusion(name + "_palm", palm, -1.72, 1.72))

    # Three parallel fingers continue around the same circle instead of lifting
    # away from it. Each lane ends before the centre, preserving a 5-6 mm gap.
    finger_specs = [
        (major_radius + 1.35, palm_outer_angle - direction * 1.5, 99 if side == "left" else 81, 1.05, 0.68, 1.28),
        (major_radius + 0.10, palm_outer_angle - direction * 0.5, 98 if side == "left" else 82, 0.98, 0.64, 1.18),
        (major_radius - 1.10, palm_outer_angle + direction * 0.5, 97 if side == "left" else 83, 0.90, 0.60, 1.08),
    ]
    for index, spec in enumerate(finger_specs):
        radius, start, end, width_start, width_end, z_half = spec
        mesh.merge(
            curved_finger(
                f"{name}_finger_{index}",
                radius,
                start,
                end,
                width_start,
                width_end,
                z_half,
            )
        )

    # A low thumb follows the inner arc; it does not rise above the palm.
    thumb_radius = major_radius - 2.05
    thumb_end = 101 if side == "left" else 79
    mesh.merge(
        curved_finger(
            name + "_thumb",
            thumb_radius,
            palm_inner_angle,
            thumb_end,
            1.35,
            0.74,
            1.42,
            segments=4,
        )
    )
    return mesh


def build_ring(inner_diameter):
    gap_degrees = 68
    name = f"feelingmosaic_flush_hands_ring_{inner_diameter:.1f}mm"
    ring = minimal_open_ring(name, inner_diameter, gap_degrees=gap_degrees, major_steps=72)
    radial_half = 1.75
    vertical_half = 2.45
    major_radius = inner_diameter / 2 + math.hypot(radial_half, vertical_half) + 0.35
    ring.merge(flush_hand("left_flush_hand", "left", major_radius, gap_degrees))
    ring.merge(flush_hand("right_flush_hand", "right", major_radius, gap_degrees))
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
        PREVIEWS / "flush_hands_ring_v5_top.png",
        camera=(0.0, -0.15, 1.0),
        width=900,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "flush_hands_ring_v5_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "flush_hands_ring_v5_front.png",
        camera=(0.0, -1.0, 0.15),
        width=1100,
        height=720,
        palette=palette,
    )


if __name__ == "__main__":
    main()
