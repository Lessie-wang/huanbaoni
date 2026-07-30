#!/usr/bin/env python3
"""Generate the angular, jewellery-inspired FeelingMosaic V2 concept."""

from __future__ import annotations

import math
from pathlib import Path

from generate_printable_v1 import (
    Mesh,
    add,
    cross,
    length,
    mesh_from_polygon_extrusion,
    mul,
    normalize,
    solid_png,
    sub,
    translate,
    validate_mesh,
    write_binary_stl,
    write_obj,
)


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output" / "luxury_v2"
PREVIEWS = ROOT / "cad" / "previews"


def beam_xy(name, start, end, start_width, end_width, z_min, z_max):
    direction = normalize((end[0] - start[0], end[1] - start[1], 0.0))
    perpendicular = (-direction[1], direction[0], 0.0)
    polygon = [
        (start[0] + perpendicular[0] * start_width / 2, start[1] + perpendicular[1] * start_width / 2),
        (end[0] + perpendicular[0] * end_width / 2, end[1] + perpendicular[1] * end_width / 2),
        (end[0] - perpendicular[0] * end_width / 2, end[1] - perpendicular[1] * end_width / 2),
        (start[0] - perpendicular[0] * start_width / 2, start[1] - perpendicular[1] * start_width / 2),
    ]
    return mesh_from_polygon_extrusion(name, polygon, z_min, z_max)


def faceted_mobius_arc(name, inner_diameter, gap_degrees=62, major_steps=64):
    mesh = Mesh(name)
    inner_radius = inner_diameter / 2
    radial_half = 1.9
    vertical_half = 2.7
    chamfer = 0.55
    max_radial_extent = math.hypot(radial_half, vertical_half)
    major_radius = inner_radius + max_radial_extent + 0.35
    cross_section = [
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
    section_size = len(cross_section)

    for step in range(major_steps + 1):
        proportion = step / major_steps
        angle = start_angle + (end_angle - start_angle) * proportion
        twist = math.pi * proportion
        radial = (math.cos(angle), math.sin(angle), 0.0)
        center = mul(radial, major_radius)
        for horizontal, vertical in cross_section:
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

    endpoints = (
        (major_radius * math.cos(start_angle), major_radius * math.sin(start_angle), 0.0),
        (major_radius * math.cos(end_angle), major_radius * math.sin(end_angle), 0.0),
    )
    return mesh, endpoints, major_radius


def faceted_gem(name, center, radius_x=4.2, radius_y=3.0):
    mesh = Mesh(name)
    segments = 8
    rings = [
        (0.52, -1.55),
        (1.0, 0.0),
        (0.52, 1.55),
    ]
    for scale, z in rings:
        for index in range(segments):
            angle = 2 * math.pi * index / segments + math.pi / 8
            mesh.vertices.append((
                center[0] + radius_x * scale * math.cos(angle),
                center[1] + radius_y * scale * math.sin(angle),
                center[2] + z,
            ))
    bottom = len(mesh.vertices)
    mesh.vertices.append((center[0], center[1], center[2] - 2.25))
    top = len(mesh.vertices)
    mesh.vertices.append((center[0], center[1], center[2] + 2.25))
    for ring_index in range(2):
        row = ring_index * segments
        next_row = row + segments
        for index in range(segments):
            next_index = (index + 1) % segments
            mesh.faces.append((row + index, row + next_index, next_row + next_index))
            mesh.faces.append((row + index, next_row + next_index, next_row + index))
    for index in range(segments):
        next_index = (index + 1) % segments
        mesh.faces.append((bottom, next_index, index))
        top_row = 2 * segments
        mesh.faces.append((top, top_row + index, top_row + next_index))
    return mesh


def angular_grip(name, endpoint, side, core_center):
    mesh = Mesh(name)
    sign = 1 if side == "left" else -1
    cuff_end = (endpoint[0] + sign * 1.9, endpoint[1] + 0.8)
    mesh.merge(beam_xy(name + "_cuff", endpoint[:2], cuff_end, 5.2, 4.4, -2.7, 2.7))

    palm = [
        (cuff_end[0] - sign * 0.8, cuff_end[1] - 2.0),
        (cuff_end[0] + sign * 2.4, cuff_end[1] - 1.3),
        (cuff_end[0] + sign * 3.1, cuff_end[1] + 0.4),
        (cuff_end[0] + sign * 1.8, cuff_end[1] + 2.4),
        (cuff_end[0] - sign * 1.2, cuff_end[1] + 1.7),
    ]
    mesh.merge(mesh_from_polygon_extrusion(name + "_palm", palm, -2.45, 2.45))

    finger_origins = [
        (cuff_end[0] + sign * 2.35, cuff_end[1] - 0.85),
        (cuff_end[0] + sign * 2.75, cuff_end[1] + 0.15),
        (cuff_end[0] + sign * 2.15, cuff_end[1] + 1.15),
    ]
    finger_targets = [
        (core_center[0] - sign * 3.45, core_center[1] - 1.2),
        (core_center[0] - sign * 3.65, core_center[1]),
        (core_center[0] - sign * 3.35, core_center[1] + 1.15),
    ]
    for index, (origin, target) in enumerate(zip(finger_origins, finger_targets)):
        mesh.merge(beam_xy(f"{name}_finger_{index}", origin, target, 1.15, 0.82, -1.75, 1.75))

    thumb_origin = (cuff_end[0] + sign * 1.55, cuff_end[1] - 1.4)
    thumb_target = (core_center[0] - sign * 2.9, core_center[1] - 2.0)
    mesh.merge(beam_xy(name + "_thumb", thumb_origin, thumb_target, 1.55, 1.0, -2.0, 2.0))
    return mesh


def chamfered_rectangle(width, depth, chamfer):
    half_width = width / 2
    half_depth = depth / 2
    return [
        (-half_width + chamfer, -half_depth),
        (half_width - chamfer, -half_depth),
        (half_width, -half_depth + chamfer),
        (half_width, half_depth - chamfer),
        (half_width - chamfer, half_depth),
        (-half_width + chamfer, half_depth),
        (-half_width, half_depth - chamfer),
        (-half_width, -half_depth + chamfer),
    ]


def chamfered_box(name, center, size, chamfer):
    polygon = chamfered_rectangle(size[0], size[1], chamfer)
    mesh = mesh_from_polygon_extrusion(name, polygon, center[2] - size[2] / 2, center[2] + size[2] / 2)
    mesh.vertices = [(x + center[0], y + center[1], z) for x, y, z in mesh.vertices]
    return mesh


def box_beam_3d(name, start, end, width, depth):
    axis = normalize(sub(end, start))
    reference = (0.0, 0.0, 1.0) if abs(axis[2]) < 0.92 else (0.0, 1.0, 0.0)
    side = normalize(cross(axis, reference))
    vertical = normalize(cross(side, axis))
    mesh = Mesh(name)
    for point in (start, end):
        mesh.vertices.extend([
            add(point, add(mul(side, width / 2), mul(vertical, depth / 2))),
            add(point, add(mul(side, -width / 2), mul(vertical, depth / 2))),
            add(point, add(mul(side, -width / 2), mul(vertical, -depth / 2))),
            add(point, add(mul(side, width / 2), mul(vertical, -depth / 2))),
        ])
    mesh.faces.extend([
        (0, 2, 1), (0, 3, 2),
        (4, 5, 6), (4, 6, 7),
        (0, 1, 5), (0, 5, 4),
        (1, 2, 6), (1, 6, 5),
        (2, 3, 7), (2, 7, 6),
        (3, 0, 4), (3, 4, 7),
    ])
    return mesh


def build_luxury_tray():
    tray = Mesh("luxury_electronics_tray_150x100")
    tray.merge(chamfered_box("tray_floor", (0, 0, 1.5), (150, 100, 3), 12))
    perimeter = chamfered_rectangle(144, 94, 10)
    for index in range(len(perimeter)):
        start = perimeter[index]
        end = perimeter[(index + 1) % len(perimeter)]
        tray.merge(beam_xy(f"tray_wall_{index}", start, end, 2.8, 2.8, 2.8, 14.0))
    for x in (-46, 0, 46):
        tray.merge(beam_xy("mounting_rail", (x, -32), (x, 32), 3.5, 3.5, 3.0, 6.0))
    return tray


def build_angular_dock(z_base):
    dock = Mesh("angular_ring_dock")
    dock.merge(chamfered_box("dock_pad", (0, 16, z_base + 3), (48, 30, 6), 6))
    dock.merge(box_beam_3d("left_dock_arm", (-14, 16, z_base + 5), (-8, 16, z_base + 31), 4.6, 5.0))
    dock.merge(box_beam_3d("right_dock_arm", (14, 16, z_base + 5), (8, 16, z_base + 31), 4.6, 5.0))
    dock.merge(box_beam_3d("dock_bridge", (-8.5, 16, z_base + 30), (8.5, 16, z_base + 30), 4.2, 4.2))
    return dock


def build_luxury_closed_lid():
    lid = Mesh("luxury_closed_architectural_lid")
    lid.merge(chamfered_box("main_lid", (0, 0, 2.5), (150, 100, 5), 12))
    left_facet = [(-68, -38), (-8, -21), (-8, 35), (-57, 42), (-70, 28)]
    right_facet = [(68, -38), (8, -21), (8, 35), (57, 42), (70, 28)]
    lid.merge(mesh_from_polygon_extrusion("left_architectural_facet", left_facet, 5.0, 8.0))
    lid.merge(mesh_from_polygon_extrusion("right_architectural_facet", right_facet, 5.0, 8.0))
    lid.merge(chamfered_box("central_brand_plinth", (0, -26, 8.5), (64, 17, 7), 4))
    lid.merge(build_angular_dock(5.0))
    lid.merge(box_beam_3d("usb_port_brow", (-13, 48, 7), (13, 48, 7), 4, 4))
    return lid


def frame_loop(name, polygon, z_min, z_max, rail_width):
    frame = Mesh(name)
    for index in range(len(polygon)):
        start = polygon[index]
        end = polygon[(index + 1) % len(polygon)]
        frame.merge(beam_xy(f"{name}_{index}", start, end, rail_width, rail_width, z_min, z_max))
    return frame


def build_luxury_open_frame():
    frame = Mesh("luxury_open_display_frame")
    perimeter = chamfered_rectangle(146, 96, 11)
    frame.merge(frame_loop("lower_frame", perimeter, 1.0, 5.5, 4.5))
    frame.merge(frame_loop("upper_frame", perimeter, 36.0, 40.5, 4.5))
    for x, y in perimeter:
        frame.merge(box_beam_3d("frame_post", (x, y, 4), (x * 0.96, y * 0.96, 37.5), 5.0, 5.0))
    frame.merge(chamfered_box("floating_brand_bar", (0, -44, 20), (64, 4.5, 11), 1.5))
    frame.merge(build_angular_dock(40.5))
    return frame


def build_luxury_ring(inner_diameter):
    ring, endpoints, major_radius = faceted_mobius_arc(
        f"feelingmosaic_luxury_ring_{inner_diameter:.1f}mm",
        inner_diameter,
    )
    core_center = (0.0, major_radius + 3.0, 0.0)
    ring.merge(angular_grip("left_geometric_hand", endpoints[0], "left", core_center))
    ring.merge(angular_grip("right_geometric_hand", endpoints[1], "right", core_center))
    return ring, faceted_gem("faceted_mosaic_core", core_center)


def export(mesh):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    write_binary_stl(mesh, OUTPUT / f"{mesh.name}.stl")
    write_obj(mesh, OUTPUT / f"{mesh.name}.obj")
    print(mesh.name, validate_mesh(mesh), mesh.bounds())


def main():
    rings = []
    default_core = None
    for diameter in (18.5, 19.5, 20.5):
        ring, core = build_luxury_ring(diameter)
        export(ring)
        rings.append(ring)
        if diameter == 19.5:
            default_core = core
    export(default_core)
    tray = build_luxury_tray()
    closed_lid = build_luxury_closed_lid()
    open_frame = build_luxury_open_frame()
    export(tray)
    export(closed_lid)
    export(open_frame)
    solid_png(
        [rings[1], default_core],
        PREVIEWS / "luxury_ring_v2_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1100,
        height=900,
        palette=[(94, 91, 88), (91, 129, 116)],
    )
    solid_png(
        [
            translate(tray, (-84, 0, 0)),
            translate(closed_lid, (-84, 0, 15)),
            translate(tray, (84, 0, 0)),
            translate(open_frame, (84, 0, 14)),
        ],
        PREVIEWS / "luxury_base_v2_variants.png",
        camera=(0.66, -0.76, 0.62),
        width=1500,
        height=900,
        palette=[(194, 190, 183), (92, 90, 87), (194, 190, 183), (62, 62, 61)],
    )
    solid_png(
        [rings[1], default_core],
        PREVIEWS / "luxury_ring_v2_top.png",
        camera=(0.0, -0.15, 1.0),
        width=900,
        height=900,
        palette=[(94, 91, 88), (91, 129, 116)],
    )


if __name__ == "__main__":
    main()
