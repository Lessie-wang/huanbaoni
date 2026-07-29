#!/usr/bin/env python3
"""Generate printable FeelingMosaic ring and display-base V1 meshes.

The script uses only the Python standard library so it can run before Blender
automation is available. Generated OBJ/STL files import directly into Blender.
Dimensions are millimetres.
"""

from __future__ import annotations

import math
import os
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "cad" / "output"
PREVIEWS = ROOT / "cad" / "previews"


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, scalar):
    return (a[0] * scalar, a[1] * scalar, a[2] * scalar)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(a):
    return math.sqrt(dot(a, a))


def normalize(a):
    magnitude = length(a)
    if magnitude == 0:
        return (0.0, 0.0, 0.0)
    return mul(a, 1.0 / magnitude)


@dataclass
class Mesh:
    name: str
    vertices: list[tuple[float, float, float]] = field(default_factory=list)
    faces: list[tuple[int, int, int]] = field(default_factory=list)

    def merge(self, other: "Mesh") -> None:
        offset = len(self.vertices)
        self.vertices.extend(other.vertices)
        self.faces.extend(tuple(index + offset for index in face) for face in other.faces)

    def bounds(self):
        axes = list(zip(*self.vertices))
        return tuple((min(axis), max(axis)) for axis in axes)


def mesh_from_polygon_extrusion(name, polygon, z_min, z_max):
    mesh = Mesh(name)
    count = len(polygon)
    mesh.vertices = [(x, y, z_min) for x, y in polygon] + [(x, y, z_max) for x, y in polygon]
    for index in range(1, count - 1):
        mesh.faces.append((0, index + 1, index))
        mesh.faces.append((count, count + index, count + index + 1))
    for index in range(count):
        next_index = (index + 1) % count
        mesh.faces.append((index, next_index, count + next_index))
        mesh.faces.append((index, count + next_index, count + index))
    return mesh


def rounded_rectangle(width, depth, radius, corner_steps=8):
    half_width = width / 2
    half_depth = depth / 2
    radius = min(radius, half_width, half_depth)
    points = []
    corners = [
        (half_width - radius, half_depth - radius, 0),
        (-half_width + radius, half_depth - radius, 1),
        (-half_width + radius, -half_depth + radius, 2),
        (half_width - radius, -half_depth + radius, 3),
    ]
    for center_x, center_y, quadrant in corners:
        start = quadrant * math.pi / 2
        for step in range(corner_steps + 1):
            angle = start + step * math.pi / (2 * corner_steps)
            points.append((center_x + radius * math.cos(angle), center_y + radius * math.sin(angle)))
    return points


def rounded_box(name, center, size, radius=2.0):
    polygon = rounded_rectangle(size[0], size[1], radius)
    mesh = mesh_from_polygon_extrusion(name, polygon, center[2] - size[2] / 2, center[2] + size[2] / 2)
    mesh.vertices = [(x + center[0], y + center[1], z) for x, y, z in mesh.vertices]
    return mesh


def ellipsoid(name, center, radii, rings=12, segments=20):
    mesh = Mesh(name)
    mesh.vertices.append((center[0], center[1], center[2] + radii[2]))
    for ring in range(1, rings):
        phi = math.pi * ring / rings
        for segment in range(segments):
            theta = 2 * math.pi * segment / segments
            mesh.vertices.append((
                center[0] + radii[0] * math.sin(phi) * math.cos(theta),
                center[1] + radii[1] * math.sin(phi) * math.sin(theta),
                center[2] + radii[2] * math.cos(phi),
            ))
    bottom = len(mesh.vertices)
    mesh.vertices.append((center[0], center[1], center[2] - radii[2]))

    for segment in range(segments):
        next_segment = (segment + 1) % segments
        mesh.faces.append((0, 1 + next_segment, 1 + segment))
    for ring in range(rings - 2):
        row = 1 + ring * segments
        next_row = row + segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            mesh.faces.append((row + segment, row + next_segment, next_row + next_segment))
            mesh.faces.append((row + segment, next_row + next_segment, next_row + segment))
    last_row = 1 + (rings - 2) * segments
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        mesh.faces.append((last_row + segment, last_row + next_segment, bottom))
    return mesh


def cylinder_between(name, start, end, radius, segments=14):
    direction = normalize(sub(end, start))
    reference = (0.0, 0.0, 1.0) if abs(direction[2]) < 0.9 else (0.0, 1.0, 0.0)
    axis_x = normalize(cross(direction, reference))
    axis_y = normalize(cross(direction, axis_x))
    mesh = Mesh(name)
    for point in (start, end):
        for segment in range(segments):
            angle = 2 * math.pi * segment / segments
            offset = add(mul(axis_x, radius * math.cos(angle)), mul(axis_y, radius * math.sin(angle)))
            mesh.vertices.append(add(point, offset))
    start_center = len(mesh.vertices)
    mesh.vertices.append(start)
    end_center = len(mesh.vertices)
    mesh.vertices.append(end)
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        mesh.faces.append((segment, next_segment, segments + next_segment))
        mesh.faces.append((segment, segments + next_segment, segments + segment))
        mesh.faces.append((start_center, next_segment, segment))
        mesh.faces.append((end_center, segments + segment, segments + next_segment))
    return mesh


def capsule(name, start, end, radius):
    mesh = cylinder_between(name, start, end, radius)
    mesh.merge(ellipsoid(name + "_a", start, (radius, radius, radius), rings=8, segments=14))
    mesh.merge(ellipsoid(name + "_b", end, (radius, radius, radius), rings=8, segments=14))
    return mesh


def torus_arc(name, inner_diameter, gap_degrees=60, radial_radius=1.7, half_width=3.0, major_steps=96, minor_steps=16):
    mesh = Mesh(name)
    major_radius = inner_diameter / 2 + radial_radius
    gap = math.radians(gap_degrees)
    start_angle = math.pi / 2 + gap / 2
    end_angle = math.pi / 2 - gap / 2 + 2 * math.pi
    for major in range(major_steps + 1):
        angle = start_angle + (end_angle - start_angle) * major / major_steps
        radial = (math.cos(angle), math.sin(angle), 0.0)
        center = mul(radial, major_radius)
        for minor in range(minor_steps):
            cross_angle = 2 * math.pi * minor / minor_steps
            radial_offset = radial_radius * math.cos(cross_angle)
            z_offset = half_width * math.sin(cross_angle)
            mesh.vertices.append(add(center, add(mul(radial, radial_offset), (0.0, 0.0, z_offset))))
    for major in range(major_steps):
        row = major * minor_steps
        next_row = row + minor_steps
        for minor in range(minor_steps):
            next_minor = (minor + 1) % minor_steps
            mesh.faces.append((row + minor, row + next_minor, next_row + next_minor))
            mesh.faces.append((row + minor, next_row + next_minor, next_row + minor))
    start_center = len(mesh.vertices)
    mesh.vertices.append(tuple(sum(mesh.vertices[index][axis] for index in range(minor_steps)) / minor_steps for axis in range(3)))
    end_row = major_steps * minor_steps
    end_center = len(mesh.vertices)
    mesh.vertices.append(tuple(sum(mesh.vertices[end_row + index][axis] for index in range(minor_steps)) / minor_steps for axis in range(3)))
    for minor in range(minor_steps):
        next_minor = (minor + 1) % minor_steps
        mesh.faces.append((start_center, next_minor, minor))
        mesh.faces.append((end_center, end_row + minor, end_row + next_minor))
    return mesh


def build_ring(inner_diameter):
    name = f"feelingmosaic_ring_{inner_diameter:.1f}mm"
    ring = torus_arc(name, inner_diameter)
    major_radius = inner_diameter / 2 + 1.7
    gap = math.radians(60)
    left_angle = math.pi / 2 + gap / 2
    right_angle = math.pi / 2 - gap / 2
    endpoints = [
        (major_radius * math.cos(left_angle), major_radius * math.sin(left_angle), 0.0),
        (major_radius * math.cos(right_angle), major_radius * math.sin(right_angle), 0.0),
    ]

    core_y = major_radius + 1.6
    for side, endpoint in enumerate(endpoints):
        sign = 1 if endpoint[0] < 0 else -1
        palm_center = (endpoint[0] + sign * 1.05, endpoint[1] + 0.45, 0.0)
        ring.merge(ellipsoid(f"palm_{side}", palm_center, (2.35, 1.75, 2.7)))
        for finger_index, z_offset in enumerate((-1.55, -0.52, 0.52, 1.55)):
            start = (palm_center[0] + sign * 1.25, palm_center[1] + 0.35, z_offset)
            end = (sign * 1.85, core_y, z_offset * 0.72)
            ring.merge(capsule(f"finger_{side}_{finger_index}", start, end, 0.56))
        thumb_start = (palm_center[0] + sign * 0.55, palm_center[1] - 0.1, -1.75)
        thumb_end = (sign * 2.1, core_y - 0.2, -1.0)
        ring.merge(capsule(f"thumb_{side}", thumb_start, thumb_end, 0.72))

    # A raised intertwined ridge provides the Möbius visual without reducing finger clearance.
    ridge_points = []
    for step in range(56):
        proportion = step / 55
        angle = left_angle + (right_angle + 2 * math.pi - left_angle) * proportion
        wrap_angle = proportion * 2 * math.pi
        radius = major_radius + 1.85 * math.cos(wrap_angle)
        ridge_points.append((
            radius * math.cos(angle),
            radius * math.sin(angle),
            2.75 * math.sin(wrap_angle),
        ))
    for index in range(len(ridge_points) - 1):
        ring.merge(capsule(f"mobius_ridge_{index}", ridge_points[index], ridge_points[index + 1], 0.52))
    return ring


def build_flower_core(inner_diameter=19.5):
    major_radius = inner_diameter / 2 + 1.7
    center = (0.0, major_radius + 1.6, 0.0)
    core = Mesh("six_petal_emotion_core")
    for index in range(6):
        angle = index * math.pi / 3
        petal_center = (
            center[0] + 2.6 * math.cos(angle),
            center[1],
            center[2] + 2.6 * math.sin(angle),
        )
        core.merge(ellipsoid(f"petal_{index}", petal_center, (2.55, 1.55, 1.35)))
    core.merge(ellipsoid("core_center", center, (2.1, 1.8, 2.1)))
    return core


def build_tray():
    tray = Mesh("electronics_tray_140x95")
    tray.merge(rounded_box("tray_floor", (0, 0, 1.4), (140, 95, 2.8), radius=18))
    wall_height = 12
    wall_thickness = 2.6
    tray.merge(rounded_box("wall_front", (0, -46.2, wall_height / 2), (124, wall_thickness, wall_height), radius=1.2))
    tray.merge(rounded_box("wall_back", (0, 46.2, wall_height / 2), (124, wall_thickness, wall_height), radius=1.2))
    tray.merge(rounded_box("wall_left", (-68.7, 0, wall_height / 2), (wall_thickness, 76, wall_height), radius=1.2))
    tray.merge(rounded_box("wall_right", (68.7, 0, wall_height / 2), (wall_thickness, 76, wall_height), radius=1.2))
    # Internal mounting rails for ESP32 / 400-hole breadboard.
    for x in (-42, 42):
        tray.merge(rounded_box("rail", (x, 0, 4.3), (4, 65, 3), radius=1))
    return tray


def build_ring_dock(z_base):
    dock = Mesh("ring_dock")
    dock.merge(rounded_box("dock_plinth", (0, 18, z_base + 3), (44, 28, 6), radius=7))
    for x in (-10.5, 10.5):
        dock.merge(capsule("dock_arm", (x, 18, z_base + 5), (x * 0.75, 18, z_base + 24), 3.0))
    dock.merge(capsule("dock_bridge", (-8, 18, z_base + 22), (8, 18, z_base + 22), 2.2))
    return dock


def build_opaque_lid():
    lid = Mesh("opaque_emotion_island_lid")
    lid.merge(rounded_box("lid_plate", (0, 0, 2.3), (140, 95, 4.6), radius=18))
    # Soft topography / flower motif, kept as printable overlapping solids.
    for index in range(6):
        angle = index * math.pi / 3
        center = (32 * math.cos(angle), 8 + 23 * math.sin(angle), 5.2)
        lid.merge(ellipsoid(f"lid_petal_{index}", center, (17, 10, 2.0), rings=8, segments=16))
    lid.merge(build_ring_dock(4.6))
    # Rear cable bridge visibly marks the USB exit without fragile subtraction.
    lid.merge(rounded_box("usb_bridge", (0, 44, 7), (24, 4, 5), radius=1.5))
    return lid


def build_open_frame():
    frame = Mesh("open_clear_panel_frame")
    frame.merge(rounded_box("frame_top_front", (0, -43, 30), (120, 5, 5), radius=2))
    frame.merge(rounded_box("frame_top_back", (0, 43, 30), (120, 5, 5), radius=2))
    frame.merge(rounded_box("frame_top_left", (-66, 0, 30), (5, 78, 5), radius=2))
    frame.merge(rounded_box("frame_top_right", (66, 0, 30), (5, 78, 5), radius=2))
    for x in (-66, 66):
        for y in (-43, 43):
            frame.merge(rounded_box("frame_post", (x, y, 16), (7, 7, 28), radius=2))
    frame.merge(build_ring_dock(30))
    # Slots for 0.5-1 mm PET/acrylic sheets are represented by parallel retaining rails.
    for y in (-40.5, 40.5):
        frame.merge(rounded_box("panel_rail", (0, y, 8), (118, 2, 4), radius=0.8))
    return frame


def build_haptic_insert():
    insert = Mesh("optional_10mm_coin_motor_insert")
    insert.merge(rounded_box("motor_floor", (0, 0, 0.9), (14, 14, 1.8), radius=4))
    for x, y, width, depth in (
        (0, 6.1, 10, 1.8),
        (0, -6.1, 10, 1.8),
        (6.1, 0, 1.8, 10),
        (-6.1, 0, 1.8, 10),
    ):
        insert.merge(rounded_box("motor_wall", (x, y, 2.8), (width, depth, 4), radius=0.8))
    insert.merge(capsule("wire_guard", (-3, -7, 1.5), (3, -7, 1.5), 1.1))
    return insert


def triangulated_normal(a, b, c):
    return normalize(cross(sub(b, a), sub(c, a)))


def write_binary_stl(mesh, path):
    with open(path, "wb") as stream:
        header = f"FeelingMosaic {mesh.name}".encode("ascii", "ignore")[:80]
        stream.write(header.ljust(80, b"\0"))
        stream.write(struct.pack("<I", len(mesh.faces)))
        for face in mesh.faces:
            a, b, c = (mesh.vertices[index] for index in face)
            normal = triangulated_normal(a, b, c)
            stream.write(struct.pack("<12fH", *(normal + a + b + c), 0))


def write_obj(mesh, path):
    with open(path, "w", encoding="utf-8") as stream:
        stream.write(f"o {mesh.name}\n")
        for vertex in mesh.vertices:
            stream.write(f"v {vertex[0]:.5f} {vertex[1]:.5f} {vertex[2]:.5f}\n")
        for face in mesh.faces:
            stream.write(f"f {face[0] + 1} {face[1] + 1} {face[2] + 1}\n")


def svg_preview(meshes, path, title, camera=(0.62, -0.78, 0.56), scale=4.1):
    camera_direction = normalize(camera)
    right = normalize(cross((0, 0, 1), camera_direction))
    up = normalize(cross(camera_direction, right))
    projected_faces = []
    all_points = []
    palette = ["#f3e6dc", "#d4b8a5", "#b8c6bf", "#dedbd6", "#8c8780", "#ead8cf"]
    for mesh_index, mesh in enumerate(meshes):
        color = palette[mesh_index % len(palette)]
        projected = []
        for vertex in mesh.vertices:
            projected.append((dot(vertex, right), dot(vertex, up), dot(vertex, camera_direction)))
        all_points.extend(projected)
        for face in mesh.faces:
            points = [projected[index] for index in face]
            depth = sum(point[2] for point in points) / 3
            projected_faces.append((depth, points, color))
    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    width = (max_x - min_x) * scale + 80
    height = (max_y - min_y) * scale + 100

    def screen(point):
        return (40 + (point[0] - min_x) * scale, height - 45 - (point[1] - min_y) * scale)

    with open(path, "w", encoding="utf-8") as stream:
        stream.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" viewBox="0 0 {width:.0f} {height:.0f}">')
        stream.write('<rect width="100%" height="100%" fill="#faf9f7"/>')
        stream.write(f'<text x="24" y="30" font-family="sans-serif" font-size="18" fill="#3a352f">{title}</text>')
        for _, points, color in sorted(projected_faces, key=lambda item: item[0]):
            coords = " ".join(f"{x:.1f},{y:.1f}" for x, y in map(screen, points))
            stream.write(f'<polygon points="{coords}" fill="{color}" stroke="#746d66" stroke-width="0.18"/>')
        stream.write('</svg>')


def write_png(path, width, height, pixels):
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for red, green, blue in row:
            raw.extend((red, green, blue))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    payload = bytearray(b"\x89PNG\r\n\x1a\n")
    payload.extend(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)))
    payload.extend(chunk(b"IDAT", zlib.compress(bytes(raw), 8)))
    payload.extend(chunk(b"IEND", b""))
    path.write_bytes(payload)


def wireframe_png(meshes, path, camera=(0.62, -0.78, 0.56), width=1200, height=850):
    camera_direction = normalize(camera)
    right = normalize(cross((0, 0, 1), camera_direction))
    up = normalize(cross(camera_direction, right))
    projected_meshes = []
    all_points = []
    colors = [(184, 154, 131), (168, 192, 176), (216, 160, 140), (140, 135, 128)]
    for mesh_index, mesh in enumerate(meshes):
        points = [(dot(vertex, right), dot(vertex, up), dot(vertex, camera_direction)) for vertex in mesh.vertices]
        projected_meshes.append((mesh, points, colors[mesh_index % len(colors)]))
        all_points.extend(points)
    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    scale = min((width - 90) / (max_x - min_x), (height - 90) / (max_y - min_y))

    def screen(point):
        return (
            int(45 + (point[0] - min_x) * scale),
            int(height - 45 - (point[1] - min_y) * scale),
        )

    pixels = [[(250, 249, 247) for _ in range(width)] for _ in range(height)]

    def blend_pixel(x, y, color, amount=0.52):
        if 0 <= x < width and 0 <= y < height:
            old = pixels[y][x]
            pixels[y][x] = tuple(int(old[index] * (1 - amount) + color[index] * amount) for index in range(3))

    def line(a, b, color):
        x0, y0 = a
        x1, y1 = b
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        error = dx + dy
        while True:
            blend_pixel(x0, y0, color)
            if x0 == x1 and y0 == y1:
                break
            doubled = 2 * error
            if doubled >= dy:
                error += dy
                x0 += sx
            if doubled <= dx:
                error += dx
                y0 += sy

    face_records = []
    for mesh, points, color in projected_meshes:
        stride = max(1, len(mesh.faces) // 4200)
        for face_index in range(0, len(mesh.faces), stride):
            face = mesh.faces[face_index]
            depth = sum(points[index][2] for index in face) / 3
            face_records.append((depth, face, points, color))
    for _, face, points, color in sorted(face_records, key=lambda record: record[0]):
        a, b, c = (screen(points[index]) for index in face)
        line(a, b, color)
        line(b, c, color)
        line(c, a, color)
    write_png(path, width, height, pixels)


def solid_png(meshes, path, camera=(0.62, -0.78, 0.56), width=1000, height=900):
    camera_direction = normalize(camera)
    right = normalize(cross((0, 0, 1), camera_direction))
    up = normalize(cross(camera_direction, right))
    light = normalize((0.35, -0.45, 0.82))
    palette = [(218, 184, 165), (167, 194, 178), (225, 215, 205), (123, 117, 111)]
    projected_meshes = []
    all_points = []
    for mesh_index, mesh in enumerate(meshes):
        points = [(dot(vertex, right), dot(vertex, up), dot(vertex, camera_direction)) for vertex in mesh.vertices]
        projected_meshes.append((mesh, points, palette[mesh_index % len(palette)]))
        all_points.extend(points)
    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    scale = min((width - 100) / (max_x - min_x), (height - 100) / (max_y - min_y))

    def screen(point):
        return (
            50 + (point[0] - min_x) * scale,
            height - 50 - (point[1] - min_y) * scale,
            point[2],
        )

    pixels = [[(250, 249, 247) for _ in range(width)] for _ in range(height)]
    zbuffer = [[-float("inf") for _ in range(width)] for _ in range(height)]
    for mesh, projected, base_color in projected_meshes:
        screen_points = [screen(point) for point in projected]
        for face in mesh.faces:
            ia, ib, ic = face
            pa, pb, pc = screen_points[ia], screen_points[ib], screen_points[ic]
            area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])
            if abs(area) < 0.001:
                continue
            world_a, world_b, world_c = mesh.vertices[ia], mesh.vertices[ib], mesh.vertices[ic]
            normal = triangulated_normal(world_a, world_b, world_c)
            intensity = 0.50 + 0.45 * abs(dot(normal, light))
            color = tuple(max(0, min(255, int(channel * intensity))) for channel in base_color)
            min_px = max(0, int(math.floor(min(pa[0], pb[0], pc[0]))))
            max_px = min(width - 1, int(math.ceil(max(pa[0], pb[0], pc[0]))))
            min_py = max(0, int(math.floor(min(pa[1], pb[1], pc[1]))))
            max_py = min(height - 1, int(math.ceil(max(pa[1], pb[1], pc[1]))))
            if min_px > max_px or min_py > max_py:
                continue
            inverse_area = 1.0 / area
            for py in range(min_py, max_py + 1):
                sample_y = py + 0.5
                for px in range(min_px, max_px + 1):
                    sample_x = px + 0.5
                    weight_a = ((pb[0] - sample_x) * (pc[1] - sample_y) - (pb[1] - sample_y) * (pc[0] - sample_x)) * inverse_area
                    weight_b = ((pc[0] - sample_x) * (pa[1] - sample_y) - (pc[1] - sample_y) * (pa[0] - sample_x)) * inverse_area
                    weight_c = 1.0 - weight_a - weight_b
                    if weight_a < -0.0001 or weight_b < -0.0001 or weight_c < -0.0001:
                        continue
                    depth = weight_a * pa[2] + weight_b * pb[2] + weight_c * pc[2]
                    if depth > zbuffer[py][px]:
                        zbuffer[py][px] = depth
                        pixels[py][px] = color
    write_png(path, width, height, pixels)


def translate(mesh, offset):
    moved = Mesh(mesh.name)
    moved.vertices = [add(vertex, offset) for vertex in mesh.vertices]
    moved.faces = list(mesh.faces)
    return moved


def export(mesh):
    write_binary_stl(mesh, OUTPUT / f"{mesh.name}.stl")
    write_obj(mesh, OUTPUT / f"{mesh.name}.obj")


def validate_mesh(mesh):
    edge_counts = {}
    degenerate_faces = 0
    for face in mesh.faces:
        a, b, c = (mesh.vertices[index] for index in face)
        if length(cross(sub(b, a), sub(c, a))) < 1e-8:
            degenerate_faces += 1
        for start, end in ((face[0], face[1]), (face[1], face[2]), (face[2], face[0])):
            edge = tuple(sorted((start, end)))
            edge_counts[edge] = edge_counts.get(edge, 0) + 1
    boundary_edges = sum(1 for count in edge_counts.values() if count == 1)
    non_manifold_edges = sum(1 for count in edge_counts.values() if count > 2)
    return degenerate_faces, boundary_edges, non_manifold_edges


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    rings = [build_ring(size) for size in (18.5, 19.5, 20.5)]
    core = build_flower_core()
    tray = build_tray()
    opaque_lid = build_opaque_lid()
    open_frame = build_open_frame()
    haptic_insert = build_haptic_insert()
    for mesh in [*rings, core, tray, opaque_lid, open_frame, haptic_insert]:
        export(mesh)
        bounds = mesh.bounds()
        dimensions = tuple(bounds[axis][1] - bounds[axis][0] for axis in range(3))
        validation = validate_mesh(mesh)
        print(
            f"{mesh.name}: {len(mesh.vertices)} vertices, {len(mesh.faces)} triangles, "
            f"size {dimensions}, degenerate/boundary/nonmanifold={validation}"
        )

    svg_preview(
        [rings[1], core],
        PREVIEWS / "ring_v1_isometric.svg",
        "FeelingMosaic · 环抱你戒指 V1（19.5 mm）",
        camera=(0.72, -0.65, 0.52),
        scale=8.5,
    )
    wireframe_png(
        [rings[1], core],
        PREVIEWS / "ring_v1_isometric.png",
        camera=(0.72, -0.65, 0.52),
        width=1000,
        height=900,
    )
    solid_png(
        [rings[1], core],
        PREVIEWS / "ring_v1_solid.png",
        camera=(0.72, -0.65, 0.52),
        width=1000,
        height=900,
    )
    solid_png(
        [rings[1], core],
        PREVIEWS / "ring_v1_top.png",
        camera=(0.0, -0.18, 1.0),
        width=900,
        height=900,
    )
    svg_preview(
        [translate(tray, (-78, 0, 0)), translate(opaque_lid, (-78, 0, 14)), translate(tray, (78, 0, 0)), translate(open_frame, (78, 0, 12))],
        PREVIEWS / "base_variants_v1.svg",
        "底座 V1：封闭版 / 开放透明框架版",
        camera=(0.65, -0.75, 0.62),
        scale=2.45,
    )
    wireframe_png(
        [translate(tray, (-78, 0, 0)), translate(opaque_lid, (-78, 0, 14)), translate(tray, (78, 0, 0)), translate(open_frame, (78, 0, 12))],
        PREVIEWS / "base_variants_v1.png",
        camera=(0.65, -0.75, 0.62),
        width=1400,
        height=850,
    )
    solid_png(
        [translate(tray, (-78, 0, 0)), translate(opaque_lid, (-78, 0, 14)), translate(tray, (78, 0, 0)), translate(open_frame, (78, 0, 12))],
        PREVIEWS / "base_variants_v1_solid.png",
        camera=(0.65, -0.75, 0.62),
        width=1400,
        height=850,
    )


if __name__ == "__main__":
    main()
