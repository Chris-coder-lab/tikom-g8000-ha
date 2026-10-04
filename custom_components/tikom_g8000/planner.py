"""Floor plan grid, path finding and conversion into drive steps.

No Home Assistant imports: this module is pure Python so it can be tested alone.

Coordinates: x to the right, y downwards (screen coordinates), unit = cell.
Heading in degrees, 0 = east, 90 = south (clockwise on the screen).
A right turn increases the heading, a left turn decreases it.
"""

from __future__ import annotations

import heapq
import math
from typing import Any

CELL_M = 0.1  # edge length of one cell in metres
MIN_SIZE = 10
MAX_SIZE = 600  # cells per side (= 60 m)
MAX_ROOMS = 35
ROOM_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz"  # '0' = wall / outside
UNDOCK_M = 0.3  # backing out distance when the robot faces the dock
MIN_TURN_DEG = 3.0
MAX_STEP_SECONDS = 30.0
MAX_ROUTE_SECONDS = 600.0
MAX_STEPS = 60
IMAGE_MAX_BYTES = 1_400_000
IMAGE_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/webp;base64,",
)


class PlanError(ValueError):
    """The plan or a route request is not usable."""


# ----------------------------------------------------------------------
# plan validation
# ----------------------------------------------------------------------
def empty_plan(width: int = 100, height: int = 80) -> dict[str, Any]:
    """A blank plan (all wall)."""
    return {
        "w": width,
        "h": height,
        "rows": ["0" * width for _ in range(height)],
        "carpet": ["0" * width for _ in range(height)],
        "dock": None,
    }


def _clean_rows(rows: Any, width: int, height: int, alphabet: str, name: str) -> list[str]:
    if not isinstance(rows, list) or len(rows) != height:
        raise PlanError(f"{name}: falsche Zeilenzahl")
    cleaned = []
    for row in rows:
        if not isinstance(row, str) or len(row) != width:
            raise PlanError(f"{name}: falsche Zeilenlänge")
        if any(char not in alphabet for char in row):
            raise PlanError(f"{name}: ungültiges Zeichen")
        cleaned.append(row)
    return cleaned


def _number(value: Any, low: float, high: float, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PlanError(f"{name}: keine Zahl")
    if not math.isfinite(value) or not low <= value <= high:
        raise PlanError(f"{name}: außerhalb von {low} bis {high}")
    return float(value)


def clean_plan(raw: Any) -> dict[str, Any]:
    """Validate a plan coming from the browser; return a normalised copy."""
    if not isinstance(raw, dict):
        raise PlanError("Plan ist kein Objekt")
    width, height = raw.get("w"), raw.get("h")
    if (
        not isinstance(width, int)
        or not isinstance(height, int)
        or isinstance(width, bool)
        or isinstance(height, bool)
        or not MIN_SIZE <= width <= MAX_SIZE
        or not MIN_SIZE <= height <= MAX_SIZE
    ):
        raise PlanError("Planmaße ungültig")
    plan: dict[str, Any] = {
        "w": width,
        "h": height,
        "rows": _clean_rows(raw.get("rows"), width, height, ROOM_CHARS, "rows"),
        "carpet": _clean_rows(raw.get("carpet"), width, height, "01", "carpet"),
        "dock": None,
    }
    dock = raw.get("dock")
    if dock is not None:
        if not isinstance(dock, dict):
            raise PlanError("Station ungültig")
        facing = dock.get("facing", "out")
        if facing not in ("out", "in"):
            raise PlanError("Station: facing ungültig")
        plan["dock"] = {
            "x": _number(dock.get("x"), 0, width, "dock.x"),
            "y": _number(dock.get("y"), 0, height, "dock.y"),
            "heading": _number(dock.get("heading", 0), -360, 360, "dock.heading"),
            "facing": facing,
        }
    return plan


def clean_image(raw: Any) -> dict[str, Any] | None:
    """Validate a background image description."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise PlanError("Bild ungültig")
    data = raw.get("data")
    if not isinstance(data, str) or not data.startswith(IMAGE_PREFIXES):
        raise PlanError("Bild: nur PNG, JPEG oder WebP")
    if len(data) > IMAGE_MAX_BYTES:
        raise PlanError("Bild ist zu groß (höchstens ca. 1 MB)")
    payload = data.split(",", 1)[1]
    if any(
        char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
        for char in payload[:2000]
    ):
        raise PlanError("Bild: ungültige Kodierung")
    return {
        "data": data,
        "width_m": _number(raw.get("width_m", 10), 0.5, 100, "Bildbreite"),
        "x_m": _number(raw.get("x_m", 0), -100, 100, "Bild x"),
        "y_m": _number(raw.get("y_m", 0), -100, 100, "Bild y"),
        "opacity": _number(raw.get("opacity", 0.5), 0, 1, "Deckkraft"),
    }


def room_char(index: int) -> str:
    """Character used in the grid for a room index (1..35)."""
    if not 1 <= index < len(ROOM_CHARS):
        raise PlanError("Raumnummer ungültig")
    return ROOM_CHARS[index]


# ----------------------------------------------------------------------
# grid helpers
# ----------------------------------------------------------------------
class Grid:
    """Decoded plan."""

    def __init__(self, plan: dict[str, Any]) -> None:
        """Decode rows."""
        self.w: int = plan["w"]
        self.h: int = plan["h"]
        self.room = [[ROOM_CHARS.index(c) for c in row] for row in plan["rows"]]
        self.carpet = [[c == "1" for c in row] for row in plan["carpet"]]

    def inside(self, x: int, y: int) -> bool:
        """Whether the cell exists."""
        return 0 <= x < self.w and 0 <= y < self.h

    def walkable(self, x: int, y: int) -> bool:
        """Whether the cell belongs to any room."""
        return self.inside(x, y) and self.room[y][x] != 0

    def distance_to_wall(self) -> list[list[int]]:
        """Chebyshev distance of every cell to the nearest wall cell."""
        inf = 10**6
        dist = [[inf] * self.w for _ in range(self.h)]
        queue: list[tuple[int, int]] = []
        for y in range(self.h):
            for x in range(self.w):
                if self.room[y][x] == 0:
                    dist[y][x] = 0
                    queue.append((x, y))
        head = 0
        while head < len(queue):
            x, y = queue[head]
            head += 1
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if self.inside(nx, ny) and dist[ny][nx] > dist[y][x] + 1:
                        dist[ny][nx] = dist[y][x] + 1
                        queue.append((nx, ny))
        return dist


def room_cells(grid: Grid, index: int) -> list[tuple[int, int]]:
    """All cells of one room."""
    return [
        (x, y) for y in range(grid.h) for x in range(grid.w) if grid.room[y][x] == index
    ]


def default_target(
    grid: Grid, index: int, avoid_carpet: bool = False
) -> tuple[int, int] | None:
    """Cell of the room that lies deepest inside it and closest to its centre.

    With avoid_carpet the cell is taken from the carpet-free part of the room
    (when there is any), so that mopping never aims at a carpet.
    """
    cells = room_cells(grid, index)
    if avoid_carpet:
        cells = [c for c in cells if not grid.carpet[c[1]][c[0]]] or cells
    if not cells:
        return None
    cx = sum(x for x, _ in cells) / len(cells)
    cy = sum(y for _, y in cells) / len(cells)
    dist = grid.distance_to_wall()
    best_depth = max(dist[y][x] for x, y in cells)
    depth_floor = max(1, min(best_depth, 3))
    candidates = [(x, y) for x, y in cells if dist[y][x] >= depth_floor]
    return min(candidates, key=lambda c: (c[0] - cx) ** 2 + (c[1] - cy) ** 2)


# ----------------------------------------------------------------------
# path finding
# ----------------------------------------------------------------------
def _passable_map(
    grid: Grid,
    dist: list[list[int]],
    clearance: int,
    block_carpet: bool,
    start: tuple[int, int],
) -> list[list[bool]]:
    free = [[False] * grid.w for _ in range(grid.h)]
    for y in range(grid.h):
        for x in range(grid.w):
            if not grid.walkable(x, y):
                continue
            if block_carpet and grid.carpet[y][x]:
                continue
            near_start = max(abs(x - start[0]), abs(y - start[1])) <= 4
            free[y][x] = dist[y][x] > clearance or near_start
    return free


def _astar(
    free: list[list[bool]], start: tuple[int, int], goal: tuple[int, int]
) -> list[tuple[int, int]] | None:
    height, width = len(free), len(free[0])
    if not free[start[1]][start[0]] or not free[goal[1]][goal[0]]:
        return None
    open_heap: list[tuple[float, float, tuple[int, int]]] = [(0.0, 0.0, start)]
    best = {start: 0.0}
    came: dict[tuple[int, int], tuple[int, int]] = {}
    while open_heap:
        _, cost, node = heapq.heappop(open_heap)
        if node == goal:
            path = [node]
            while node in came:
                node = came[node]
                path.append(node)
            return path[::-1]
        if cost > best.get(node, math.inf):
            continue
        x, y = node
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if not (0 <= nx < width and 0 <= ny < height) or not free[ny][nx]:
                    continue
                if dx and dy and not (free[y][nx] and free[ny][x]):
                    continue  # no cutting corners
                new_cost = cost + (1.4142 if dx and dy else 1.0)
                if new_cost < best.get((nx, ny), math.inf):
                    best[(nx, ny)] = new_cost
                    came[(nx, ny)] = node
                    heuristic = math.hypot(goal[0] - nx, goal[1] - ny)
                    heapq.heappush(open_heap, (new_cost + heuristic, new_cost, (nx, ny)))
    return None


def _line_clear(free: list[list[bool]], a: tuple[int, int], b: tuple[int, int]) -> bool:
    """Whether the straight line between two cells stays on free cells."""
    steps = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
    if steps == 0:
        return True
    for i in range(steps + 1):
        x = round(a[0] + (b[0] - a[0]) * i / steps)
        y = round(a[1] + (b[1] - a[1]) * i / steps)
        if not free[y][x]:
            return False
    return True


def simplify_path(
    path: list[tuple[int, int]], free: list[list[bool]]
) -> list[tuple[int, int]]:
    """Remove waypoints that can be skipped on a straight, free line."""
    if len(path) <= 2:
        return path
    result = [path[0]]
    anchor = 0
    while anchor < len(path) - 1:
        reach = anchor + 1
        for candidate in range(len(path) - 1, anchor, -1):
            if _line_clear(free, path[anchor], path[candidate]):
                reach = candidate
                break
        result.append(path[reach])
        anchor = reach
    return result


def dock_start(plan: dict[str, Any]) -> tuple[float, float, float, list[tuple[str, float]]]:
    """Start position (cells), robot heading and the undock steps (metres).

    Returns x, y, heading, extra, where extra is [("reverse", metres)] when the
    robot sits facing the dock and has to back out first.
    """
    dock = plan.get("dock")
    if not dock:
        raise PlanError("Es ist noch keine Ladestation im Plan gesetzt.")
    heading = dock["heading"]  # direction from the dock into the room
    if dock["facing"] == "in":
        distance = UNDOCK_M / CELL_M
        x = dock["x"] + math.cos(math.radians(heading)) * distance
        y = dock["y"] + math.sin(math.radians(heading)) * distance
        return x, y, heading + 180.0, [("reverse", UNDOCK_M)]
    return dock["x"], dock["y"], heading, []


def _nearest_walkable(
    grid: Grid, cell: tuple[int, int], reach: int
) -> tuple[int, int] | None:
    best = None
    best_distance = math.inf
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            x, y = cell[0] + dx, cell[1] + dy
            if grid.walkable(x, y) and dx * dx + dy * dy < best_distance:
                best, best_distance = (x, y), dx * dx + dy * dy
    return best


def plan_path(
    plan: dict[str, Any],
    room_index: int,
    target: tuple[int, int] | None = None,
    block_carpet: bool = False,
    clearance: int = 2,
) -> dict[str, Any]:
    """Find a path from the dock to a room.

    Returns {"path": [(x, y), ...], "clearance": used clearance}.
    """
    grid = plan.get("_grid") or Grid(plan)
    plan["_grid"] = grid
    sx, sy, _, _ = dock_start(plan)
    start = (min(max(round(sx), 0), grid.w - 1), min(max(round(sy), 0), grid.h - 1))
    if not grid.walkable(*start):
        start = _nearest_walkable(grid, start, 4) or start
    if not grid.walkable(*start):
        raise PlanError("Die Ladestation liegt nicht in einem Raum.")
    if target is None:
        target = default_target(grid, room_index, avoid_carpet=block_carpet)
    if target is None:
        raise PlanError("Der Raum hat keine Fläche im Plan.")
    if not grid.walkable(*target):
        raise PlanError("Das Ziel liegt nicht auf einer Raumfläche.")
    if block_carpet and grid.carpet[target[1]][target[0]]:
        raise PlanError("Das Ziel liegt auf Teppich, Wischen ist dort nicht erlaubt.")
    if "_dist" not in plan:
        plan["_dist"] = grid.distance_to_wall()
    dist = plan["_dist"]
    for used in range(clearance, -1, -1):
        free = _passable_map(grid, dist, used, block_carpet, start)
        free[target[1]][target[0]] = True
        path = _astar(free, start, target)
        if path:
            return {"path": simplify_path(path, free), "clearance": used}
    raise PlanError(
        "Kein Weg gefunden. Türen im Plan öffnen"
        + (" oder Teppich umgehen." if block_carpet else ".")
    )


# ----------------------------------------------------------------------
# path -> drive steps
# ----------------------------------------------------------------------
def _normalize(angle: float) -> float:
    return (angle + 180.0) % 360.0 - 180.0


def steps_from_path(
    plan: dict[str, Any],
    path: list[tuple[int, int]],
    speed_cm_s: float,
    turn_deg_s: float,
) -> list[tuple[str, float]]:
    """Convert a waypoint list into [(direction, seconds), ...]."""
    if speed_cm_s <= 0 or turn_deg_s <= 0:
        raise PlanError("Kalibrierung fehlt (Geschwindigkeit und Drehrate).")
    _, _, heading, extra = dock_start(plan)
    speed_m_s = speed_cm_s / 100.0
    steps: list[tuple[str, float]] = [
        (direction, metres / speed_m_s) for direction, metres in extra
    ]
    # the path starts at the cell of the start position, use exact start
    sx, sy, _, _ = dock_start(plan)
    position = (sx, sy)
    for waypoint in path[1:]:
        dx, dy = waypoint[0] - position[0], waypoint[1] - position[1]
        distance_m = math.hypot(dx, dy) * CELL_M
        if distance_m < 0.05:
            continue
        wanted = math.degrees(math.atan2(dy, dx))
        delta = _normalize(wanted - heading)
        if abs(delta) >= MIN_TURN_DEG:
            steps.append(("right" if delta > 0 else "left", abs(delta) / turn_deg_s))
            heading = wanted
        steps.append(("forward", distance_m / speed_m_s))
        position = (float(waypoint[0]), float(waypoint[1]))
    return limit_steps(steps)


def limit_steps(steps: list[tuple[str, float]]) -> list[tuple[str, float]]:
    """Round, split overlong steps and enforce the safety limits."""
    result: list[tuple[str, float]] = []
    for direction, seconds in steps:
        seconds = round(seconds, 1)
        if seconds <= 0:
            continue
        while seconds > MAX_STEP_SECONDS:
            result.append((direction, MAX_STEP_SECONDS))
            seconds = round(seconds - MAX_STEP_SECONDS, 1)
        if seconds > 0:
            result.append((direction, seconds))
    if len(result) > MAX_STEPS:
        raise PlanError("Die Route hat zu viele Schritte. Plan vereinfachen.")
    if sum(seconds for _, seconds in result) > MAX_ROUTE_SECONDS:
        raise PlanError("Die Route dauert zu lange (über 10 Minuten).")
    return result


def simulate(
    plan: dict[str, Any],
    steps: list[tuple[str, float]],
    speed_cm_s: float,
    turn_deg_s: float,
) -> list[tuple[float, float]]:
    """Where the robot ends up for a list of steps; returns the polyline (cells)."""
    x, y, heading, _ = dock_start(plan)
    # a recorded route starts at the dock, a planned one already contains the
    # undock step, so start from the dock itself in both cases
    dock = plan["dock"]
    x, y = dock["x"], dock["y"]
    heading = dock["heading"] if dock["facing"] == "out" else dock["heading"] + 180.0
    points = [(x, y)]
    for direction, seconds in steps:
        if direction in ("forward", "reverse"):
            metres = speed_cm_s / 100.0 * seconds
            sign = 1 if direction == "forward" else -1
            x += sign * math.cos(math.radians(heading)) * metres / CELL_M
            y += sign * math.sin(math.radians(heading)) * metres / CELL_M
            points.append((x, y))
        elif direction == "right":
            heading += turn_deg_s * seconds
        elif direction == "left":
            heading -= turn_deg_s * seconds
    return points
