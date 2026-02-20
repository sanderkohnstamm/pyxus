"""Vehicle capability profiles for multi-platform support.

Maps MAV_TYPE integers to capability profiles that describe what
commands a vehicle supports, which telemetry fields are relevant,
and sensible defaults for each platform category.
"""

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

# Default fallback profile
_DEFAULT_PROFILE = {**VEHICLE_PROFILES["copter"], "profile_name": "copter"}


def get_profile(mav_type: int) -> dict:
    """Return the vehicle capability profile for a given MAV_TYPE.

    Falls back to the copter profile for unrecognised types.
    """
    return _MAV_TYPE_TO_PROFILE.get(mav_type, _DEFAULT_PROFILE)
