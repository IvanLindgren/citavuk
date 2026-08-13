"""Build compact OSM snapshots for the 3D travel map.

The browser must not download a large Overpass response on every visit. This
operator script fetches a small area, keeps only the geometry needed by the
scene and writes deterministic JSON files consumed by Three.js.
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "travel" / "scenes"
RADIUS_M = 420
CITIES = {
    "beograd": (20.4569, 44.8176),
    "novi-sad": (19.8452, 45.2551),
}
OBJECT_LIMITS = {
    "tree": 56,
    "bench": 24,
    "street_lamp": 24,
    "fountain": 8,
    "bus_stop": 12,
    "waste_basket": 12,
    "bicycle_parking": 10,
    "artwork": 10,
}


def tags_of(element: ET.Element) -> dict[str, str]:
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def fetch_map(center: tuple[float, float]) -> dict[str, Any]:
    lon, lat = center
    lon_delta = RADIUS_M / (111_320 * math.cos(math.radians(lat)))
    lat_delta = RADIUS_M / 110_540
    bbox = f"{lon - lon_delta:.6f},{lat - lat_delta:.6f},{lon + lon_delta:.6f},{lat + lat_delta:.6f}"
    request = urllib.request.Request(
        f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}",
        headers={"User-Agent": "Citavuk/1.0 (https://citavuk.ru)"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        root = ET.fromstring(response.read())

    coordinates: dict[str, tuple[float, float]] = {}
    elements: list[dict[str, Any]] = []
    for node in root.findall("node"):
        coordinates[node.attrib["id"]] = (float(node.attrib["lon"]), float(node.attrib["lat"]))
        tags = tags_of(node)
        if tags:
            elements.append({
                "type": "node",
                "id": int(node.attrib["id"]),
                "lon": float(node.attrib["lon"]),
                "lat": float(node.attrib["lat"]),
                "tags": tags,
            })
    for way in root.findall("way"):
        tags = tags_of(way)
        if "building" not in tags and "highway" not in tags:
            continue
        geometry = []
        for reference in way.findall("nd"):
            coordinate = coordinates.get(reference.attrib["ref"])
            if coordinate:
                geometry.append({"lon": coordinate[0], "lat": coordinate[1]})
        elements.append({"type": "way", "id": int(way.attrib["id"]), "tags": tags, "geometry": geometry})
    return {"elements": elements}


def project(lon: float, lat: float, center: tuple[float, float]) -> list[float]:
    scale = math.cos(math.radians(center[1]))
    return [round((lon - center[0]) * scale * 111_320, 1), round((lat - center[1]) * 110_540, 1)]


def distance(point: list[float]) -> float:
    return math.hypot(point[0], point[1])


def perpendicular(point: list[float], start: list[float], end: list[float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def simplify(points: list[list[float]], tolerance: float = 2.5) -> list[list[float]]:
    if len(points) <= 2:
        return points
    best_distance = 0.0
    best_index = 0
    for index in range(1, len(points) - 1):
        candidate = perpendicular(points[index], points[0], points[-1])
        if candidate > best_distance:
            best_distance, best_index = candidate, index
    if best_distance <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[: best_index + 1], tolerance)[:-1] + simplify(points[best_index:], tolerance)


def object_kind(tags: dict[str, str]) -> str | None:
    if tags.get("natural") == "tree":
        return "tree"
    amenity = tags.get("amenity")
    if amenity in {"bench", "waste_basket", "bicycle_parking"}:
        return amenity
    if amenity in {"fountain", "drinking_water"}:
        return "fountain"
    if tags.get("highway") in {"street_lamp", "bus_stop"}:
        return tags["highway"]
    if tags.get("tourism") == "artwork":
        return "artwork"
    return None


def road_width(tags: dict[str, str]) -> float:
    highway = tags.get("highway", "")
    if highway in {"motorway", "trunk", "primary"}:
        return 15
    if highway in {"secondary", "tertiary"}:
        return 11
    if highway in {"footway", "path", "pedestrian", "steps"}:
        return 4
    return 7


def building_height(tags: dict[str, str], osm_id: int) -> float:
    raw_height = tags.get("height", "").replace("m", "").strip()
    try:
        return round(max(4, min(42, float(raw_height))), 1)
    except ValueError:
        pass
    try:
        return round(max(4, min(42, float(tags.get("building:levels", "")) * 3.1)), 1)
    except ValueError:
        return float(7 + (osm_id % 5) * 2)


def build(city_id: str, center: tuple[float, float], payload: dict[str, Any]) -> dict[str, Any]:
    buildings: list[dict[str, Any]] = []
    roads: list[dict[str, Any]] = []
    objects: dict[str, list[dict[str, Any]]] = {kind: [] for kind in OBJECT_LIMITS}

    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        osm_id = int(element.get("id", 0))
        if element.get("type") == "node":
            kind = object_kind(tags)
            if not kind:
                continue
            at = project(float(element["lon"]), float(element["lat"]), center)
            if distance(at) <= RADIUS_M:
                objects[kind].append({"id": f"n{osm_id}", "kind": kind, "at": at, "name": tags.get("name", "")})
            continue

        geometry = element.get("geometry") or []
        points = [project(float(item["lon"]), float(item["lat"]), center) for item in geometry]
        points = [point for point in points if distance(point) <= RADIUS_M * 1.25]
        if len(points) < 2:
            continue
        middle = points[len(points) // 2]
        if "building" in tags and len(points) >= 4:
            outline = simplify(points, 1.8)
            if len(outline) >= 4:
                buildings.append({"id": f"w{osm_id}", "outline": outline, "height": building_height(tags, osm_id), "distance": distance(middle)})
        elif "highway" in tags:
            roads.append({"id": f"w{osm_id}", "points": simplify(points, 3.5), "width": road_width(tags), "distance": distance(middle)})

    kept_objects: list[dict[str, Any]] = []
    for kind, candidates in objects.items():
        occupied: set[tuple[int, int]] = set()
        spacing = 22 if kind in {"tree", "street_lamp"} else 14
        for item in sorted(candidates, key=lambda value: (distance(value["at"]), value["id"])):
            cell = (round(item["at"][0] / spacing), round(item["at"][1] / spacing))
            if cell in occupied:
                continue
            occupied.add(cell)
            kept_objects.append(item)
            if sum(1 for current in kept_objects if current["kind"] == kind) >= OBJECT_LIMITS[kind]:
                break

    def clean(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
        result = sorted(items, key=lambda value: (value["distance"], value["id"]))[:limit]
        for item in result:
            item.pop("distance", None)
        return result

    return {
        "version": 1,
        "cityId": city_id,
        "center": list(center),
        "radiusM": RADIUS_M,
        "source": {"name": "OpenStreetMap contributors", "license": "ODbL-1.0"},
        "buildings": clean(buildings, 130),
        "roads": clean(roads, 90),
        "objects": sorted(kept_objects, key=lambda value: (value["kind"], value["id"])),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("cities", nargs="*", choices=tuple(CITIES), default=list(CITIES))
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for city_id in args.cities:
        center = CITIES[city_id]
        print(f"Fetching {city_id}…", flush=True)
        scene = build(city_id, center, fetch_map(center))
        target = OUTPUT / f"{city_id}.json"
        target.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(
            f"  {len(scene['buildings'])} buildings, {len(scene['roads'])} roads, "
            f"{len(scene['objects'])} objects -> {target}",
            flush=True,
        )


if __name__ == "__main__":
    main()
