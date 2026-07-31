#!/usr/bin/env python3
"""Generate the open-ended geometric FeelingMosaic ring V3."""

from __future__ import annotations

from pathlib import Path

from generate_printable_v1 import (
    Mesh,
    mesh_from_polygon_extrusion,
    solid_png,
    validate_mesh,
    write_binary_stl,
    write_obj,
)
from generate_luxury_v2 import beam_xy, faceted_mobius_arc


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "open_v3"
PREVIEWS = ROOT / "cad" / "previews"


def angular_embrace_terminal(name, endpoint, side, major_radius):
    """Create one abstract hand that reaches inward without closing the gap."""
    mesh = Mesh(name)
    sign = 1 if side == "left" else -1
    cuff_tip = (endpoint[0] + sign * 1.5, endpoint[1] + 0.75)
    mesh.merge(beam_xy(name + "_cuff", endpoint[:2], cuff_tip, 5.1, 4.1, -2.7, 2.7))

    palm = [
        (cuff_tip[0] - sign * 0.9, cuff_tip[1] - 1.9),
        (cuff_tip[0] + sign * 2.2, cuff_tip[1] - 1.35),
        (cuff_tip[0] + sign * 2.75, cuff_tip[1] + 0.1),
        (cuff_tip[0] + sign * 1.65, cuff_tip[1] + 2.0),
        (cuff_tip[0] - sign * 1.0, cuff_tip[1] + 1.5),
    ]
    mesh.merge(mesh_from_polygon_extrusion(name + "_palm", palm, -2.35, 2.35))

    # Three tapered fingers form a restrained fan. Their tips deliberately stop
    # before the centre line, preserving the open "embrace" negative space.
    target_x = -sign * 2.65
    target_y = major_radius + 2.55
    origins = [
        (cuff_tip[0] + sign * 2.1, cuff_tip[1] - 0.75),
        (cuff_tip[0] + sign * 2.55, cuff_tip[1] + 0.15),
        (cuff_tip[0] + sign * 1.95, cuff_tip[1] + 1.0),
    ]
    targets = [
        (target_x, target_y - 1.3),
        (target_x - sign * 0.15, target_y),
        (target_x + sign * 0.2, target_y + 1.25),
    ]
    widths = [(1.15, 0.72), (1.05, 0.68), (0.95, 0.64)]
    heights = [(-1.75, 1.75), (-1.52, 1.52), (-1.28, 1.28)]
    for index, (origin, target) in enumerate(zip(origins, targets)):
        mesh.merge(
            beam_xy(
                f"{name}_finger_{index}",
                origin,
                target,
                widths[index][0],
                widths[index][1],
                heights[index][0],
                heights[index][1],
            )
        )

    # The lower blade reads as a thumb and frames the empty centre from below.
    thumb_origin = (cuff_tip[0] + sign * 1.4, cuff_tip[1] - 1.35)
    thumb_target = (-sign * 3.25, major_radius + 0.55)
    mesh.merge(beam_xy(name + "_thumb", thumb_origin, thumb_target, 1.55, 0.85, -1.9, 1.9))

    # A short upper facet gives the terminal a jewellery-setting silhouette
    # without introducing a stone or closing the opening.
    upper_origin = (cuff_tip[0] + sign * 1.05, cuff_tip[1] + 1.3)
    upper_target = (-sign * 3.5, major_radius + 4.0)
    mesh.merge(beam_xy(name + "_upper_guard", upper_origin, upper_target, 1.35, 0.78, -1.35, 1.35))
    return mesh


def build_open_ring(inner_diameter):
    name = f"feelingmosaic_open_embrace_ring_{inner_diameter:.1f}mm"
    ring, endpoints, major_radius = faceted_mobius_arc(name, inner_diameter, gap_degrees=72, major_steps=64)
    ring.merge(angular_embrace_terminal("left_open_hand", endpoints[0], "left", major_radius))
    ring.merge(angular_embrace_terminal("right_open_hand", endpoints[1], "right", major_radius))
    return ring


def export(mesh):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_binary_stl(mesh, OUTPUT / f"{mesh.name}.stl")
    write_obj(mesh, OUTPUT / f"{mesh.name}.obj")
    bounds = mesh.bounds()
    dimensions = tuple(bounds[axis][1] - bounds[axis][0] for axis in range(3))
    print(mesh.name, "validation", validate_mesh(mesh), "dimensions", dimensions)


def main():
    rings = [build_open_ring(diameter) for diameter in (18.5, 19.5, 20.5)]
    for ring in rings:
        export(ring)
    palette = [(91, 89, 87)]
    solid_png(
        [rings[1]],
        PREVIEWS / "open_ring_v3_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "open_ring_v3_top.png",
        camera=(0.0, -0.15, 1.0),
        width=900,
        height=900,
        palette=palette,
    )
    solid_png(
        [rings[1]],
        PREVIEWS / "open_ring_v3_front.png",
        camera=(0.0, -1.0, 0.15),
        width=1100,
        height=720,
        palette=palette,
    )


if __name__ == "__main__":
    main()
