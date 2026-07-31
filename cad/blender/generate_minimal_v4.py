#!/usr/bin/env python3
"""Generate the minimal open-circle FeelingMosaic ring V4."""

from __future__ import annotations

import math
from pathlib import Path

from generate_printable_v1 import (
    Mesh,
    add,
    mul,
    solid_png,
    validate_mesh,
    write_binary_stl,
    write_obj,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "minimal_v4"
PREVIEWS = ROOT / "cad" / "previews"


def minimal_open_ring(name, inner_diameter, gap_degrees=38, major_steps=72):
    """Create a clean C-ring with a subtle half twist and softened blunt ends."""
    mesh = Mesh(name)
    inner_radius = inner_diameter / 2
    radial_half = 1.75
    vertical_half = 2.45
    chamfer = 0.5
    max_extent = math.hypot(radial_half, vertical_half)
    major_radius = inner_radius + max_extent + 0.35
    section = [
        (-radial_half + chamfer, -vertical_half),
        (radial_half - chamfer, -vertical_half),
        (radial_half, -vertical_half + chamfer),
        (radial_half, vertical_half - chamfer),
        (radial_half - chamfer, vertical_half),
        (-radial_half + chamfer, vertical_half),
        (-radial_half, vertical_half - chamfer),
        (-radial_half, -vertical_half + chamfer),
    ]
    gap = math.radians(gap_degrees)
    start_angle = math.pi / 2 + gap / 2
    end_angle = math.pi / 2 - gap / 2 + 2 * math.pi
    section_size = len(section)
    taper_steps = 7

    for step in range(major_steps + 1):
        proportion = step / major_steps
        angle = start_angle + (end_angle - start_angle) * proportion
        twist = math.pi * proportion
        radial = (math.cos(angle), math.sin(angle), 0.0)
        center = mul(radial, major_radius)

        distance_to_end = min(step, major_steps - step)
        if distance_to_end < taper_steps:
            end_progress = distance_to_end / taper_steps
            smooth = end_progress * end_progress * (3 - 2 * end_progress)
            scale = 0.72 + 0.28 * smooth
        else:
            scale = 1.0

        for horizontal, vertical in section:
            horizontal *= scale
            vertical *= scale
            radial_offset = horizontal * math.cos(twist) - vertical * math.sin(twist)
            z_offset = horizontal * math.sin(twist) + vertical * math.cos(twist)
            mesh.vertices.append(add(center, add(mul(radial, radial_offset), (0.0, 0.0, z_offset))))

    for step in range(major_steps):
        row = step * section_size
        next_row = row + section_size
        for index in range(section_size):
            next_index = (index + 1) % section_size
            mesh.faces.append((row + index, row + next_index, next_row + next_index))
            mesh.faces.append((row + index, next_row + next_index, next_row + index))

    start_center = len(mesh.vertices)
    mesh.vertices.append(tuple(sum(mesh.vertices[index][axis] for index in range(section_size)) / section_size for axis in range(3)))
    end_row = major_steps * section_size
    end_center = len(mesh.vertices)
    mesh.vertices.append(tuple(sum(mesh.vertices[end_row + index][axis] for index in range(section_size)) / section_size for axis in range(3)))
    for index in range(section_size):
        next_index = (index + 1) % section_size
        mesh.faces.append((start_center, next_index, index))
        mesh.faces.append((end_center, end_row + index, end_row + next_index))
    return mesh


def export(mesh):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_binary_stl(mesh, OUTPUT / f"{mesh.name}.stl")
    write_obj(mesh, OUTPUT / f"{mesh.name}.obj")
    bounds = mesh.bounds()
    dimensions = tuple(bounds[axis][1] - bounds[axis][0] for axis in range(3))
    print(mesh.name, "validation", validate_mesh(mesh), "dimensions", dimensions)


def main():
    rings = [
        minimal_open_ring(f"feelingmosaic_minimal_open_ring_{diameter:.1f}mm", diameter)
        for diameter in (18.5, 19.5, 20.5)
    ]
    for ring in rings:
        export(ring)
    palette = [(92, 90, 88)]
    solid_png(
        [rings[1]],
        PREVIEWS / "minimal_ring_v4_top.png",
        camera=(0.0, -0.15, 1.0),
        width=900,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "minimal_ring_v4_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "minimal_ring_v4_front.png",
        camera=(0.0, -1.0, 0.15),
        width=1100,
        height=720,
        palette=palette,
    )


if __name__ == "__main__":
    main()
