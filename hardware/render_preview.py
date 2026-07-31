#!/usr/bin/env python3
"""Small dependency-light STL preview renderer for the enclosure assets."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent


def read_ascii_stl(path: Path) -> np.ndarray:
    vertices: list[list[float]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = line.strip().split()
        if fields and fields[0] == "vertex":
            vertices.append([float(value) for value in fields[1:4]])
    points = np.asarray(vertices, dtype=float)
    if len(points) % 3:
        raise ValueError(f"Malformed STL: {path}")
    return points.reshape((-1, 3, 3))


def translated(mesh: np.ndarray, xyz: tuple[float, float, float]) -> np.ndarray:
    return mesh + np.asarray(xyz, dtype=float)


def look_at(
    vertices: np.ndarray,
    eye: np.ndarray,
    target: np.ndarray,
) -> np.ndarray:
    forward = target - eye
    forward /= np.linalg.norm(forward)
    world_up = np.array([0.0, 0.0, 1.0])
    if abs(np.dot(forward, world_up)) > 0.98:
        world_up = np.array([0.0, 1.0, 0.0])
    right = np.cross(forward, world_up)
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    basis = np.stack((right, up, forward), axis=1)
    return (vertices - eye) @ basis


def shade(mesh: np.ndarray, base: tuple[int, int, int]) -> np.ndarray:
    edges_a = mesh[:, 1] - mesh[:, 0]
    edges_b = mesh[:, 2] - mesh[:, 0]
    normals = np.cross(edges_a, edges_b)
    lengths = np.linalg.norm(normals, axis=1)
    normals[lengths > 0] /= lengths[lengths > 0, None]
    light = np.array([-0.35, -0.45, 0.82])
    light /= np.linalg.norm(light)
    levels = np.clip(0.62 + 0.38 * np.abs(normals @ light), 0, 1)
    return np.clip(np.asarray(base)[None, :] * levels[:, None], 0, 255).astype(np.uint8)


def render(
    meshes: list[tuple[np.ndarray, tuple[int, int, int]]],
    output: Path,
    view: str,
) -> None:
    width, height = (1000, 1120) if view == "top" else (1200, 900)
    target = np.array([0.0, 0.0, 76.0])
    eyes = {
        "iso": np.array([190.0, 225.0, 175.0]),
        "top": np.array([0.0, 0.0, 320.0]),
        "front": np.array([0.0, 300.0, 80.0]),
        "back": np.array([0.0, -300.0, 80.0]),
        "side": np.array([300.0, 0.0, 80.0]),
    }
    projected: list[tuple[np.ndarray, np.ndarray]] = []
    all_xy: list[np.ndarray] = []

    for mesh, color in meshes:
        camera_mesh = look_at(mesh, eyes[view], target)
        projected.append((camera_mesh, shade(mesh, color)))
        all_xy.append(camera_mesh[:, :, :2].reshape((-1, 2)))

    points = np.concatenate(all_xy)
    mins = points.min(axis=0)
    maxs = points.max(axis=0)
    span = np.maximum(maxs - mins, 1)
    scale = min((width - 120) / span[0], (height - 120) / span[1])
    center = (mins + maxs) / 2

    triangles: list[tuple[float, list[tuple[float, float]], tuple[int, int, int]]] = []
    for mesh, colors in projected:
        xy = (mesh[:, :, :2] - center) * scale
        xy[:, :, 0] += width / 2
        xy[:, :, 1] = height / 2 - xy[:, :, 1]
        depths = mesh[:, :, 2].mean(axis=1)
        for depth, triangle, color in zip(depths, xy, colors, strict=True):
            triangles.append((depth, [tuple(point) for point in triangle], tuple(color)))

    image = Image.new("RGB", (width, height), "#F4F1E8")
    draw = ImageDraw.Draw(image)
    for _, triangle, color in sorted(triangles, key=lambda item: item[0], reverse=True):
        draw.polygon(triangle, fill=color)
    image.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--view", choices=("iso", "top", "front", "back", "side"), default="iso")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--layout", action="store_true", help="Render print_all.stl instead")
    args = parser.parse_args()

    if args.layout:
        meshes = [(read_ascii_stl(ROOT / "print_all.stl"), (242, 241, 235))]
    else:
        meshes = [
            (read_ascii_stl(ROOT / "body_front.stl"), (250, 249, 244)),
            (read_ascii_stl(ROOT / "body_back.stl"), (226, 225, 219)),
            (read_ascii_stl(ROOT / "arms.stl"), (244, 242, 236)),
        ]
    render(meshes, args.output, args.view)


if __name__ == "__main__":
    main()
