"""Floor plans made of shapes (cm), turned into the grid the planner uses.

No Home Assistant imports: pure Python, tested alone.

A floor holds shapes in centimetres (x to the right, y downwards):

* kind "room"   a piece of a room (a room can consist of several shapes)
* kind "carpet" a carpet (only counts inside rooms)
* kind "door"   an opening: makes the wall between rooms passable
* kind "block"  furniture or a no-go zone: not drivable

and the geometry type "rect", "ellipse", "poly" (corner points) or
"stroke" (a freehand line with a width).

Rooms that touch each other get a wall between them automatically; a door
shape opens it again. Floors can switch this off ("walls": false) for
open-plan flats.
"""

from __future__ import annotations

import math
import re
from typing import Any

from .planner import MAX_ROOMS, ROOM_CHARS, PlanError, _number

CELL_CM = 10  # one grid cell
MAX_CELLS = 600  # per side, 60 m
MAX_SHAPES = 600
MAX_POLY_POINTS = 80
MAX_STROKE_POINTS = 200
MAX_FLOORS = 8
COORD_MIN = -5000
COORD_MAX = 10000
SIZE_MAX = 6000
KINDS = ("room", "carpet", "door", "block")
TYPES = ("rect", "ellipse", "poly", "stroke")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,24}$")
ROOM_ID_RE = re.compile(r"^[a-z0-9_]{1,60}$")
DOOR_REACH = 8  # cells: how far a door looks for the room next to it
MARGIN_CM = 20


# ----------------------------------------------------------------------
# validation
# ----------------------------------------------------------------------
def _coord(value: Any, name: str) -> int:
    return round(_number(value, COORD_MIN, COORD_MAX, name))


def _points(raw: Any, low: int, high: int, name: str) -> list[list[int]]:
    if not isinstance(raw, list) or not low <= len(raw) <= high:
        raise PlanError(f"{name}: falsche Punktzahl")
    points = []
    for point in raw:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise PlanError(f"{name}: ungültiger Punkt")
        points.append([_coord(point[0], name), _coord(point[1], name)])
    return points


def clean_shape(raw: Any) -> dict[str, Any]:
    """Validate one shape coming from the browser."""
    if not isinstance(raw, dict):
        raise PlanError("Form ist kein Objekt")
    shape_id = raw.get("id")
    if not isinstance(shape_id, str) or not ID_RE.match(shape_id):
        raise PlanError("Form: ungültige ID")
    kind, kind_type = raw.get("kind"), raw.get("t")
    if kind not in KINDS:
        raise PlanError("Form: unbekannte Art")
    if kind_type not in TYPES:
        raise PlanError("Form: unbekannter Typ")
    shape: dict[str, Any] = {"id": shape_id, "kind": kind, "t": kind_type}
    if kind == "room":
        room = raw.get("room")
        if not isinstance(room, str) or not ROOM_ID_RE.match(room):
            raise PlanError("Raumform ohne gültigen Raum")
        shape["room"] = room
    if kind_type in ("rect", "ellipse"):
        shape["x"] = _coord(raw.get("x"), "x")
        shape["y"] = _coord(raw.get("y"), "y")
        shape["w"] = round(_number(raw.get("w"), CELL_CM, SIZE_MAX, "Breite"))
        shape["h"] = round(_number(raw.get("h"), CELL_CM, SIZE_MAX, "Länge"))
    elif kind_type == "poly":
        shape["pts"] = _points(raw.get("pts"), 3, MAX_POLY_POINTS, "Vieleck")
    else:
        shape["pts"] = _points(raw.get("pts"), 1, MAX_STROKE_POINTS, "Linie")
        shape["width"] = round(_number(raw.get("width", 30), 10, 200, "Breite"))
    return shape


def clean_dock(raw: Any) -> dict[str, Any] | None:
    """Validate the charging station of a floor (cm)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise PlanError("Station ungültig")
    facing = raw.get("facing", "in")
    if facing not in ("out", "in"):
        raise PlanError("Station: Ausrichtung ungültig")
    return {
        "x": _coord(raw.get("x"), "Station x"),
        "y": _coord(raw.get("y"), "Station y"),
        "heading": round(_number(raw.get("heading", 0), -360, 360, "Station Richtung")),
        "facing": facing,
    }


def clean_floor(raw: Any, room_ids: set[str] | None = None) -> dict[str, Any]:
    """Validate a floor (without its image) and return a normalised copy."""
    if not isinstance(raw, dict):
        raise PlanError("Stockwerk ist kein Objekt")
    floor_id = raw.get("id")
    if not isinstance(floor_id, str) or not ID_RE.match(floor_id):
        raise PlanError("Stockwerk: ungültige ID")
    name = raw.get("name", "")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 30:
        raise PlanError("Stockwerk: Name fehlt oder ist zu lang")
    shapes_raw = raw.get("shapes", [])
    if not isinstance(shapes_raw, list) or len(shapes_raw) > MAX_SHAPES:
        raise PlanError(f"Höchstens {MAX_SHAPES} Formen je Stockwerk")
    shapes = [clean_shape(item) for item in shapes_raw]
    if len({shape["id"] for shape in shapes}) != len(shapes):
        raise PlanError("Form-IDs doppelt")
    if room_ids is not None:
        for shape in shapes:
            if shape["kind"] == "room" and shape["room"] not in room_ids:
                raise PlanError("Der Plan enthält Räume, die es nicht gibt.")
    walls = raw.get("walls", True)
    if not isinstance(walls, bool):
        raise PlanError("Stockwerk: walls ungültig")
    return {
        "id": floor_id,
        "name": name.strip(),
        "walls": walls,
        "shapes": shapes,
        "dock": clean_dock(raw.get("dock")),
    }


# ----------------------------------------------------------------------
# geometry
# ----------------------------------------------------------------------
def shape_bounds(shape: dict[str, Any]) -> tuple[float, float, float, float]:
    """Bounding box (x0, y0, x1, y1) in cm."""
    kind_type = shape["t"]
    if kind_type in ("rect", "ellipse"):
        return shape["x"], shape["y"], shape["x"] + shape["w"], shape["y"] + shape["h"]
    xs = [p[0] for p in shape["pts"]]
    ys = [p[1] for p in shape["pts"]]
    pad = shape["width"] / 2 if kind_type == "stroke" else 0
    return min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad


def _first_index(origin: float, value: float) -> int:
    """First cell whose centre is >= value (cell i has its centre at origin + 10 i + 5)."""
    return math.ceil((value - origin - CELL_CM / 2) / CELL_CM)


def _spans_rect(shape, ox, oy, width, height):
    j0 = max(0, _first_index(oy, shape["y"]))
    j1 = min(height, _first_index(oy, shape["y"] + shape["h"]))
    i0 = max(0, _first_index(ox, shape["x"]))
    i1 = min(width, _first_index(ox, shape["x"] + shape["w"]))
    if i1 > i0:
        for j in range(j0, j1):
            yield j, i0, i1


def _spans_ellipse(shape, ox, oy, width, height):
    cx, cy = shape["x"] + shape["w"] / 2, shape["y"] + shape["h"] / 2
    rx, ry = shape["w"] / 2, shape["h"] / 2
    j0 = max(0, _first_index(oy, cy - ry))
    j1 = min(height, _first_index(oy, cy + ry) + 1)
    for j in range(j0, j1):
        yc = oy + j * CELL_CM + CELL_CM / 2
        t = (yc - cy) / ry
        if abs(t) > 1:
            continue
        half = rx * math.sqrt(1 - t * t)
        i0 = max(0, _first_index(ox, cx - half))
        i1 = min(width, math.floor((cx + half - ox - CELL_CM / 2) / CELL_CM) + 1)
        if i1 > i0:
            yield j, i0, i1


def _spans_poly(points, ox, oy, width, height):
    ys = [p[1] for p in points]
    j0 = max(0, _first_index(oy, min(ys)))
    j1 = min(height, _first_index(oy, max(ys)) + 1)
    count = len(points)
    for j in range(j0, j1):
        yc = oy + j * CELL_CM + CELL_CM / 2
        crossings = []
        for k in range(count):
            x1, y1 = points[k]
            x2, y2 = points[(k + 1) % count]
            if (y1 <= yc < y2) or (y2 <= yc < y1):
                crossings.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
        crossings.sort()
        for a in range(0, len(crossings) - 1, 2):
            i0 = max(0, _first_index(ox, crossings[a]))
            i1 = min(width, _first_index(ox, crossings[a + 1]))
            if i1 > i0:
                yield j, i0, i1


def _spans_stroke(shape, ox, oy, width, height):
    radius = shape["width"] / 2
    points = shape["pts"]
    discs: list[tuple[float, float]] = []
    if len(points) == 1:
        discs.append((points[0][0], points[0][1]))
    for a, b in zip(points, points[1:]):
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        steps = max(1, math.ceil(length / 5))
        for k in range(steps + 1):
            discs.append((a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps))
    rows: dict[int, list[tuple[int, int]]] = {}
    for cx, cy in discs:
        j0 = max(0, _first_index(oy, cy - radius))
        j1 = min(height, _first_index(oy, cy + radius) + 1)
        for j in range(j0, j1):
            yc = oy + j * CELL_CM + CELL_CM / 2
            t = (yc - cy) / radius
            if abs(t) > 1:
                continue
            half = radius * math.sqrt(1 - t * t)
            i0 = max(0, _first_index(ox, cx - half))
            i1 = min(width, math.floor((cx + half - ox - CELL_CM / 2) / CELL_CM) + 1)
            if i1 > i0:
                rows.setdefault(j, []).append((i0, i1))
    for j, spans in rows.items():
        for i0, i1 in spans:
            yield j, i0, i1


def shape_spans(shape, ox, oy, width, height):
    """Yield (row, first_col, end_col) for every row the shape covers."""
    kind_type = shape["t"]
    if kind_type == "rect":
        return _spans_rect(shape, ox, oy, width, height)
    if kind_type == "ellipse":
        return _spans_ellipse(shape, ox, oy, width, height)
    if kind_type == "poly":
        return _spans_poly(shape["pts"], ox, oy, width, height)
    return _spans_stroke(shape, ox, oy, width, height)


# ----------------------------------------------------------------------
# floor -> grid
# ----------------------------------------------------------------------
def compile_floor(floor: dict[str, Any], room_index: dict[str, int]) -> dict[str, Any]:
    """Turn a floor into the grid plan the planner works with.

    room_index maps a room id to its number 1..35. The result has "ox"/"oy"
    (cm position of the grid's top-left corner) and the dock in cell units.
    """
    shapes = floor["shapes"]
    if not any(shape["kind"] == "room" for shape in shapes):
        raise PlanError("In diesem Stockwerk ist noch kein Raum gezeichnet.")
    boxes = [shape_bounds(shape) for shape in shapes]
    dock = floor.get("dock")
    min_x = min(box[0] for box in boxes)
    min_y = min(box[1] for box in boxes)
    max_x = max(box[2] for box in boxes)
    max_y = max(box[3] for box in boxes)
    if dock:
        min_x, max_x = min(min_x, dock["x"]), max(max_x, dock["x"])
        min_y, max_y = min(min_y, dock["y"]), max(max_y, dock["y"])
    ox = math.floor((min_x - MARGIN_CM) / CELL_CM) * CELL_CM
    oy = math.floor((min_y - MARGIN_CM) / CELL_CM) * CELL_CM
    width = math.ceil((max_x + MARGIN_CM - ox) / CELL_CM)
    height = math.ceil((max_y + MARGIN_CM - oy) / CELL_CM)
    if width > MAX_CELLS or height > MAX_CELLS:
        raise PlanError(
            f"Der Plan ist zu groß (höchstens {MAX_CELLS * CELL_CM // 100} Meter in Breite und Länge)."
        )

    room = [[0] * width for _ in range(height)]
    carpet = [bytearray(width) for _ in range(height)]

    def paint_all(kind: str):
        for shape in shapes:
            if shape["kind"] == kind:
                yield shape, shape_spans(shape, ox, oy, width, height)

    for shape, spans in paint_all("room"):
        index = room_index.get(shape["room"])
        if index is None or not 1 <= index < len(ROOM_CHARS):
            raise PlanError("Der Plan enthält Räume, die es nicht gibt.")
        for j, i0, i1 in spans:
            room[j][i0:i1] = [index] * (i1 - i0)
    for _, spans in paint_all("carpet"):
        for j, i0, i1 in spans:
            carpet[j][i0:i1] = b"\x01" * (i1 - i0)

    original = [row[:] for row in room]
    walled: set[tuple[int, int]] = set()
    if floor.get("walls", True):
        for j in range(height):
            row = original[j]
            below = original[j + 1] if j + 1 < height else None
            for i in range(width):
                a = row[i]
                if not a:
                    continue
                if i + 1 < width and row[i + 1] and row[i + 1] != a:
                    walled.add((i, j))
                    walled.add((i + 1, j))
                if below is not None and below[i] and below[i] != a:
                    walled.add((i, j))
                    walled.add((i, j + 1))
        for i, j in walled:
            room[j][i] = 0

    door_cells: set[tuple[int, int]] = set()
    for _, spans in paint_all("door"):
        for j, i0, i1 in spans:
            for i in range(i0, i1):
                door_cells.add((i, j))
    for i, j in door_cells:
        if original[j][i]:
            room[j][i] = original[j][i]
        else:
            room[j][i] = _nearest_room(original, i, j, width, height)

    for _, spans in paint_all("block"):
        for j, i0, i1 in spans:
            room[j][i0:i1] = [0] * (i1 - i0)

    rows = ["".join(ROOM_CHARS[v] for v in line) for line in room]
    carpet_rows = [
        "".join("1" if flag and room[j][i] else "0" for i, flag in enumerate(line))
        for j, line in enumerate(carpet)
    ]
    plan: dict[str, Any] = {
        "w": width,
        "h": height,
        "rows": rows,
        "carpet": carpet_rows,
        "dock": None,
        "ox": ox,
        "oy": oy,
    }
    if dock:
        plan["dock"] = {
            "x": (dock["x"] - ox) / CELL_CM - 0.5,
            "y": (dock["y"] - oy) / CELL_CM - 0.5,
            "heading": float(dock["heading"]),
            "facing": dock["facing"],
        }
    return plan


def _nearest_room(original, i: int, j: int, width: int, height: int) -> int:
    for reach in range(1, DOOR_REACH + 1):
        best = 0
        best_distance = math.inf
        for dj in range(-reach, reach + 1):
            for di in range(-reach, reach + 1):
                if max(abs(di), abs(dj)) != reach:
                    continue
                x, y = i + di, j + dj
                if 0 <= x < width and 0 <= y < height and original[y][x]:
                    distance = di * di + dj * dj
                    if distance < best_distance:
                        best, best_distance = original[y][x], distance
        if best:
            return best
    return 0


def cell_to_cm(plan: dict[str, Any], x: float, y: float) -> tuple[float, float]:
    """Cell-index position (planner units) back to floor centimetres."""
    return plan["ox"] + (x + 0.5) * CELL_CM, plan["oy"] + (y + 0.5) * CELL_CM


def cm_to_cell(plan: dict[str, Any], x: float, y: float) -> tuple[int, int]:
    """Floor centimetres to the integer cell a point lies in."""
    return (
        min(max(math.floor((x - plan["ox"]) / CELL_CM), 0), plan["w"] - 1),
        min(max(math.floor((y - plan["oy"]) / CELL_CM), 0), plan["h"] - 1),
    )


# ----------------------------------------------------------------------
# migration from the old grid plan (v2.0)
# ----------------------------------------------------------------------
def _rectangles(mask: list[list[bool]]) -> list[tuple[int, int, int, int]]:
    """Cover the true cells of a mask with rectangles (x, y, w, h) in cells."""
    height = len(mask)
    width = len(mask[0]) if height else 0
    active: dict[tuple[int, int], int] = {}
    result: list[tuple[int, int, int, int]] = []
    for j in range(height + 1):
        runs: set[tuple[int, int]] = set()
        if j < height:
            i = 0
            row = mask[j]
            while i < width:
                if row[i]:
                    start = i
                    while i < width and row[i]:
                        i += 1
                    runs.add((start, i))
                else:
                    i += 1
        for key in [k for k in active if k not in runs]:
            top = active.pop(key)
            result.append((key[0], top, key[1] - key[0], j - top))
        for key in runs:
            active.setdefault(key, j)
    return result


def grid_plan_to_floor(
    plan: dict[str, Any],
    room_by_index: dict[int, str],
    floor_id: str = "eg",
    name: str = "Erdgeschoss",
) -> dict[str, Any]:
    """Convert an old grid plan (rows of room numbers) into shapes, keeping the layout."""
    shapes: list[dict[str, Any]] = []

    def add(kind: str, rect: tuple[int, int, int, int], room: str | None = None) -> None:
        x, y, w, h = rect
        shape: dict[str, Any] = {
            "id": f"m{len(shapes) + 1}",
            "kind": kind,
            "t": "rect",
            "x": x * CELL_CM,
            "y": y * CELL_CM,
            "w": w * CELL_CM,
            "h": h * CELL_CM,
        }
        if room:
            shape["room"] = room
        shapes.append(shape)

    for index, room_id in sorted(room_by_index.items()):
        char = ROOM_CHARS[index]
        mask = [[c == char for c in row] for row in plan["rows"]]
        for rect in _rectangles(mask):
            add("room", rect, room_id)
    carpet_mask = [[c == "1" for c in row] for row in plan["carpet"]]
    for rect in _rectangles(carpet_mask):
        add("carpet", rect)
    dock = plan.get("dock")
    return {
        "id": floor_id,
        "name": name,
        "walls": False,  # the old plan treated touching rooms as open
        "shapes": shapes[:MAX_SHAPES],
        "dock": (
            {
                "x": round((dock["x"] + 0.5) * CELL_CM),
                "y": round((dock["y"] + 0.5) * CELL_CM),
                "heading": round(dock["heading"]),
                "facing": dock.get("facing", "out"),
            }
            if dock
            else None
        ),
    }


def check_room_count(count: int) -> None:
    """Raise when there are too many rooms for the grid alphabet."""
    if count > MAX_ROOMS:
        raise PlanError(f"Höchstens {MAX_ROOMS} Räume.")
