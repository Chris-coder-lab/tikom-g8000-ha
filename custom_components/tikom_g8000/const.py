"""Constants for Tikom G8000."""

DOMAIN = "tikom_g8000"
VERSION = "2.5.0"

CONF_VACUUM = "vacuum_entity"

STORAGE_VERSION = 1

DIRECTIONS = {
    "forward": ("f", "Vor"),
    "reverse": ("b", "Zurück"),
    "left": ("l", "Links drehen"),
    "right": ("r", "Rechts drehen"),
}
CODE_TO_DIRECTION = {code: name for name, (code, _) in DIRECTIONS.items()}

# Reinigungsmodus im Raum: Befehl an den Roboter -> Anzeigename
START_MODES = {
    "clean": "Smart",
    "wall_follow": "Kante",
    "random": "Zufällig",
}

DEFAULT_STEP_SECONDS = 2.0
DEFAULT_MIN_BATTERY = 70
DEFAULT_ROOM_MINUTES = 10
MAX_ROUTE_LENGTH = 255

START_CHECK_DELAY = 20  # Sekunden bis geprüft wird, ob er wirklich saugt
LEAVE_DOCK_WAIT = 8  # Sekunden, die er nach dem ersten Fahrschritt Zeit hat, die Station zu verlassen
BATTERY_WAIT = 3 * 3600  # max. Wartezeit auf Akku
DOCK_WAIT = 25 * 60  # max. Wartezeit auf Rückkehr zur Station

# Pastellfarben für Räume im Plan (reihum vergeben)
ROOM_COLORS = [
    "#5b9bd5", "#ed7d31", "#70ad47", "#ffc000", "#9e6bb8", "#26a69a",
    "#e57373", "#8d6e63", "#4db6ac", "#f06292", "#7986cb", "#aed581",
]

PANEL_URL = "tikom-g8000"
PANEL_ELEMENT = "tikom-g8000-panel"
STATIC_URL = "/tikom_g8000_static/panel.js"
