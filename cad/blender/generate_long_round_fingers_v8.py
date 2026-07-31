#!/usr/bin/env python3
"""Generate an upright embracing ring with longer, round fingers."""

from __future__ import annotations

import math
from pathlib import Path

from generate_printable_v1 import (
    Mesh,
    capsule,
    mesh_from_polygon_extrusion,
    solid_png,
    validate_mesh,
    write_binary_stl,
    write_obj,
)
from generate_minimal_v4 import minimal_open_ring
from generate_standing_palms_v7 import minimum_vertex_clearance, stand_hand


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "long_round_fingers_v8"
PREVIEWS = ROOT / "cad" / "previews"


def polar(radius, angle_degrees, z=0.0):
    angle = math.radians(angle_degrees)
    return (radius * math.cos(angle), radius * math.sin(angle), z)


def round_arc(name, radius, start_angle, end_angle, finger_radius, segments=4):
    mesh = Mesh(name)
    points = [
        polar(radius, start_angle + (end_angle - start_angle) * index / segments)
        for index in range(segments + 1)
    ]
    for index in range(segments):
        mesh.merge(capsule(f"{name}_{index}", points[index], points[index + 1], finger_radius))
    return mesh


def rounded_hand(name, side, major_radius, gap_degrees, spread_thumb=False):
    mesh = Mesh(name)
    direction = -1 if side == "left" else 1
    endpoint_angle = 90 + gap_degrees / 2 if side == "left" else 90 - gap_degrees / 2
    palm_inner_angle = endpoint_angle + direction * 8
    palm_outer_angle = endpoint_angle + direction * 17
    ring_inner = major_radius - 2.2
    ring_outer = major_radius + 2.2

    palm = [
        polar(ring_inner, endpoint_angle - direction * 2)[:2],
        polar(ring_outer, endpoint_angle - direction)[:2],
        polar(ring_outer + 0.15, palm_inner_angle)[:2],
        polar(ring_outer - 0.25, palm_outer_angle)[:2],
        polar(ring_inner + 0.25, palm_outer_angle + direction * 1.5)[:2],
        polar(ring_inner - 0.25, palm_inner_angle)[:2],
    ]
    mesh.merge(mesh_from_polygon_extrusion(name + "_palm", palm, -1.55, 1.55))

    finger_specs = [
        (major_radius + 1.35, palm_outer_angle - direction * 1.5, 95 if side == "left" else 85, 0.72),
        (major_radius + 0.10, palm_outer_angle - direction * 0.5, 96 if side == "left" else 84, 0.68),
        (major_radius - 1.10, palm_outer_angle + direction * 0.5, 97 if side == "left" else 83, 0.64),
    ]
    for index, (radius, start, end, finger_radius) in enumerate(finger_specs):
        mesh.merge(round_arc(f"{name}_finger_{index}", radius, start, end, finger_radius))

    if spread_thumb:
        thumb_start = polar(major_radius - 1.65, palm_inner_angle - direction * 1.5)
        thumb_middle = polar(major_radius - 3.00, palm_inner_angle + direction * 6.0)
        thumb_end = polar(major_radius - 3.55, palm_inner_angle + direction * 11.5)
        mesh.merge(capsule(name + "_thumb_base", thumb_start, thumb_middle, 0.78))
        mesh.merge(capsule(name + "_thumb_tip", thumb_middle, thumb_end, 0.74))
    else:
        thumb_end = 97.5 if side == "left" else 82.5
        mesh.merge(
            round_arc(
                name + "_thumb",
                major_radius - 2.05,
                palm_inner_angle,
                thumb_end,
                0.72,
                segments=4,
            )
        )
    return mesh


def build_ring(inner_diameter):
    gap_degrees = 68
    name = f"feelingmosaic_long_round_fingers_ring_{inner_diameter:.1f}mm"
    ring = minimal_open_ring(name, inner_diameter, gap_degrees=gap_degrees, major_steps=72)
    major_radius = inner_diameter / 2 + math.hypot(1.75, 2.45) + 0.35
    left_hand = stand_hand(
        rounded_hand("left_round_hand", "left", major_radius, gap_degrees),
        "left",
        major_radius,
        gap_degrees,
    )
    right_hand = stand_hand(
        rounded_hand("right_round_hand", "right", major_radius, gap_degrees),
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
        PREVIEWS / "long_round_fingers_ring_v8_gap.png",
        camera=(0.0, 0.92, 0.38),
        width=1100,
        height=820,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "long_round_fingers_ring_v8_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "long_round_fingers_ring_v8_top.png",
        camera=(0.0, -0.15, 1.0),
        width=900,
        height=900,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "long_round_fingers_ring_v8_front.png",
        camera=(0.0, -1.0, 0.12),
        width=1100,
        height=720,
        palette=palette,
    )


if __name__ == "__main__":
    main()
