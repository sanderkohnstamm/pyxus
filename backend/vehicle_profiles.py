"""Vehicle capability profiles for multi-platform support.

Maps MAV_TYPE integers to capability profiles that describe what
commands a vehicle supports, which telemetry fields are relevant,
and sensible defaults for each platform category.

Single source of truth for MAV_TYPE names and vehicle categorisation.
"""

# Canonical map of MAV_TYPE int -> human-readable name.
# Reference: https://mavlink.io/en/messages/common.html#MAV_TYPE
MAV_TYPE_NAMES: dict[int, str] = {
    0: "Generic",
    1: "Fixed Wing",
    2: "Quadrotor",
    3: "Coaxial",
    4: "Helicopter",
    5: "Antenna Tracker",
    6: "GCS",
    7: "Airship",
    8: "Free Balloon",
    9: "Rocket",
    10: "Ground Rover",
    11: "Surface Boat",
    12: "Submarine",
    13: "Hexarotor",
    14: "Octorotor",
    15: "Tricopter",
    16: "Flapping Wing",
    17: "Kite",
    18: "Companion Computer",
    19: "VTOL Tiltrotor",
    20: "VTOL Duo",
    21: "VTOL Quad",
    22: "VTOL Tailsitter",
    23: "VTOL Reserved",
    24: "VTOL Reserved",
    25: "VTOL Reserved",
    26: "Gimbal",
    27: "ADSB",
    28: "Parafoil",
    29: "Dodecarotor",
    30: "Camera",
    31: "Charging Station",
    32: "FLARM",
    33: "Servo",
    34: "ODID",
    35: "Decarotor",
    36: "Battery",
    37: "Parachute",
    38: "Log",
    39: "OSD",
    40: "IMU",
    41: "GPS",
    42: "Winch",
}

VEHICLE_PROFILES = {
    "copter": {
        "mav_types": [2, 3, 4, 13, 14, 15, 29, 35],  # quad, coax, heli, hexa, octo, tri, dodeca, deca
        "category": "air",
        "commands": ["arm", "disarm", "takeoff", "land", "rtl", "goto", "set_mode", "mission_start", "mission_pause"],
        "has_altitude": True,
        "has_depth": False,
        "supports_takeoff": True,
        "supports_vtol": True,
        "default_alt": 10,
        "default_speed": 5,
    },
    "plane": {
        "mav_types": [1],
        "category": "air",
        "commands": ["arm", "disarm", "takeoff", "land", "rtl", "goto", "set_mode", "mission_start", "mission_pause"],
        "has_altitude": True,
        "has_depth": False,
        "supports_takeoff": True,
        "supports_vtol": False,
        "default_alt": 50,
        "default_speed": 15,
    },
    "vtol": {
        "mav_types": [19, 20, 21, 22, 23, 24, 25],  # VTOL tiltrotor, duo, quad, tailsitter, reserved
        "category": "air",
        "commands": ["arm", "disarm", "takeoff", "land", "rtl", "goto", "set_mode", "mission_start", "mission_pause"],
        "has_altitude": True,
        "has_depth": False,
        "supports_takeoff": True,
        "supports_vtol": True,
        "default_alt": 30,
        "default_speed": 12,
    },
    "rover": {
        "mav_types": [10],
        "category": "ground",
        "commands": ["arm", "disarm", "rtl", "goto", "set_mode", "mission_start", "mission_pause"],
        "has_altitude": False,
        "has_depth": False,
        "supports_takeoff": False,
        "supports_vtol": False,
        "default_speed": 3,
    },
    "boat": {
        "mav_types": [11],
        "category": "surface",
        "commands": ["arm", "disarm", "rtl", "goto", "set_mode", "mission_start", "mission_pause"],
        "has_altitude": False,
        "has_depth": False,
        "supports_takeoff": False,
        "supports_vtol": False,
        "default_speed": 3,
    },
    "sub": {
        "mav_types": [12],
        "category": "underwater",
        "commands": ["arm", "disarm", "goto", "set_mode", "mission_start", "mission_pause"],
        "has_altitude": False,
        "has_depth": True,
        "supports_takeoff": False,
        "supports_vtol": False,
        "default_speed": 1,
    },
}

# Pre-build reverse lookup: mav_type int -> profile dict (with "profile_name" injected)
_MAV_TYPE_TO_PROFILE: dict[int, dict] = {}
for _name, _profile in VEHICLE_PROFILES.items():
    _entry = {**_profile, "profile_name": _name}
    for _mt in _profile["mav_types"]:
        _MAV_TYPE_TO_PROFILE[_mt] = _entry

# Vehicle MAV_TYPEs — actual aircraft/vehicles we should connect to.
# Derived from profiles plus generic (0) and types not yet profiled but still vehicles.
VEHICLE_TYPES: set[int] = set(_MAV_TYPE_TO_PROFILE.keys()) | {
    0,   # Generic (could be autopilot in some configs)
    7,   # Airship
    8,   # Free Balloon
    9,   # Rocket
    16,  # Flapping Wing
    17,  # Kite
    28,  # Parafoil
}

# Peripheral types we track but don't connect to as vehicles.
PERIPHERAL_TYPES: dict[int, str] = {
    k: v for k, v in MAV_TYPE_NAMES.items()
    if k not in VEHICLE_TYPES
}

# Default fallback profile
_DEFAULT_PROFILE = {**VEHICLE_PROFILES["copter"], "profile_name": "copter"}


def get_profile(mav_type: int) -> dict:
    """Return the vehicle capability profile for a given MAV_TYPE.

    Falls back to the copter profile for unrecognised types.
    """
    return _MAV_TYPE_TO_PROFILE.get(mav_type, _DEFAULT_PROFILE)
