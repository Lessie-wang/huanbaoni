#!/usr/bin/env python3
"""Generate an open ring with both complete hands rotated upright."""

from __future__ import annotations

import math
from pathlib import Path

from generate_printable_v1 import Mesh, solid_png, validate_mesh, write_binary_stl, write_obj
from generate_flush_hands_v5 import flush_hand
from generate_minimal_v4 import minimal_open_ring


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "standing_palms_v7"
PREVIEWS = ROOT / "cad" / "previews"


def dot(left, right):
    return sum(left[index] * right[index] for index in range(3))


def cross(left, right):
    return (
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    )


def rotate_around_axis(point, origin, axis, angle_radians):
    relative = tuple(point[index] - origin[index] for index in range(3))
    cosine = math.cos(angle_radians)
    sine = math.sin(angle_radians)
    axis_cross = cross(axis, relative)
    axis_projection = dot(axis, relative) * (1.0 - cosine)
    rotated = tuple(
        relative[index] * cosine + axis_cross[index] * sine + axis[index] * axis_projection
        for index in range(3)
    )
    return tuple(origin[index] + rotated[index] for index in range(3))


def stand_hand(hand, side, major_radius, gap_degrees):
    endpoint_angle = math.radians(90 + gap_degrees / 2 if side == "left" else 90 - gap_degrees / 2)
    origin = (major_radius * math.cos(endpoint_angle), major_radius * math.sin(endpoint_angle), 0.0)
    if side == "left":
        tangent = (math.sin(endpoint_angle), -math.cos(endpoint_angle), 0.0)
        rotation = math.pi / 2
    else:
        tangent = (-math.sin(endpoint_angle), math.cos(endpoint_angle), 0.0)
        rotation = -math.pi / 2
    hand.vertices = [rotate_around_axis(vertex, origin, tangent, rotation) for vertex in hand.vertices]
    return hand


def minimum_vertex_clearance(left, right):
    return min(
        math.dist(left_vertex, right_vertex)
        for left_vertex in left.vertices
        for right_vertex in right.vertices
    )


def build_ring(inner_diameter):
    gap_degrees = 68
    name = f"feelingmosaic_standing_palms_ring_{inner_diameter:.1f}mm"
    ring = minimal_open_ring(name, inner_diameter, gap_degrees=gap_degrees, major_steps=72)
    major_radius = inner_diameter / 2 + math.hypot(1.75, 2.45) + 0.35
    left_hand = stand_hand(
        flush_hand("left_standing_hand", "left", major_radius, gap_degrees),
        "left",
        major_radius,
        gap_degrees,
    )
    right_hand = stand_hand(
        flush_hand("right_standing_hand", "right", major_radius, gap_degrees),
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
        PREVIEWS / "standing_palms_ring_v7_top.png",
        camera=(0.0, -0.15, 1.0),
        width=900,
        height=900,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "standing_palms_ring_v7_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "standing_palms_ring_v7_front.png",
        camera=(0.0, -1.0, 0.12),
        width=1100,
        height=720,
        palette=palette,
    )
    solid_png(
        [ring],
        PREVIEWS / "standing_palms_ring_v7_gap.png",
        camera=(0.0, 0.92, 0.38),
        width=1100,
        height=820,
        palette=palette,
    )


if __name__ == "__main__":
    main()
