#!/usr/bin/env python3
"""
Mock MAVLink vehicle simulator for multi-vehicle, multi-autopilot testing.

Spawns N simulated vehicles, each on its own UDP port, sending telemetry
at ~10 Hz and responding to commands, mission upload/download, and fence protocol.

Vehicles auto-arm and fly their default pattern. Upload a mission and switch
to AUTO to fly waypoints.

Supported vehicle types: quad, plane, vtol, rover, boat, mixed
Supported autopilots: ardu (ArduPilot), px4 (PX4)

Usage:
    python mock_drone.py --count 3 --base-port 14550 --type quad --autopilot ardu
    python mock_drone.py --count 2 --type plane --autopilot px4
    python mock_drone.py --type mixed   # spawns one of each (5 vehicles)
"""

import argparse
import math
import random
import threading
import time

from pymavlink import mavutil
from pymavlink.dialects.v20 import common as mavlink2


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BASE_LAT = 51.9225  # ~Utrecht, Netherlands
BASE_LON = 4.4792
SPREAD = 0.005  # ~500 m between vehicles
EARTH_RADIUS = 6371000.0


# ---------------------------------------------------------------------------
# Geo helpers
# ---------------------------------------------------------------------------

def haversine(lat1, lon1, lat2, lon2):
    """Distance in meters between two lat/lon points."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return EARTH_RADIUS * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing(lat1, lon1, lat2, lon2):
    """Bearing in radians from point 1 to point 2."""
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(math.radians(lat2))
    x = (math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) -
         math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon))
    return math.atan2(y, x)


def move_latlon(lat, lon, bearing_rad, distance_m):
    """Move lat/lon by distance along bearing."""
    d = distance_m / EARTH_RADIUS
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(d) +
                      math.cos(lat1) * math.sin(d) * math.cos(bearing_rad))
    lon2 = lon1 + math.atan2(math.sin(bearing_rad) * math.sin(d) * math.cos(lat1),
                              math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lat2), math.degrees(lon2)


# ---------------------------------------------------------------------------
# Vehicle configurations
# ---------------------------------------------------------------------------

VEHICLE_CONFIGS = {
    "quad": {
        "mav_type": 2,           # MAV_TYPE_QUADROTOR
        "default_alt": 25.0,
        "cruise_speed": (5, 8),  # (min, max) m/s
        "max_climb": 3.0,
        "can_fly": True,
        "can_hover": True,
        "pattern": "figure8",
        "pattern_radius": 80.0,
        "stall_speed": 0,
        "battery_drain_flying": 0.015,
        "battery_drain_idle": 0.003,
        "max_bank": 25,          # degrees
        "max_pitch": 8,
        "turn_rate": 90,         # degrees/s
    },
    "plane": {
        "mav_type": 1,           # MAV_TYPE_FIXED_WING
        "default_alt": 80.0,
        "cruise_speed": (18, 25),
        "max_climb": 5.0,
        "can_fly": True,
        "can_hover": False,
        "pattern": "racetrack",
        "pattern_radius": 200.0,
        "stall_speed": 12,
        "battery_drain_flying": 0.008,
        "battery_drain_idle": 0.002,
        "max_bank": 45,
        "max_pitch": 15,
        "turn_rate": 30,         # slower turns
    },
    "vtol": {
        "mav_type": 22,          # MAV_TYPE_VTOL_TAILSITTER_DUOROTOR
        "default_alt": 40.0,
        "cruise_speed": (12, 18),
        "max_climb": 4.0,
        "can_fly": True,
        "can_hover": True,
        "pattern": "figure8",
        "pattern_radius": 120.0,
        "stall_speed": 0,
        "battery_drain_flying": 0.012,
        "battery_drain_idle": 0.003,
        "max_bank": 35,
        "max_pitch": 12,
        "turn_rate": 60,
    },
    "rover": {
        "mav_type": 10,          # MAV_TYPE_GROUND_ROVER
        "default_alt": 0.0,
        "cruise_speed": (2, 4),
        "max_climb": 0.0,
        "can_fly": False,
        "can_hover": False,
        "pattern": "patrol",
        "pattern_radius": 60.0,
        "stall_speed": 0,
        "battery_drain_flying": 0.005,
        "battery_drain_idle": 0.002,
        "max_bank": 0.5,
        "max_pitch": 0.5,
        "turn_rate": 90,         # differential steering
    },
    "boat": {
        "mav_type": 11,          # MAV_TYPE_SURFACE_BOAT
        "default_alt": 0.0,
        "cruise_speed": (1.5, 3),
        "max_climb": 0.0,
        "can_fly": False,
        "can_hover": False,
        "pattern": "meander",
        "pattern_radius": 80.0,
        "stall_speed": 0,
        "battery_drain_flying": 0.004,
        "battery_drain_idle": 0.001,
        "max_bank": 3,           # wave roll
        "max_pitch": 1,
        "turn_rate": 30,
    },
}

VEHICLE_TYPE_NAMES = {
    2: "Quadrotor", 1: "Fixed-Wing", 22: "VTOL",
    10: "Rover", 11: "Boat",
}


# ---------------------------------------------------------------------------
# ArduPilot mode maps per vehicle type (matching backend/drone.py)
# ---------------------------------------------------------------------------

ARDU_MODES = {
    "quad": {
        0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
        4: "GUIDED", 5: "LOITER", 6: "RTL", 7: "CIRCLE",
        9: "LAND", 11: "DRIFT", 13: "SPORT", 14: "FLIP",
        15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE", 18: "THROW",
        19: "AVOID_ADSB", 20: "GUIDED_NOGPS", 21: "SMART_RTL",
    },
    "plane": {
        0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 3: "TRAINING",
        4: "ACRO", 5: "FBWA", 6: "FBWB", 7: "CRUISE",
        8: "AUTOTUNE", 10: "AUTO", 11: "RTL", 12: "LOITER",
        13: "TAKEOFF", 14: "AVOID_ADSB", 15: "GUIDED",
        17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER",
        20: "QLAND", 21: "QRTL", 22: "QAUTOTUNE", 23: "QACRO",
        24: "THERMAL",
    },
    "rover": {
        0: "MANUAL", 1: "ACRO", 2: "STEERING", 3: "HOLD",
        4: "LOITER", 5: "FOLLOW", 6: "SIMPLE",
        10: "AUTO", 11: "RTL", 12: "SMART_RTL",
        15: "GUIDED",
    },
}
# VTOL uses plane modes (Q-modes for hover)
ARDU_MODES["vtol"] = ARDU_MODES["plane"]
# Boat uses rover modes
ARDU_MODES["boat"] = ARDU_MODES["rover"]

# Reverse maps: name -> custom_mode id
ARDU_MODE_REV = {
    vtype: {name: cid for cid, name in modes.items()}
    for vtype, modes in ARDU_MODES.items()
}

# Default mode per vehicle type (ArduPilot)
ARDU_DEFAULT_MODE = {
    "quad": "GUIDED",
    "plane": "FBWA",
    "vtol": "QHOVER",
    "rover": "GUIDED",
    "boat": "GUIDED",
}

# Default idle/disarmed mode
ARDU_IDLE_MODE = {
    "quad": "STABILIZE",
    "plane": "MANUAL",
    "vtol": "QSTABILIZE",
    "rover": "MANUAL",
    "boat": "MANUAL",
}


# ---------------------------------------------------------------------------
# PX4 mode map (shared across all vehicle types)
# ---------------------------------------------------------------------------

PX4_MODES = {
    (0, 0): "UNKNOWN",
    (1, 0): "MANUAL", (1, 1): "MANUAL",
    (2, 0): "ALTCTL", (2, 1): "ALTCTL",
    (3, 0): "POSCTL", (3, 1): "POSCTL",
    (4, 0): "AUTO", (4, 1): "AUTO_READY", (4, 2): "AUTO_TAKEOFF",
    (4, 3): "AUTO_LOITER", (4, 4): "AUTO_MISSION",
    (4, 5): "AUTO_RTL", (4, 6): "AUTO_LAND",
    (4, 7): "AUTO_RTGS", (4, 8): "AUTO_FOLLOW",
    (5, 0): "ACRO",
    (6, 0): "OFFBOARD",
    (7, 0): "STABILIZED",
    (8, 0): "RATTITUDE",
}

PX4_MODE_REV = {}
for _key, _name in PX4_MODES.items():
    if _name not in PX4_MODE_REV:
        PX4_MODE_REV[_name] = _key

PX4_DEFAULT_MODE = "POSCTL"
PX4_IDLE_MODE = "MANUAL"


# ---------------------------------------------------------------------------
# Sensor flags per vehicle type
# ---------------------------------------------------------------------------

_SENSOR_GYRO = 0x1
_SENSOR_ACCEL = 0x2
_SENSOR_MAG = 0x4
_SENSOR_BARO = 0x8
_SENSOR_GPS = 0x20
_SENSOR_OPTICAL = 0x40
_SENSOR_BATTERY = 0x200
_SENSOR_AIRSPEED = 0x10  # MAV_SYS_STATUS_SENSOR_DIFFERENTIAL_PRESSURE

SENSOR_FLAGS = {
    "quad": _SENSOR_GYRO | _SENSOR_ACCEL | _SENSOR_MAG | _SENSOR_BARO | _SENSOR_GPS | _SENSOR_BATTERY,
    "plane": _SENSOR_GYRO | _SENSOR_ACCEL | _SENSOR_MAG | _SENSOR_BARO | _SENSOR_GPS | _SENSOR_BATTERY | _SENSOR_AIRSPEED,
    "vtol": _SENSOR_GYRO | _SENSOR_ACCEL | _SENSOR_MAG | _SENSOR_BARO | _SENSOR_GPS | _SENSOR_BATTERY | _SENSOR_AIRSPEED,
    "rover": _SENSOR_GYRO | _SENSOR_ACCEL | _SENSOR_MAG | _SENSOR_GPS | _SENSOR_BATTERY,
    "boat": _SENSOR_GYRO | _SENSOR_ACCEL | _SENSOR_MAG | _SENSOR_GPS | _SENSOR_BATTERY,
}


# ---------------------------------------------------------------------------
# Parameters per vehicle × autopilot
# ---------------------------------------------------------------------------

_COMMON_ARDU_PARAMS = {
    "BATT_MONITOR": 4.0,
    "BATT_CAPACITY": 5200.0,
    "BATT_LOW_VOLT": 14.0,
    "BATT_CRT_VOLT": 13.2,
    "GPS_TYPE": 1.0,
    "FENCE_ENABLE": 0.0,
    "FENCE_TYPE": 7.0,
    "FENCE_ALT_MAX": 100.0,
    "FENCE_RADIUS": 300.0,
    "COMPASS_USE": 1.0,
    "LOG_BITMASK": 176126.0,
    "SERIAL0_BAUD": 115200.0,
    "SR0_POSITION": 2.0,
    "SR0_EXTRA1": 4.0,
    "SR0_EXTRA2": 4.0,
    "SR0_EXTRA3": 2.0,
    "SR0_RAW_SENS": 2.0,
    "SR0_RC_CHAN": 2.0,
}

_COMMON_PX4_PARAMS = {
    "COM_ARM_EKF": 0.8,
    "COM_ARM_MAG": 0.5,
    "COM_DISARM_LAND": 2.0,
    "COM_RC_LOSS_T": 0.5,
    "COM_DL_LOSS_T": 10.0,
    "BAT_V_CHARGED": 4.2,
    "BAT_V_EMPTY": 3.5,
    "BAT_N_CELLS": 4.0,
    "BAT_CAPACITY": 5200.0,
    "BAT_LOW_THR": 0.15,
    "BAT_CRIT_THR": 0.07,
    "SYS_AUTOSTART": 4001.0,
    "SYS_AUTOCONFIG": 0.0,
    "NAV_ACC_RAD": 2.0,
}


def _make_params(vehicle_type, autopilot):
    """Build a parameter dict for a given vehicle type and autopilot."""
    params = {}

    if autopilot == "ardu":
        params.update(_COMMON_ARDU_PARAMS)

        if vehicle_type == "quad":
            params.update({
                "ARMING_CHECK": 1.0, "ARMING_REQUIRE": 1.0,
                "WP_RADIUS": 2.0, "WP_SPEED": 5.0, "WP_YAW_BEHAVIOR": 1.0,
                "RTL_ALT": 3000.0, "RTL_SPEED": 0.0,
                "WPNAV_SPEED": 500.0, "WPNAV_ACCEL": 100.0,
                "WPNAV_SPEED_UP": 250.0, "WPNAV_SPEED_DN": 150.0,
                "FLTMODE1": 0.0, "FLTMODE2": 2.0, "FLTMODE3": 5.0,
                "FLTMODE4": 4.0, "FLTMODE5": 3.0, "FLTMODE6": 6.0,
                "PILOT_SPEED_UP": 250.0, "PILOT_SPEED_DN": 0.0,
                "PILOT_ACCEL_Z": 250.0,
                "INS_ACCEL_FILTER": 20.0, "INS_GYRO_FILTER": 20.0,
                "ATC_RAT_RLL_P": 0.135, "ATC_RAT_PIT_P": 0.135,
                "ATC_RAT_YAW_P": 0.18,
                "MOT_BAT_VOLT_MAX": 16.8, "MOT_BAT_VOLT_MIN": 13.2,
                "FRAME_CLASS": 1.0, "FRAME_TYPE": 1.0,
            })

        elif vehicle_type == "plane":
            params.update({
                "ARMING_CHECK": 1.0, "ARMING_REQUIRE": 1.0,
                "TECS_CLMB_MAX": 5.0, "TECS_SINK_MIN": 2.0,
                "TECS_SINK_MAX": 5.0, "TECS_PITCH_MAX": 20.0,
                "ARSPD_FBW_MIN": 12.0, "ARSPD_FBW_MAX": 28.0,
                "NAVL1_PERIOD": 17.0, "NAVL1_DAMPING": 0.75,
                "TKOFF_THR_MAX": 75.0, "LAND_FLARE_SEC": 2.0,
                "STAB_PITCH_DOWN": 2.0,
                "THR_MAX": 75.0, "THR_MIN": 0.0,
                "WP_RADIUS": 30.0, "WP_LOITER_RAD": 60.0,
                "RTL_AUTOLAND": 0.0,
                "FLTMODE1": 0.0, "FLTMODE2": 5.0, "FLTMODE3": 10.0,
                "FLTMODE4": 12.0, "FLTMODE5": 15.0, "FLTMODE6": 11.0,
                "INS_ACCEL_FILTER": 20.0, "INS_GYRO_FILTER": 20.0,
            })

        elif vehicle_type == "vtol":
            params.update({
                "ARMING_CHECK": 1.0, "ARMING_REQUIRE": 1.0,
                "TECS_CLMB_MAX": 5.0, "TECS_SINK_MIN": 2.0,
                "TECS_SINK_MAX": 5.0, "TECS_PITCH_MAX": 20.0,
                "ARSPD_FBW_MIN": 12.0, "ARSPD_FBW_MAX": 28.0,
                "NAVL1_PERIOD": 17.0, "NAVL1_DAMPING": 0.75,
                "THR_MAX": 75.0, "THR_MIN": 0.0,
                "Q_ENABLE": 1.0, "Q_FRAME_CLASS": 1.0,
                "Q_HOVER_ALT": 10.0, "Q_TRANSITION_MS": 5000.0,
                "Q_ASSIST_SPEED": 15.0, "Q_RTL_MODE": 0.0,
                "WP_RADIUS": 15.0, "WP_LOITER_RAD": 40.0,
                "FLTMODE1": 17.0, "FLTMODE2": 18.0, "FLTMODE3": 10.0,
                "FLTMODE4": 12.0, "FLTMODE5": 15.0, "FLTMODE6": 11.0,
                "INS_ACCEL_FILTER": 20.0, "INS_GYRO_FILTER": 20.0,
            })

        elif vehicle_type in ("rover", "boat"):
            params.update({
                "ARMING_CHECK": 1.0, "ARMING_REQUIRE": 1.0,
                "CRUISE_SPEED": 3.0 if vehicle_type == "rover" else 2.0,
                "CRUISE_THROTTLE": 50.0,
                "WP_RADIUS": 2.0, "WP_SPEED": 3.0,
                "TURN_RADIUS": 0.9, "TURN_MAX_G": 0.6,
                "ATC_STR_RAT_P": 0.2, "ATC_SPEED_P": 0.4,
                "MOT_THR_MAX": 100.0, "SPEED_MAX": 4.0 if vehicle_type == "rover" else 3.0,
                "FLTMODE1": 0.0, "FLTMODE2": 10.0, "FLTMODE3": 15.0,
                "FLTMODE4": 11.0, "FLTMODE5": 4.0, "FLTMODE6": 3.0,
            })
            if vehicle_type == "boat":
                params["MOT_PWM_TYPE"] = 4.0

    else:  # px4
        params.update(_COMMON_PX4_PARAMS)

        if vehicle_type == "quad":
            params.update({
                "MPC_XY_VEL_MAX": 12.0, "MPC_Z_VEL_MAX_UP": 3.0,
                "MPC_Z_VEL_MAX_DN": 1.0, "MPC_TILTMAX_AIR": 45.0,
                "MC_ROLLRATE_MAX": 220.0, "MC_PITCHRATE_MAX": 220.0,
                "MC_YAWRATE_MAX": 200.0,
                "MPC_THR_HOVER": 0.5, "MPC_LAND_SPEED": 0.7,
            })

        elif vehicle_type == "plane":
            params.update({
                "FW_AIRSPD_MIN": 12.0, "FW_AIRSPD_MAX": 28.0,
                "FW_AIRSPD_TRIM": 20.0,
                "FW_R_LIM": 50.0, "FW_P_LIM_MAX": 30.0, "FW_P_LIM_MIN": -15.0,
                "FW_THR_MAX": 1.0, "FW_THR_MIN": 0.0,
                "RWTO_TKOFF": 0.0,
            })

        elif vehicle_type == "vtol":
            params.update({
                "VT_TYPE": 2.0, "VT_ARSP_TRANS": 15.0,
                "VT_B_TRANS_DUR": 3.0, "VT_F_TRANS_DUR": 5.0,
                "VT_FW_PERM_STAB": 0.0,
                "MPC_XY_VEL_MAX": 12.0, "MPC_Z_VEL_MAX_UP": 3.0,
                "MPC_Z_VEL_MAX_DN": 1.0,
                "FW_AIRSPD_MIN": 12.0, "FW_AIRSPD_MAX": 28.0,
                "FW_AIRSPD_TRIM": 20.0,
            })

        elif vehicle_type in ("rover", "boat"):
            params.update({
                "GND_SPEED_MAX": 4.0 if vehicle_type == "rover" else 3.0,
                "GND_SPEED_TRIM": 3.0 if vehicle_type == "rover" else 2.0,
                "GND_L1_PERIOD": 10.0, "GND_L1_DAMPING": 0.75,
            })

    # Add SYSID at the end (will be overwritten per-vehicle)
    params["SYSID_THISMAV"] = 1.0
    return params


# ---------------------------------------------------------------------------
# MockVehicle
# ---------------------------------------------------------------------------

class MockVehicle:
    """Simulates a single MAVLink vehicle of any type and autopilot."""

    def __init__(self, drone_id, port, base_lat, base_lon, vehicle_type="quad", autopilot="ardu"):
        self.drone_id = drone_id
        self.port = port
        self.sysid = drone_id + 1
        self.compid = 1
        self.vehicle_type = vehicle_type
        self.autopilot = autopilot
        self.config = VEHICLE_CONFIGS[vehicle_type]

        # Position state
        self.home_lat = base_lat
        self.home_lon = base_lon
        self.home_alt_msl = 10.0  # Ground elevation MSL at home
        self.lat = base_lat
        self.lon = base_lon
        self.alt = 0.0
        self.alt_msl = 10.0
        self.heading = 0.0
        self.groundspeed = 0.0
        self.airspeed = 0.0
        self.climb = 0.0
        self.vx = 0.0
        self.vy = 0.0

        # Attitude
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0
        self.rollspeed = 0.0
        self.pitchspeed = 0.0
        self.yawspeed = 0.0

        # State
        self.armed = False
        self._set_default_mode()
        self.flying = False
        self.target_alt = self.config["default_alt"]

        # Pattern parameters
        self._pattern_t = random.uniform(0, 2 * math.pi)
        radius = self.config["pattern_radius"]
        self._pattern_radius = radius + random.uniform(-radius * 0.1, radius * 0.1)
        speed_lo, speed_hi = self.config["cruise_speed"]
        self._cruise_speed = random.uniform(speed_lo, speed_hi)
        self._pattern_speed = 0.15 + random.uniform(-0.02, 0.02)  # rad/s for figure-8
        self._pattern_center_lat = base_lat
        self._pattern_center_lon = base_lon
        self._pattern_active = False

        # Racetrack state (plane)
        self._racetrack_phase = 0  # 0=straight1, 1=turn1, 2=straight2, 3=turn2
        self._racetrack_progress = 0.0
        self._racetrack_straight_len = radius * 1.5
        self._racetrack_turn_radius = radius * 0.3

        # Patrol state (rover) - rectangular waypoints
        self._patrol_wps = self._make_patrol_waypoints(base_lat, base_lon, radius)
        self._patrol_idx = 0

        # Meander state (boat)
        self._meander_t = random.uniform(0, 2 * math.pi)
        self._meander_base_heading = random.uniform(0, 2 * math.pi)

        # Mission storage
        self.mission_items = []
        self.mission_count_expected = 0
        self.mission_current_seq = 0
        self.mission_flying = False
        self.wp_acceptance_radius = 8.0

        # Fence storage
        self.fence_items = []
        self.fence_count_expected = 0

        # Guided mode target
        self.guided_target = None

        # Parameters
        self.params = _make_params(vehicle_type, autopilot)
        self.params["SYSID_THISMAV"] = float(self.sysid)

        # Battery simulation
        self.voltage = 16.8
        self.current = 0.5
        self.remaining = 100
        self._batt_start_time = time.time()

        # Wind simulation
        self.wind_speed = random.uniform(0, 3)
        self.wind_dir = random.uniform(0, 2 * math.pi)

        # GPS noise
        self.gps_noise = 0.000001

        # Vibration
        self.vibe_x = 0.0
        self.vibe_y = 0.0
        self.vibe_z = 0.0

        # Wave simulation (boat)
        self._wave_phase = random.uniform(0, 2 * math.pi)
        self._wave_period = random.uniform(3, 6)

        # Connection
        self.conn = None
        self.running = False
        self.thread = None
        self._src_system = 255
        self._src_component = 0

    def _set_default_mode(self):
        """Set mode to the idle/disarmed default for this vehicle+autopilot."""
        if self.autopilot == "ardu":
            self.mode = ARDU_IDLE_MODE[self.vehicle_type]
        else:
            self.mode = PX4_IDLE_MODE

    def _make_patrol_waypoints(self, center_lat, center_lon, radius):
        """Create rectangular patrol waypoints for rover."""
        wps = []
        for angle_deg in [0, 90, 180, 270]:
            angle = math.radians(angle_deg + random.uniform(-10, 10))
            lat, lon = move_latlon(center_lat, center_lon, angle, radius)
            wps.append((lat, lon))
        return wps

    # -------------------------------------------------------------------
    # Lifecycle
    # -------------------------------------------------------------------

    def start(self):
        conn_str = f"udpout:127.0.0.1:{self.port}"
        self.conn = mavutil.mavlink_connection(
            conn_str, source_system=self.sysid, source_component=self.compid,
        )
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        type_label = VEHICLE_TYPE_NAMES.get(self.config["mav_type"], self.vehicle_type)
        ap_label = "ArduPilot" if self.autopilot == "ardu" else "PX4"
        print(f"  Vehicle {self.drone_id} [{type_label}/{ap_label}] (sysid={self.sysid}) -> udpin:0.0.0.0:{self.port}")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)

    # -------------------------------------------------------------------
    # Main loop
    # -------------------------------------------------------------------

    def _run(self):
        last_send = 0
        last_slow_send = 0
        recv_thread = threading.Thread(target=self._recv_loop, daemon=True)
        recv_thread.start()

        startup_time = time.time() + 2.0
        auto_started = False

        while self.running:
            now = time.time()
            dt = now - last_send if last_send else 0.1

            if not auto_started and now > startup_time:
                self.armed = True
                self.flying = True
                if self.autopilot == "ardu":
                    self.mode = ARDU_DEFAULT_MODE[self.vehicle_type]
                else:
                    self.mode = PX4_DEFAULT_MODE
                auto_started = True
                # Planes start in the air at cruise speed (no ground roll sim)
                if not self.config["can_hover"] and self.config["can_fly"]:
                    self.groundspeed = self._cruise_speed
                    self.airspeed = self._cruise_speed
                type_label = VEHICLE_TYPE_NAMES.get(self.config["mav_type"], self.vehicle_type)
                print(f"  Vehicle {self.drone_id} [{type_label}]: Auto-armed and active")

            self._update_sim(dt)

            if now - last_send >= 0.1:
                self._send_heartbeat()
                self._send_global_position()
                self._send_attitude()
                self._send_gps_raw()
                self._send_vfr_hud()
                self._send_sys_status()
                self._send_mission_current()
                last_send = now

            if now - last_slow_send >= 0.5:
                self._send_vibration()
                self._send_battery2()
                self._send_ekf_status()
                self._send_home_position()
                self._send_system_time()
                last_slow_send = now

            time.sleep(0.02)

    def _recv_loop(self):
        while self.running:
            try:
                msg = self.conn.recv_match(blocking=True, timeout=0.5)
                if msg is None:
                    continue
                self._src_system = msg.get_srcSystem()
                self._src_component = msg.get_srcComponent()
                self._handle_message(msg)
            except Exception:
                pass

    # -------------------------------------------------------------------
    # Simulation update
    # -------------------------------------------------------------------

    def _update_sim(self, dt):
        if dt <= 0 or dt > 1:
            return

        cfg = self.config
        can_fly = cfg["can_fly"]

        # Battery drain
        if self.armed:
            if self.flying and (self.alt > 1 or not can_fly):
                drain_rate = cfg["battery_drain_flying"] + self.groundspeed * 0.003
                self.current = 12.0 + self.groundspeed * 1.5 + random.uniform(-0.5, 0.5)
            else:
                drain_rate = cfg["battery_drain_idle"]
                self.current = 1.5 + random.uniform(-0.2, 0.2)
            self.remaining = max(0, self.remaining - drain_rate * dt)
            self.voltage = 13.2 + (self.remaining / 100.0) * 3.6 + random.uniform(-0.05, 0.05)
        else:
            self.current = 0.3 + random.uniform(-0.1, 0.1)
            self.voltage = 16.8 + random.uniform(-0.02, 0.02)

        # Vibration
        if self.flying and (self.alt > 0.5 or not can_fly):
            base = 8 if can_fly else 3
            self.vibe_x = base + random.uniform(-3, 3)
            self.vibe_y = base + random.uniform(-3, 3)
            self.vibe_z = (base + 4 if can_fly else base) + random.uniform(-5, 5)
        else:
            self.vibe_x = random.uniform(0, 1)
            self.vibe_y = random.uniform(0, 1)
            self.vibe_z = random.uniform(0, 2)

        # Altitude changes (only for flying vehicles)
        if can_fly:
            if self.flying:
                alt_diff = self.target_alt - self.alt
                max_climb = cfg["max_climb"]
                if abs(alt_diff) > 0.3:
                    climb_rate = min(max_climb, max(-max_climb * 0.8, alt_diff * 0.8))
                    self.alt += climb_rate * dt
                    self.climb = climb_rate
                else:
                    self.alt = self.target_alt
                    self.climb = random.uniform(-0.1, 0.1)
            else:
                if self.alt > 0.1:
                    self.alt = max(0, self.alt - 2.5 * dt)
                    self.climb = -2.5
                else:
                    self.alt = 0
                    self.climb = 0
                    self.groundspeed = 0
                    self.airspeed = 0
                    self.roll = 0
                    self.pitch = 0
                    self.vx = 0
                    self.vy = 0
        else:
            # Ground/surface vehicles: alt always 0
            self.alt = 0
            self.climb = 0

        self.alt_msl = 10.0 + self.alt

        # Horizontal movement
        is_active = self.flying and (self.alt > 2.0 if can_fly else True)
        if is_active:
            mode_upper = self.mode.upper()

            if mode_upper in ("AUTO", "AUTO_MISSION") and self.mission_flying:
                self._fly_mission(dt)
            elif mode_upper in ("GUIDED", "POSCTL", "OFFBOARD") and self.guided_target:
                self._fly_to_target(dt, self.guided_target[0], self.guided_target[1], self.guided_target[2])
            elif mode_upper in ("RTL", "AUTO_RTL", "SMART_RTL"):
                self._fly_rtl(dt)
            elif mode_upper in ("LAND", "QLAND", "AUTO_LAND"):
                self._fly_land(dt)
            else:
                self._fly_default_pattern(dt)

        # Attitude simulation
        self._update_attitude(dt)

    def _fly_rtl(self, dt):
        """Return to launch."""
        dist = haversine(self.lat, self.lon, self.home_lat, self.home_lon)
        if dist > 3:
            rtl_alt = 15.0 if self.config["can_fly"] else 0
            self._fly_to_target(dt, self.home_lat, self.home_lon, rtl_alt)
        else:
            if self.config["can_fly"]:
                self.target_alt = 0
                self.flying = True
                if self.alt < 0.5:
                    self.armed = False
                    self.flying = False
                    self._set_default_mode()
                    print(f"  Vehicle {self.drone_id}: RTL complete, disarmed")
            else:
                self.armed = False
                self.flying = False
                self._set_default_mode()
                self.groundspeed = 0
                print(f"  Vehicle {self.drone_id}: RTL complete, disarmed")

    def _fly_land(self, dt):
        """Land the vehicle."""
        if self.config["can_fly"]:
            self.target_alt = 0
            if self.alt < 0.5:
                self.armed = False
                self.flying = False
                self._set_default_mode()
                print(f"  Vehicle {self.drone_id}: Landed, disarmed")
        else:
            self.armed = False
            self.flying = False
            self._set_default_mode()
            self.groundspeed = 0
            print(f"  Vehicle {self.drone_id}: Stopped, disarmed")

    def _fly_default_pattern(self, dt):
        """Fly the default pattern for this vehicle type."""
        pattern = self.config["pattern"]
        if pattern == "figure8":
            self._fly_figure8(dt)
        elif pattern == "racetrack":
            self._fly_racetrack(dt)
        elif pattern == "patrol":
            self._fly_patrol(dt)
        elif pattern == "meander":
            self._fly_meander(dt)

    def _update_attitude(self, dt):
        """Update roll/pitch/yaw based on vehicle type and state."""
        cfg = self.config
        is_active = self.flying and (self.alt > 1 if cfg["can_fly"] else True)

        if is_active:
            if cfg["can_fly"]:
                # Airborne vehicles: bank in turns, pitch when moving forward
                max_bank = cfg["max_bank"]
                target_roll = math.radians(max(-max_bank, min(max_bank, self.yawspeed * 15)))
                self.roll += (target_roll - self.roll) * min(1, 3 * dt)
                max_pitch = cfg["max_pitch"]
                target_pitch = math.radians(-max(0, min(max_pitch, self.groundspeed * 1.0)))
                self.pitch += (target_pitch - self.pitch) * min(1, 3 * dt)
            elif self.vehicle_type == "boat":
                # Boat: wave-induced roll
                self._wave_phase += dt * (2 * math.pi / self._wave_period)
                target_roll = math.radians(cfg["max_bank"] * math.sin(self._wave_phase))
                self.roll += (target_roll - self.roll) * min(1, 2 * dt)
                self.pitch = math.radians(random.uniform(-cfg["max_pitch"], cfg["max_pitch"]))
            else:
                # Rover: minimal jitter
                self.roll = math.radians(random.uniform(-cfg["max_bank"], cfg["max_bank"]))
                self.pitch = math.radians(random.uniform(-cfg["max_pitch"], cfg["max_pitch"]))

            self.rollspeed = random.uniform(-0.02, 0.02)
            self.pitchspeed = random.uniform(-0.02, 0.02)
        else:
            self.roll *= 0.9
            self.pitch *= 0.9
            self.rollspeed = 0
            self.pitchspeed = 0
            self.yawspeed = 0

    # -------------------------------------------------------------------
    # Flight patterns
    # -------------------------------------------------------------------

    def _fly_figure8(self, dt):
        """Fly a figure-8 / lemniscate pattern (quad, vtol)."""
        self._pattern_t += self._pattern_speed * dt

        t = self._pattern_t
        denom = 1 + math.sin(t) ** 2
        target_x = self._pattern_radius * math.cos(t) / denom
        target_y = self._pattern_radius * math.sin(t) * math.cos(t) / denom

        target_lat = self._pattern_center_lat + target_x / 111000.0
        cos_lat = math.cos(math.radians(self._pattern_center_lat))
        target_lon = self._pattern_center_lon + target_y / (111000.0 * cos_lat)

        self._move_toward(dt, target_lat, target_lon, speed=self._cruise_speed)

    def _fly_racetrack(self, dt):
        """Fly a racetrack oval pattern (plane).

        The racetrack consists of:
          phase 0: straight leg 1 (heading ~0°)
          phase 1: semicircular turn (180°)
          phase 2: straight leg 2 (heading ~180°)
          phase 3: semicircular turn (180°)
        """
        speed = self._cruise_speed
        stall = self.config["stall_speed"]
        speed = max(speed, stall + 2)  # stay above stall

        straight = self._racetrack_straight_len
        turn_r = self._racetrack_turn_radius
        semi_circumference = math.pi * turn_r

        # Determine how far we move this tick
        move = speed * dt

        phase = self._racetrack_phase
        progress = self._racetrack_progress + move

        # Phase lengths
        if phase in (0, 2):
            phase_len = straight
        else:
            phase_len = semi_circumference

        if progress >= phase_len:
            progress -= phase_len
            phase = (phase + 1) % 4
            self._racetrack_phase = phase

        self._racetrack_progress = progress

        # Compute target position based on phase
        center_lat = self._pattern_center_lat
        center_lon = self._pattern_center_lon
        cos_lat = math.cos(math.radians(center_lat))

        half_straight = straight / 2.0

        if phase == 0:
            # Straight leg going "north" (positive x)
            frac = progress / straight
            x = -half_straight + straight * frac
            y = -turn_r
        elif phase == 1:
            # Semicircular turn at north end
            angle = progress / semi_circumference * math.pi
            x = half_straight + turn_r * math.sin(angle)
            y = -turn_r + turn_r * (1 - math.cos(angle))
        elif phase == 2:
            # Straight leg going "south"
            frac = progress / straight
            x = half_straight - straight * frac
            y = turn_r
        else:
            # Semicircular turn at south end
            angle = progress / semi_circumference * math.pi
            x = -half_straight - turn_r * math.sin(angle)
            y = turn_r - turn_r * (1 - math.cos(angle))

        target_lat = center_lat + x / 111000.0
        target_lon = center_lon + y / (111000.0 * cos_lat)

        self._move_toward(dt, target_lat, target_lon, speed=speed)

        # Enforce minimum speed for planes (cannot stop mid-air)
        if self.groundspeed < stall and self.config["can_fly"]:
            self.groundspeed = stall
            self.airspeed = stall + self.wind_speed * 0.5

    def _fly_patrol(self, dt):
        """Fly a rectangular patrol route (rover)."""
        if not self._patrol_wps:
            return

        target_lat, target_lon = self._patrol_wps[self._patrol_idx]
        dist = haversine(self.lat, self.lon, target_lat, target_lon)

        if dist < 3.0:
            self._patrol_idx = (self._patrol_idx + 1) % len(self._patrol_wps)

        self._move_toward(dt, target_lat, target_lon, speed=self._cruise_speed)

    def _fly_meander(self, dt):
        """Fly a sinusoidal/meandering path (boat)."""
        self._meander_t += dt * 0.3  # slow oscillation
        speed = self._cruise_speed

        # Base direction slowly rotates + sinusoidal offset
        base_heading = self._meander_base_heading + self._meander_t * 0.05
        wobble = 0.6 * math.sin(self._meander_t * 1.5)
        heading_rad = base_heading + wobble

        # Soft boundary: blend heading toward center as we approach the edge
        dist_from_center = haversine(self.lat, self.lon,
                                     self._pattern_center_lat, self._pattern_center_lon)
        edge_ratio = dist_from_center / self._pattern_radius
        if edge_ratio > 0.7:
            # Gradually steer toward center (smooth blending, no hard flip)
            toward_center = bearing(self.lat, self.lon,
                                    self._pattern_center_lat, self._pattern_center_lon)
            blend = min(1.0, (edge_ratio - 0.7) / 0.3)  # 0 at 70%, 1 at 100%
            # Blend headings using angular interpolation
            diff = math.atan2(math.sin(toward_center - heading_rad),
                              math.cos(toward_center - heading_rad))
            heading_rad += diff * blend * 0.8
            if edge_ratio > 0.95:
                self._meander_base_heading = toward_center

        # Move forward along the heading
        move_dist = speed * dt
        new_lat, new_lon = move_latlon(self.lat, self.lon, heading_rad, move_dist)

        # Update heading smoothly
        target_heading = math.degrees(heading_rad) % 360
        heading_diff = (target_heading - self.heading + 540) % 360 - 180
        self.yawspeed = math.radians(heading_diff) * 2
        self.heading = (self.heading + heading_diff * min(1, 3 * dt)) % 360
        self.yaw = math.radians(self.heading)

        # Add wind
        wind_lat = self.wind_speed * math.cos(self.wind_dir) * dt / 111000.0
        wind_lon = self.wind_speed * math.sin(self.wind_dir) * dt / (111000.0 * math.cos(math.radians(self.lat)))
        self.lat = new_lat + wind_lat
        self.lon = new_lon + wind_lon

        self.groundspeed = speed
        self.airspeed = 0  # boats don't have airspeed
        self.vx = speed * math.cos(heading_rad)
        self.vy = speed * math.sin(heading_rad)

    # -------------------------------------------------------------------
    # Navigation helpers
    # -------------------------------------------------------------------

    def _fly_mission(self, dt):
        """Fly the uploaded mission waypoints sequentially."""
        if not self.mission_items or self.mission_current_seq >= len(self.mission_items):
            self.mission_flying = False
            if self.autopilot == "ardu":
                self.mode = "LOITER" if self.config["can_fly"] else "HOLD"
            else:
                self.mode = "AUTO_LOITER"
            print(f"  Vehicle {self.drone_id}: Mission complete")
            return

        item = self.mission_items[self.mission_current_seq]
        if item is None:
            self.mission_current_seq += 1
            return

        # Get command ID to handle non-navigation items
        cmd = getattr(item, 'command', 16)

        # DO_JUMP (177): jump to target seq
        if cmd == 177:
            target_seq = int(getattr(item, 'param1', 0))
            repeat = int(getattr(item, 'param2', 0))
            if repeat != 0 and target_seq < len(self.mission_items):
                # Decrement repeat count (0 = infinite, -1 = exhausted)
                if repeat > 0:
                    item.param2 = repeat - 1
                self.mission_current_seq = target_seq
                print(f"  Vehicle {self.drone_id}: DO_JUMP -> seq {target_seq} (repeats left: {repeat - 1 if repeat > 0 else 'inf'})")
            else:
                self.mission_current_seq += 1
            return

        # Skip non-navigation commands (DO_* commands with cmd >= 200)
        if cmd >= 200 or cmd in (93, 94, 95, 112, 113, 114, 115):
            self.mission_current_seq += 1
            return

        mtype = item.get_type()
        if mtype == "MISSION_ITEM_INT":
            wp_lat = item.x / 1e7
            wp_lon = item.y / 1e7
            wp_alt = item.z if item.z > 0 else self.target_alt
        elif mtype == "MISSION_ITEM":
            wp_lat = item.x
            wp_lon = item.y
            wp_alt = item.z if item.z > 0 else self.target_alt
        else:
            self.mission_current_seq += 1
            return

        # Skip home position at seq 0 or zero-coordinate items
        if self.mission_current_seq == 0 or (wp_lat == 0 and wp_lon == 0):
            self.mission_current_seq += 1
            return

        if self.config["can_fly"]:
            self.target_alt = wp_alt
        dist = haversine(self.lat, self.lon, wp_lat, wp_lon)

        if dist < self.wp_acceptance_radius:
            print(f"  Vehicle {self.drone_id}: Reached WP {self.mission_current_seq} ({dist:.1f}m)")
            self.mission_current_seq += 1
        else:
            self._fly_to_target(dt, wp_lat, wp_lon, wp_alt)

    def _fly_to_target(self, dt, target_lat, target_lon, target_alt):
        """Fly toward a specific lat/lon/alt."""
        if self.config["can_fly"]:
            self.target_alt = target_alt
        self._move_toward(dt, target_lat, target_lon, speed=self._cruise_speed)

    def _move_toward(self, dt, target_lat, target_lon, speed=5.0):
        """Move vehicle position toward target at given speed."""
        dist = haversine(self.lat, self.lon, target_lat, target_lon)
        if dist < 0.5:
            self.groundspeed *= 0.9
            return

        # Enforce minimum speed for planes
        stall = self.config["stall_speed"]
        if stall > 0 and speed < stall + 2:
            speed = stall + 2

        brng = bearing(self.lat, self.lon, target_lat, target_lon)
        move_dist = min(speed * dt, dist)

        # Wind effect
        wind_lat = self.wind_speed * math.cos(self.wind_dir) * dt / 111000.0
        cos_lat = math.cos(math.radians(self.lat))
        wind_lon = self.wind_speed * math.sin(self.wind_dir) * dt / (111000.0 * cos_lat)

        new_lat, new_lon = move_latlon(self.lat, self.lon, brng, move_dist)
        new_lat += wind_lat
        new_lon += wind_lon

        # Heading smoothly tracks bearing
        target_heading = math.degrees(brng) % 360
        heading_diff = (target_heading - self.heading + 540) % 360 - 180

        # Turn rate limit based on vehicle type
        max_turn = self.config["turn_rate"] * dt
        heading_diff = max(-max_turn, min(max_turn, heading_diff))

        self.yawspeed = math.radians(heading_diff) * 2
        self.heading = (self.heading + heading_diff) % 360
        self.yaw = math.radians(self.heading)

        self.lat = new_lat
        self.lon = new_lon
        self.groundspeed = speed if dist > 1 else dist

        # Airspeed: meaningful for planes/vtols, 0 for ground vehicles
        if self.config["can_fly"]:
            self.airspeed = self.groundspeed + self.wind_speed * 0.5 + random.uniform(-0.3, 0.3)
        else:
            self.airspeed = 0

        self.vx = self.groundspeed * math.cos(brng)
        self.vy = self.groundspeed * math.sin(brng)

    # -------------------------------------------------------------------
    # Message handling
    # -------------------------------------------------------------------

    def _handle_message(self, msg):
        mtype = msg.get_type()

        if mtype == "COMMAND_LONG":
            self._handle_command(msg)
        elif mtype == "SET_MODE":
            self._handle_set_mode(msg)
        elif mtype == "MISSION_COUNT":
            self._handle_mission_count(msg)
        elif mtype in ("MISSION_ITEM_INT", "MISSION_ITEM"):
            self._handle_mission_item(msg)
        elif mtype == "MISSION_REQUEST_LIST":
            self._handle_mission_request_list(msg)
        elif mtype in ("MISSION_REQUEST_INT", "MISSION_REQUEST"):
            self._handle_mission_request_int(msg)
        elif mtype == "MISSION_ACK":
            pass
        elif mtype == "MISSION_CLEAR_ALL":
            self._handle_mission_clear(msg)
        elif mtype == "MISSION_SET_CURRENT":
            if msg.seq < len(self.mission_items):
                self.mission_current_seq = msg.seq
                print(f"  Vehicle {self.drone_id}: Mission current -> {msg.seq}")
        elif mtype == "PARAM_REQUEST_LIST":
            self._send_all_params()
        elif mtype == "PARAM_SET":
            self._handle_param_set(msg)
        elif mtype == "PARAM_REQUEST_READ":
            self._handle_param_read(msg)
        elif mtype == "RC_CHANNELS_OVERRIDE":
            pass
        elif mtype == "SET_POSITION_TARGET_GLOBAL_INT":
            self._handle_set_position_target(msg)
        elif mtype == "COMMAND_INT":
            self._handle_command_int(msg)

    def _handle_set_mode(self, msg):
        """Handle SET_MODE message (ArduPilot-style)."""
        if self.autopilot == "ardu":
            modes = ARDU_MODES[self.vehicle_type]
            self.mode = modes.get(msg.custom_mode, f"MODE_{msg.custom_mode}")
        else:
            # PX4: decode main/sub from custom_mode
            main_mode = (msg.custom_mode >> 16) & 0xFF
            sub_mode = (msg.custom_mode >> 24) & 0xFF
            self.mode = PX4_MODES.get((main_mode, sub_mode), f"PX4_{main_mode}_{sub_mode}")
        self._start_mode_behavior()
        self._send_statustext(f"Mode: {self.mode}")
        print(f"  Vehicle {self.drone_id}: Mode -> {self.mode}")

    def _start_mode_behavior(self):
        mode_upper = self.mode.upper()
        if mode_upper in ("AUTO", "AUTO_MISSION"):
            if self.mission_items:
                self.mission_flying = True
                if self.mission_current_seq == 0:
                    self.mission_current_seq = 1
                print(f"  Vehicle {self.drone_id}: Starting mission from WP {self.mission_current_seq}")
            else:
                print(f"  Vehicle {self.drone_id}: No mission loaded")
        else:
            self.mission_flying = False

    def _handle_command(self, msg):
        """Handle COMMAND_LONG messages."""
        cmd = msg.command

        # MAV_CMD_COMPONENT_ARM_DISARM (400)
        if cmd == 400:
            if msg.param1 == 1:
                self.armed = True
                self._send_statustext("Arming motors")
                print(f"  Vehicle {self.drone_id}: Armed")
            else:
                self.armed = False
                self.flying = False
                self.mission_flying = False
                self.groundspeed = 0
                self._send_statustext("Disarming motors")
                print(f"  Vehicle {self.drone_id}: Disarmed")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_TAKEOFF (22)
        elif cmd == 22:
            if self.armed and self.config["can_fly"]:
                self.target_alt = msg.param7 if msg.param7 > 0 else 10.0
                self.flying = True
                if self.autopilot == "ardu":
                    self.mode = ARDU_DEFAULT_MODE[self.vehicle_type]
                else:
                    self.mode = "AUTO_TAKEOFF"
                print(f"  Vehicle {self.drone_id}: Takeoff to {self.target_alt}m")
            elif self.armed and not self.config["can_fly"]:
                self.flying = True
                print(f"  Vehicle {self.drone_id}: Starting (ground vehicle)")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_LAND (21)
        elif cmd == 21:
            if self.config["can_fly"]:
                self.target_alt = 0
                if self.autopilot == "ardu":
                    self.mode = "LAND" if self.vehicle_type not in ("vtol",) else "QLAND"
                else:
                    self.mode = "AUTO_LAND"
            else:
                self.flying = False
                self.groundspeed = 0
            self.mission_flying = False
            print(f"  Vehicle {self.drone_id}: Landing/stopping")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_RETURN_TO_LAUNCH (20)
        elif cmd == 20:
            if self.autopilot == "ardu":
                self.mode = "RTL"
            else:
                self.mode = "AUTO_RTL"
            self.mission_flying = False
            if self.config["can_fly"]:
                self.target_alt = 15
            print(f"  Vehicle {self.drone_id}: RTL")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_MODE (176)
        elif cmd == 176:
            if self.autopilot == "ardu":
                modes = ARDU_MODES[self.vehicle_type]
                self.mode = modes.get(int(msg.param2), f"MODE_{int(msg.param2)}")
            else:
                # PX4: param2 is the encoded custom_mode
                custom = int(msg.param2)
                main_mode = (custom >> 16) & 0xFF
                sub_mode = (custom >> 24) & 0xFF
                self.mode = PX4_MODES.get((main_mode, sub_mode), f"PX4_{main_mode}_{sub_mode}")
            self._start_mode_behavior()
            print(f"  Vehicle {self.drone_id}: Mode -> {self.mode}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_WAYPOINT (goto via COMMAND_LONG)
        elif cmd == 16:
            if msg.param5 != 0 and msg.param6 != 0:
                self.guided_target = (msg.param5, msg.param6,
                                      msg.param7 if msg.param7 > 0 else self.target_alt)
                if self.autopilot == "ardu":
                    self.mode = "GUIDED"
                else:
                    self.mode = "POSCTL"
                print(f"  Vehicle {self.drone_id}: Goto {msg.param5:.6f}, {msg.param6:.6f}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_ROI (201)
        elif cmd == 201:
            print(f"  Vehicle {self.drone_id}: ROI set")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_HOME (179)
        elif cmd == 179:
            if msg.param1 == 1:
                self.home_lat = self.lat
                self.home_lon = self.lon
                self.home_alt_msl = self.alt_msl
            elif msg.param5 != 0:
                self.home_lat = msg.param5
                self.home_lon = msg.param6
                self.home_alt_msl = msg.param7 if msg.param7 != 0 else self.home_alt_msl
            self._send_statustext(f"Home: {self.home_lat:.6f}, {self.home_lon:.6f}")
            print(f"  Vehicle {self.drone_id}: Home set ({self.home_lat:.6f}, {self.home_lon:.6f})")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_MISSION_START (300)
        elif cmd == 300:
            if self.autopilot == "ardu":
                self.mode = "AUTO"
            else:
                self.mode = "AUTO_MISSION"
            self._start_mode_behavior()
            print(f"  Vehicle {self.drone_id}: Mission start")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_CHANGE_SPEED (178)
        elif cmd == 178:
            print(f"  Vehicle {self.drone_id}: Speed set to {msg.param2}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_REPOSITION (192)
        elif cmd == 192:
            if msg.param5 != 0 and msg.param6 != 0:
                self.guided_target = (
                    msg.param5 / 1e7 if abs(msg.param5) > 1000 else msg.param5,
                    msg.param6 / 1e7 if abs(msg.param6) > 1000 else msg.param6,
                    msg.param7 if msg.param7 > 0 else self.target_alt,
                )
                if self.autopilot == "ardu":
                    self.mode = "GUIDED"
                else:
                    self.mode = "POSCTL"
            self._send_command_ack(cmd, 0)

        # MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES (520)
        elif cmd == 520:
            self._send_autopilot_version()
            self._send_command_ack(cmd, 0)

        # MAV_CMD_SET_MESSAGE_INTERVAL (511) — PX4 uses this to request messages
        elif cmd == 511:
            # param1 = message id, param2 = interval in microseconds (-1 = disable)
            # We just ACK it; our send loop already sends everything
            self._send_command_ack(cmd, 0)

        # MAV_CMD_REQUEST_MESSAGE (512) — request a single message
        elif cmd == 512:
            msg_id = int(msg.param1)
            if msg_id == 242:  # HOME_POSITION
                self._send_home_position()
            elif msg_id == 148:  # AUTOPILOT_VERSION
                self._send_autopilot_version()
            self._send_command_ack(cmd, 0)

        else:
            self._send_command_ack(cmd, 0)

    def _handle_command_int(self, msg):
        cmd = msg.command
        if cmd in (192, 16):
            lat = msg.x / 1e7 if msg.x != 0 else None
            lon = msg.y / 1e7 if msg.y != 0 else None
            alt = msg.z if msg.z > 0 else self.target_alt
            if lat and lon:
                self.guided_target = (lat, lon, alt)
                if self.autopilot == "ardu":
                    self.mode = "GUIDED"
                else:
                    self.mode = "POSCTL"
        self._send_command_ack(cmd, 0)

    def _handle_set_position_target(self, msg):
        lat = msg.lat_int / 1e7
        lon = msg.lon_int / 1e7
        alt = msg.alt if msg.alt > 0 else self.target_alt
        if lat != 0 and lon != 0:
            self.guided_target = (lat, lon, alt)
            if self.autopilot == "ardu":
                self.mode = "GUIDED"
            else:
                self.mode = "POSCTL"

    # -------------------------------------------------------------------
    # Mission upload protocol
    # -------------------------------------------------------------------

    def _handle_mission_count(self, msg):
        mission_type = getattr(msg, 'mission_type', 0)
        if mission_type == 2:
            self.fence_count_expected = msg.count
            self.fence_items = [None] * msg.count
            print(f"  Vehicle {self.drone_id}: Fence upload started, expecting {msg.count} items")
            self.conn.mav.mission_request_int_send(
                msg.get_srcSystem(), msg.get_srcComponent(), 0, mission_type=2,
            )
        else:
            self.mission_count_expected = msg.count
            self.mission_items = [None] * msg.count
            self.mission_current_seq = 0
            print(f"  Vehicle {self.drone_id}: Mission upload started, expecting {msg.count} items")
            self.conn.mav.mission_request_int_send(
                msg.get_srcSystem(), msg.get_srcComponent(), 0, mission_type=0,
            )

    def _handle_mission_item(self, msg):
        mission_type = getattr(msg, 'mission_type', 0)
        seq = msg.seq

        if mission_type == 2:
            if seq < len(self.fence_items):
                self.fence_items[seq] = msg
                next_seq = seq + 1
                if next_seq < self.fence_count_expected:
                    self.conn.mav.mission_request_int_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), next_seq, mission_type=2,
                    )
                else:
                    self.conn.mav.mission_ack_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), 0, mission_type=2,
                    )
                    print(f"  Vehicle {self.drone_id}: Fence upload complete ({len(self.fence_items)} items)")
        else:
            if seq < len(self.mission_items):
                self.mission_items[seq] = msg
                next_seq = seq + 1
                if next_seq < self.mission_count_expected:
                    self.conn.mav.mission_request_int_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), next_seq, mission_type=0,
                    )
                else:
                    self.conn.mav.mission_ack_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), 0, mission_type=0,
                    )
                    print(f"  Vehicle {self.drone_id}: Mission upload complete ({len(self.mission_items)} items)")

    # -------------------------------------------------------------------
    # Mission download protocol
    # -------------------------------------------------------------------

    def _handle_mission_request_list(self, msg):
        mission_type = getattr(msg, 'mission_type', 0)
        if mission_type == 2:
            count = len([f for f in self.fence_items if f is not None])
            self.conn.mav.mission_count_send(
                msg.get_srcSystem(), msg.get_srcComponent(), count, mission_type=2,
            )
            print(f"  Vehicle {self.drone_id}: Fence download requested, {count} items")
        else:
            count = len([m for m in self.mission_items if m is not None])
            self.conn.mav.mission_count_send(
                msg.get_srcSystem(), msg.get_srcComponent(), count, mission_type=0,
            )
            print(f"  Vehicle {self.drone_id}: Mission download requested, {count} items")

    def _handle_mission_request_int(self, msg):
        seq = msg.seq
        mission_type = getattr(msg, 'mission_type', 0)

        if mission_type == 2:
            if seq < len(self.fence_items) and self.fence_items[seq] is not None:
                item = self.fence_items[seq]
                self.conn.mav.mission_item_int_send(
                    msg.get_srcSystem(), msg.get_srcComponent(), seq,
                    getattr(item, 'frame', 0), getattr(item, 'command', 5003),
                    0, 0,
                    getattr(item, 'param1', 0), getattr(item, 'param2', 0),
                    getattr(item, 'param3', 0), getattr(item, 'param4', 0),
                    getattr(item, 'x', 0), getattr(item, 'y', 0), getattr(item, 'z', 0),
                    mission_type=2,
                )
        else:
            if seq < len(self.mission_items) and self.mission_items[seq] is not None:
                item = self.mission_items[seq]
                self.conn.mav.mission_item_int_send(
                    msg.get_srcSystem(), msg.get_srcComponent(), seq,
                    getattr(item, 'frame', 3), getattr(item, 'command', 16),
                    1 if seq == self.mission_current_seq else 0, 1,
                    getattr(item, 'param1', 0), getattr(item, 'param2', 0),
                    getattr(item, 'param3', 0), getattr(item, 'param4', 0),
                    getattr(item, 'x', 0), getattr(item, 'y', 0), getattr(item, 'z', 0),
                    mission_type=0,
                )
            else:
                self.conn.mav.mission_ack_send(
                    msg.get_srcSystem(), msg.get_srcComponent(), 1, mission_type=0,
                )

    def _handle_mission_clear(self, msg):
        mission_type = getattr(msg, 'mission_type', 0)
        if mission_type == 2:
            self.fence_items = []
            self.fence_count_expected = 0
            print(f"  Vehicle {self.drone_id}: Fence cleared")
        else:
            self.mission_items = []
            self.mission_count_expected = 0
            self.mission_current_seq = 0
            self.mission_flying = False
            print(f"  Vehicle {self.drone_id}: Mission cleared")
        self.conn.mav.mission_ack_send(
            msg.get_srcSystem(), msg.get_srcComponent(), 0, mission_type=mission_type,
        )

    # -------------------------------------------------------------------
    # Parameters
    # -------------------------------------------------------------------

    def _send_all_params(self):
        items = list(self.params.items())
        for i, (name, value) in enumerate(items):
            self.conn.mav.param_value_send(
                name.encode('utf-8'), value,
                mavutil.mavlink.MAV_PARAM_TYPE_REAL32, len(items), i,
            )
            time.sleep(0.01)

    def _handle_param_set(self, msg):
        name = msg.param_id.rstrip('\x00')
        self.params[name] = msg.param_value
        idx = list(self.params.keys()).index(name) if name in self.params else 0
        self.conn.mav.param_value_send(
            name.encode('utf-8'), msg.param_value,
            mavutil.mavlink.MAV_PARAM_TYPE_REAL32, len(self.params), idx,
        )
        print(f"  Vehicle {self.drone_id}: Param {name} = {msg.param_value}")

    def _handle_param_read(self, msg):
        name = msg.param_id.rstrip('\x00')
        if msg.param_index >= 0:
            items = list(self.params.items())
            if msg.param_index < len(items):
                name, value = items[msg.param_index]
                self.conn.mav.param_value_send(
                    name.encode('utf-8'), value,
                    mavutil.mavlink.MAV_PARAM_TYPE_REAL32, len(self.params), msg.param_index,
                )
        elif name in self.params:
            idx = list(self.params.keys()).index(name)
            self.conn.mav.param_value_send(
                name.encode('utf-8'), self.params[name],
                mavutil.mavlink.MAV_PARAM_TYPE_REAL32, len(self.params), idx,
            )

    # -------------------------------------------------------------------
    # Telemetry senders
    # -------------------------------------------------------------------

    def _send_command_ack(self, command, result):
        self.conn.mav.command_ack_send(
            command, result,
            progress=255,  # not applicable
            result_param2=0,
            target_system=self._src_system,
            target_component=self._src_component,
        )

    def _send_statustext(self, text, severity=6):
        """Send STATUSTEXT. severity: 6=INFO, 4=WARNING, 3=ERROR."""
        padded = text.encode("utf-8")[:50].ljust(50, b"\x00")
        self.conn.mav.statustext_send(severity, padded)

    def _send_heartbeat(self):
        state = 4 if self.armed else 3  # ACTIVE / STANDBY
        # MAV_MODE_FLAG: bit 0=CUSTOM(1), bit 2=TEST(4), bit 3=AUTO(8),
        # bit 4=GUIDED(16), bit 5=STABILIZE(32), bit 6=HIL(64), bit 7=SAFETY_ARMED(128)
        mode_flags = 1  # CUSTOM_MODE_ENABLED always set
        if self.armed:
            mode_flags |= 128  # SAFETY_ARMED

        mode_upper = self.mode.upper()

        # Set mode-appropriate flags
        auto_modes = {"AUTO", "AUTO_MISSION", "AUTO_RTL", "AUTO_LAND", "AUTO_TAKEOFF",
                       "AUTO_LOITER", "AUTO_READY", "RTL", "LAND", "QLAND", "QRTL",
                       "SMART_RTL", "CIRCLE", "LOITER"}
        guided_modes = {"GUIDED", "POSCTL", "GUIDED_NOGPS", "OFFBOARD"}
        stabilize_modes = {"STABILIZE", "ALT_HOLD", "QSTABILIZE", "QHOVER", "QLOITER",
                           "STABILIZED", "ALTCTL", "FBWA", "FBWB", "CRUISE",
                           "HOLD", "STEERING", "POSHOLD"}
        manual_modes = {"MANUAL", "ACRO", "TRAINING", "SPORT", "RATTITUDE"}

        if mode_upper in auto_modes:
            mode_flags |= 4  # AUTO_ENABLED
        elif mode_upper in guided_modes:
            mode_flags |= 8  # GUIDED_ENABLED
        elif mode_upper in stabilize_modes:
            mode_flags |= 16  # STABILIZE_ENABLED
        elif mode_upper in manual_modes:
            mode_flags |= 64  # MANUAL_INPUT_ENABLED
        else:
            mode_flags |= 16  # default to stabilize

        mav_type = self.config["mav_type"]

        if self.autopilot == "ardu":
            ap_id = 3  # MAV_AUTOPILOT_ARDUPILOT
            rev_map = ARDU_MODE_REV[self.vehicle_type]
            custom_mode = rev_map.get(self.mode, 0)
        else:
            ap_id = 12  # MAV_AUTOPILOT_PX4
            mode_key = PX4_MODE_REV.get(self.mode, (1, 0))
            main_mode, sub_mode = mode_key
            custom_mode = (main_mode << 16) | (sub_mode << 24)

        self.conn.mav.heartbeat_send(
            type=mav_type, autopilot=ap_id,
            base_mode=mode_flags, custom_mode=custom_mode,
            system_status=state,
        )

    def _send_global_position(self):
        lat_noise = random.gauss(0, self.gps_noise)
        lon_noise = random.gauss(0, self.gps_noise)
        self.conn.mav.global_position_int_send(
            int(time.time() * 1000) & 0xFFFFFFFF,
            int((self.lat + lat_noise) * 1e7),
            int((self.lon + lon_noise) * 1e7),
            int(self.alt_msl * 1000),
            int(self.alt * 1000),
            int(self.vx * 100),
            int(self.vy * 100),
            int(self.climb * 100),
            int(self.heading * 100),
        )

    def _send_attitude(self):
        self.conn.mav.attitude_send(
            int(time.time() * 1000) & 0xFFFFFFFF,
            self.roll, self.pitch, self.yaw,
            self.rollspeed, self.pitchspeed, self.yawspeed,
        )

    def _send_gps_raw(self):
        sats = 12 + random.randint(-2, 2)
        hdop = 110 + random.randint(-20, 20)
        # cog = course over ground from velocity vector, NOT heading
        if self.groundspeed > 0.5:
            cog = math.degrees(math.atan2(self.vy, self.vx)) % 360
        else:
            cog = self.heading  # stationary: fall back to heading
        self.conn.mav.gps_raw_int_send(
            int(time.time() * 1e6) & 0xFFFFFFFFFFFFFFFF,
            3,  # GPS_FIX_TYPE_3D_FIX
            int(self.lat * 1e7), int(self.lon * 1e7),
            int(self.alt_msl * 1000),
            hdop, 80,
            int(self.groundspeed * 100),
            int(cog * 100),  # cdeg, course-over-ground
            sats,
        )

    def _send_vfr_hud(self):
        is_active = self.flying and (self.alt > 1 if self.config["can_fly"] else True)
        throttle = 55 + random.randint(-5, 5) if is_active else 0
        self.conn.mav.vfr_hud_send(
            self.airspeed, self.groundspeed,
            int(self.heading) % 360, throttle,
            self.alt_msl, self.climb,
        )

    def _send_sys_status(self):
        sensors = SENSOR_FLAGS[self.vehicle_type]
        load = 300 + random.randint(-50, 100)
        self.conn.mav.sys_status_send(
            sensors, sensors, sensors,
            load,
            int(self.voltage * 1000),
            int(self.current * 100),
            int(self.remaining),
            0, 0, 0, 0, 0, 0,
        )

    def _send_mission_current(self):
        if self.mission_items:
            self.conn.mav.mission_current_send(self.mission_current_seq)

    def _send_vibration(self):
        self.conn.mav.vibration_send(
            int(time.time() * 1e6) & 0xFFFFFFFFFFFFFFFF,
            self.vibe_x, self.vibe_y, self.vibe_z,
            0, 0, 0,
        )

    def _send_battery2(self):
        voltages = [int(self.voltage * 1000 / 4)] * 4 + [65535] * 6
        self.conn.mav.battery_status_send(
            0, 0, 0,
            int((20 + random.uniform(-2, 2)) * 100),
            voltages,
            int(self.current * 100),
            int((100 - self.remaining) * 50),
            -1, int(self.remaining),
        )

    def _send_ekf_status(self):
        if self.autopilot == "px4":
            # PX4 sends ESTIMATOR_STATUS instead of EKF_STATUS_REPORT
            flags = (
                1 |    # ESTIMATOR_ATTITUDE
                2 |    # ESTIMATOR_VELOCITY_HORIZ
                4 |    # ESTIMATOR_VELOCITY_VERT
                8 |    # ESTIMATOR_POS_HORIZ_REL
                16 |   # ESTIMATOR_POS_HORIZ_ABS
                32 |   # ESTIMATOR_POS_VERT_ABS
                64 |   # ESTIMATOR_POS_VERT_AGL
                256 |  # ESTIMATOR_PRED_POS_HORIZ_REL
                512    # ESTIMATOR_PRED_POS_HORIZ_ABS
            )
            self.conn.mav.estimator_status_send(
                int(time.time() * 1e6) & 0xFFFFFFFFFFFFFFFF,
                flags,
                0.1 + random.uniform(0, 0.05),   # vel_ratio
                0.1 + random.uniform(0, 0.05),   # pos_horiz_ratio
                0.1 + random.uniform(0, 0.05),   # pos_vert_ratio
                0.1 + random.uniform(0, 0.05),   # mag_ratio
                0.1 + random.uniform(0, 0.05),   # hagl_ratio
                0.1 + random.uniform(0, 0.05),   # tas_ratio
                0.05 + random.uniform(0, 0.03),  # pos_horiz_accuracy
                0.1 + random.uniform(0, 0.05),   # pos_vert_accuracy
            )
        else:
            # ArduPilot sends EKF_STATUS_REPORT
            self.conn.mav.ekf_status_report_send(
                0x1FF,
                0.1 + random.uniform(0, 0.05),
                0.05 + random.uniform(0, 0.03),
                0.1 + random.uniform(0, 0.05),
                0.01 + random.uniform(0, 0.01),
                0.02 + random.uniform(0, 0.01),
            )

    def _send_home_position(self):
        self.conn.mav.home_position_send(
            int(self.home_lat * 1e7), int(self.home_lon * 1e7),
            int(self.home_alt_msl * 1000),  # altitude in mm MSL
            0, 0, 0,       # local x, y, z (not used)
            [1, 0, 0, 0],  # quaternion (identity)
            0, 0, 0,       # approach x, y, z
        )

    def _send_system_time(self):
        now_us = int(time.time() * 1e6)
        boot_ms = int((time.time() - self._batt_start_time) * 1000)
        self.conn.mav.system_time_send(now_us, boot_ms)

    def _send_autopilot_version(self):
        # MAV_PROTOCOL_CAPABILITY flags
        caps = (
            1 |      # MISSION_FLOAT
            2 |      # PARAM_FLOAT
            4 |      # MISSION_INT
            8 |      # COMMAND_INT
            16 |     # PARAM_UNION (encode param as union)
            256 |    # SET_ATTITUDE_TARGET
            512 |    # SET_POSITION_TARGET_LOCAL_NED
            1024 |   # SET_POSITION_TARGET_GLOBAL_INT
            4096 |   # FLIGHT_TERMINATION
            32768 |  # MAVLINK2
            65536    # MISSION_FENCE
        )
        if self.autopilot == "ardu":
            fw_version = (4 << 24) | (5 << 16) | (0 << 8) | 255  # 4.5.0-dev
        else:
            fw_version = (1 << 24) | (14 << 16) | (0 << 8) | 255  # 1.14.0-dev
        self.conn.mav.autopilot_version_send(
            capabilities=caps,
            flight_sw_version=fw_version,
            middleware_sw_version=0,
            os_sw_version=0,
            board_version=0,
            flight_custom_version=b"\x00" * 8,
            middleware_custom_version=b"\x00" * 8,
            os_custom_version=b"\x00" * 8,
            vendor_id=0,
            product_id=0,
            uid=0,
        )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

MIXED_TYPES = ["quad", "plane", "vtol", "rover", "boat"]


def main():
    parser = argparse.ArgumentParser(description="Mock MAVLink vehicle simulator")
    parser.add_argument("--count", type=int, default=3,
                        help="Number of vehicles (default: 3, ignored for --type mixed)")
    parser.add_argument("--base-port", type=int, default=14550,
                        help="Starting UDP port (default: 14550)")
    parser.add_argument("--type", choices=["quad", "plane", "vtol", "rover", "boat", "mixed"],
                        default="quad", help="Vehicle type (default: quad)")
    parser.add_argument("--autopilot", choices=["ardu", "px4"], default="ardu",
                        help="Autopilot firmware (default: ardu)")
    args = parser.parse_args()

    # Build the list of (vehicle_type, autopilot) for each vehicle
    if args.type == "mixed":
        vehicle_specs = [(vt, args.autopilot) for vt in MIXED_TYPES]
    else:
        vehicle_specs = [(args.type, args.autopilot)] * args.count

    count = len(vehicle_specs)
    ap_label = "ArduPilot" if args.autopilot == "ardu" else "PX4"
    print(f"Starting {count} mock vehicle(s) [{args.type}/{ap_label}] "
          f"(ports {args.base_port}-{args.base_port + count - 1})")

    vehicles = []
    for i, (vtype, ap) in enumerate(vehicle_specs):
        angle = 2 * math.pi * i / max(count, 1)
        lat = BASE_LAT + SPREAD * math.cos(angle)
        lon = BASE_LON + SPREAD * math.sin(angle)
        port = args.base_port + i

        v = MockVehicle(i, port, lat, lon, vehicle_type=vtype, autopilot=ap)
        v.start()
        vehicles.append(v)

    print(f"\nAll vehicles running. They will auto-arm and fly their default pattern.")
    print(f"Upload a mission and set AUTO mode to fly waypoints.\n")
    print(f"Connect with:")
    for v in vehicles:
        print(f"  udpin:0.0.0.0:{v.port}")
    print("\nPress Ctrl+C to stop.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping vehicles...")
        for v in vehicles:
            v.stop()
        print("Done.")


if __name__ == "__main__":
    main()
