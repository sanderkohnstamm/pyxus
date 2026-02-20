import os
os.environ['MAVLINK20'] = '1'
os.environ['MAVLINK_DIALECT'] = 'all'

import struct
import threading
import time
import queue
import math
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from pymavlink import mavutil


def sanitize_for_json(value):
    """Convert NaN/Inf floats to None for JSON compatibility."""
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
    elif isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    elif isinstance(value, (list, tuple)):
        return [sanitize_for_json(v) for v in value]
    return value


MAV_TYPES = {
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


@dataclass
class TelemetryState:
    # Attitude (radians)
    roll: float = 0.0
    pitch: float = 0.0
    yaw: float = 0.0
    rollspeed: float = 0.0
    pitchspeed: float = 0.0
    yawspeed: float = 0.0

    # Position
    lat: float = 0.0
    lon: float = 0.0
    alt: float = 0.0  # relative alt in meters
    alt_msl: float = 0.0

    # Speed
    airspeed: float = 0.0
    groundspeed: float = 0.0
    climb: float = 0.0
    heading: int = 0

    # Battery
    voltage: float = 0.0
    current: float = 0.0
    remaining: int = -1

    # GPS
    fix_type: int = 0
    satellites: int = 0
    hdop: float = 99.99

    # Status
    armed: bool = False
    mode: str = ""
    system_status: int = 0
    autopilot: str = "unknown"

    # Mission
    mission_seq: int = -1  # Current mission item seq (-1 = none)

    # Platform
    platform_type: str = "Unknown"
    last_heartbeat: float = 0.0

    def to_dict(self) -> dict:
        heartbeat_age = round(time.time() - self.last_heartbeat, 1) if self.last_heartbeat > 0 else -1
        return {
            "roll": round(self.roll, 4),
            "pitch": round(self.pitch, 4),
            "yaw": round(self.yaw, 4),
            "rollspeed": round(self.rollspeed, 4),
            "pitchspeed": round(self.pitchspeed, 4),
            "yawspeed": round(self.yawspeed, 4),
            "lat": self.lat,
            "lon": self.lon,
            "alt": round(self.alt, 2),
            "alt_msl": round(self.alt_msl, 2),
            "airspeed": round(self.airspeed, 2),
            "groundspeed": round(self.groundspeed, 2),
            "climb": round(self.climb, 2),
            "heading": self.heading,
            "voltage": round(self.voltage, 2),
            "current": round(self.current, 2),
            "remaining": self.remaining,
            "fix_type": self.fix_type,
            "satellites": self.satellites,
            "hdop": round(self.hdop, 2),
            "armed": self.armed,
            "mode": self.mode,
            "system_status": self.system_status,
            "autopilot": self.autopilot,
            "mission_seq": self.mission_seq,
            "platform_type": self.platform_type,
            "heartbeat_age": heartbeat_age,
        }


# ArduPilot mode mappings per vehicle type (custom_mode -> name)
ARDUPILOT_COPTER_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
    4: "GUIDED", 5: "LOITER", 6: "RTL", 7: "CIRCLE",
    9: "LAND", 11: "DRIFT", 13: "SPORT", 14: "FLIP",
    15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE", 18: "THROW",
    19: "AVOID_ADSB", 20: "GUIDED_NOGPS", 21: "SMART_RTL",
}
ARDUPILOT_PLANE_MODES = {
    0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 3: "TRAINING",
    4: "ACRO", 5: "FBWA", 6: "FBWB", 7: "CRUISE",
    8: "AUTOTUNE", 10: "AUTO", 11: "RTL", 12: "LOITER",
    13: "TAKEOFF", 14: "AVOID_ADSB", 15: "GUIDED",
    17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER",
    20: "QLAND", 21: "QRTL", 22: "QAUTOTUNE", 23: "QACRO",
    24: "THERMAL",
}
ARDUPILOT_ROVER_MODES = {
    0: "MANUAL", 1: "ACRO", 2: "STEERING", 3: "HOLD",
    4: "LOITER", 5: "FOLLOW", 6: "SIMPLE",
    10: "AUTO", 11: "RTL", 12: "SMART_RTL",
    15: "GUIDED",
}
ARDUPILOT_SUB_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD",
    3: "AUTO", 4: "GUIDED", 7: "CIRCLE",
    9: "SURFACE", 16: "POSHOLD", 19: "MANUAL",
}
# Backwards compat alias (used externally)
ARDUPILOT_MODES = ARDUPILOT_COPTER_MODES

# MAV_TYPE -> ArduPilot mode dict
_ARDUPILOT_MODE_MAP_BY_TYPE = {
    1: ARDUPILOT_PLANE_MODES,    # Fixed Wing
    10: ARDUPILOT_ROVER_MODES,   # Ground Rover
    11: ARDUPILOT_ROVER_MODES,   # Surface Boat
    12: ARDUPILOT_SUB_MODES,     # Submarine
}
# All multirotor types map to copter modes
for _t in (2, 3, 4, 13, 14, 15, 29, 35):
    _ARDUPILOT_MODE_MAP_BY_TYPE[_t] = ARDUPILOT_COPTER_MODES
# VTOL types use plane modes
for _t in (19, 20, 21, 22, 23, 24, 25):
    _ARDUPILOT_MODE_MAP_BY_TYPE[_t] = ARDUPILOT_PLANE_MODES


def ardupilot_modes_for_type(mav_type: int) -> dict:
    """Return the ArduPilot custom_mode->name mapping for a given MAV_TYPE."""
    return _ARDUPILOT_MODE_MAP_BY_TYPE.get(mav_type, ARDUPILOT_COPTER_MODES)

# Vehicle MAV_TYPEs - these are actual aircraft/vehicles we should connect to
VEHICLE_TYPES = {
    0,   # Generic (could be autopilot in some configs)
    1,   # Fixed Wing
    2,   # Quadrotor
    3,   # Coaxial
    4,   # Helicopter
    7,   # Airship
    8,   # Free Balloon
    9,   # Rocket
    10,  # Ground Rover
    11,  # Surface Boat
    12,  # Submarine
    13,  # Hexarotor
    14,  # Octorotor
    15,  # Tricopter
    16,  # Flapping Wing
    17,  # Kite
    19,  # VTOL Tiltrotor
    20,  # VTOL Duo
    21,  # VTOL Quad
    22,  # VTOL Tailsitter
    23,  # VTOL Reserved
    24,  # VTOL Reserved
    25,  # VTOL Reserved
    28,  # Parafoil
    29,  # Dodecarotor
    35,  # Decarotor
}

# Peripheral types we track but don't connect to
PERIPHERAL_TYPES = {
    5: "Antenna Tracker",
    6: "GCS",
    18: "Companion Computer",
    26: "Gimbal",
    27: "ADSB",
    30: "Camera",
    31: "Charging Station",
    32: "FLARM",
    33: "Servo",
    34: "ODID",
    36: "Battery",
    37: "Parachute",
    38: "Log",
    39: "OSD",
    40: "IMU",
    41: "GPS",
    42: "Winch",
}

# PX4 main mode and sub-mode mappings
# Main modes: 1=MANUAL, 2=ALTCTL, 3=POSCTL, 4=AUTO, 5=ACRO, 6=OFFBOARD, 7=STABILIZED, 8=RATTITUDE
# Sub modes (for AUTO=4): 1=READY, 2=TAKEOFF, 3=LOITER, 4=MISSION, 5=RTL, 6=LAND, 7=RTGS, 8=FOLLOW
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


class DroneConnection:
    def __init__(self):
        self._mav = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._telemetry = TelemetryState()
        self._cmd_queue: queue.Queue = queue.Queue()
        self._mission_msg_queue: queue.Queue = queue.Queue()
        self._is_ardupilot = True
        self._mav_type = 0  # MAV_TYPE from heartbeat (for mode mapping)
        self._target_system = 1
        self._target_component = 1
        self._connected = False
        # Parameters
        self._params: dict = {}  # name -> {value, type, index}
        self._params_total: int = 0

        # MAVLink message inspector
        self._msg_stats: dict = {}  # msg_type -> {count, last_time, rate, last_data, src_system, src_component}
        self._msg_stats_lock = threading.Lock()
        self._rate_window = 2.0  # Calculate rate over this window (seconds)
        self._msg_history: dict = {}  # msg_type -> list of timestamps for rate calculation
        self._params_lock = threading.Lock()
        # Status text messages
        self._statustext_queue: list = []
        self._statustext_lock = threading.Lock()

        # Cameras and gimbals discovered
        self._cameras: dict = {}  # component_id -> info
        self._gimbals: dict = {}  # component_id -> info
        self._camera_lock = threading.Lock()

        # All discovered components (from heartbeats)
        self._components: dict = {}  # "sys:comp" -> {type, name, last_seen, ...}
        self._components_lock = threading.Lock()

        # Available modes (MAVLink standard modes protocol)
        self._available_modes: list = []
        self._available_modes_count: int = 0
        self._available_modes_lock = threading.Lock()
        self._modes_requested: bool = False

    @property
    def connected(self) -> bool:
        return self._connected

    def get_telemetry(self) -> dict:
        with self._lock:
            return self._telemetry.to_dict()

    def connect(self, connection_string: str) -> bool:
        if self._connected:
            self.disconnect()

        try:
            self._mav = mavutil.mavlink_connection(
                connection_string,
                baud=57600,
                source_system=255,
                source_component=0,
            )

            # Wait for a heartbeat from component 1 (autopilot)
            # Component 1 is the standard MAVLink component ID for autopilots
            # Track other components we see along the way
            start_time = time.time()
            vehicle_msg = None
            last_hb_sent = 0

            while time.time() - start_time < 10:
                # Send GCS heartbeats during handshake so the remote
                # side knows where to send data (critical for udpout)
                now = time.time()
                if now - last_hb_sent >= 1.0:
                    try:
                        self._mav.mav.heartbeat_send(
                            mavutil.mavlink.MAV_TYPE_GCS,
                            mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                            0, 0, 0
                        )
                    except (OSError, struct.error) as e:
                        print(f"[Drone] Error sending handshake heartbeat: {e}")
                    last_hb_sent = now

                msg = self._mav.recv_match(type='HEARTBEAT', blocking=True, timeout=1)
                if msg is None:
                    continue

                src_system = msg.get_srcSystem()
                src_component = msg.get_srcComponent()
                mav_type = msg.type

                # Track this component
                self._register_component(src_system, src_component, mav_type, msg.autopilot)

                # Only connect to component 1 (autopilot)
                if src_component == 1:
                    vehicle_msg = msg
                    break
                else:
                    type_name = PERIPHERAL_TYPES.get(mav_type, MAV_TYPES.get(mav_type, f"Type {mav_type}"))
                    print(f"Registered {type_name} (sys={src_system}, comp={src_component}), waiting for autopilot...")

            if vehicle_msg is None:
                print("No autopilot (component 1) heartbeat received within timeout")
                self._mav.close()
                self._mav = None
                return False

            self._target_system = vehicle_msg.get_srcSystem()
            self._target_component = vehicle_msg.get_srcComponent()

            # Mark this component as the target
            self._mark_target_component()

            # Detect autopilot type and vehicle type
            self._is_ardupilot = vehicle_msg.autopilot == mavutil.mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA
            self._mav_type = vehicle_msg.type
            with self._lock:
                self._telemetry.autopilot = "ardupilot" if self._is_ardupilot else "px4"
                self._telemetry.platform_type = MAV_TYPES.get(vehicle_msg.type, f"Type {vehicle_msg.type}")

            print(f"Connected to {self._telemetry.platform_type} (sys={self._target_system}, comp={self._target_component})")

            self._connected = True
            self._running = True
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()

            # Request data streams
            self._request_data_streams()

            # Request all parameters from vehicle
            self._enqueue_cmd("request_param_list")

            # Request available modes (standard modes protocol)
            self.request_available_modes()
            return True

        except Exception as e:
            print(f"[Drone] Connection failed: {e}")
            if self._mav:
                try:
                    self._mav.close()
                except OSError as close_err:
                    print(f"[Drone] Error closing connection during cleanup: {close_err}")
                self._mav = None
            return False

    def disconnect(self):
        self._running = False
        self._connected = False
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        if self._mav:
            try:
                self._mav.close()
            except OSError as e:
                print(f"[Drone] Error closing connection during disconnect: {e}")
            self._mav = None
        with self._lock:
            self._telemetry = TelemetryState()

    def _request_data_streams(self):
        if self._is_ardupilot:
            # ArduPilot: use REQUEST_DATA_STREAM
            streams = [
                (mavutil.mavlink.MAV_DATA_STREAM_ALL, 4),
                (mavutil.mavlink.MAV_DATA_STREAM_RAW_SENSORS, 2),
                (mavutil.mavlink.MAV_DATA_STREAM_EXTENDED_STATUS, 2),
                (mavutil.mavlink.MAV_DATA_STREAM_RC_CHANNELS, 2),
                (mavutil.mavlink.MAV_DATA_STREAM_POSITION, 10),
                (mavutil.mavlink.MAV_DATA_STREAM_EXTRA1, 10),
                (mavutil.mavlink.MAV_DATA_STREAM_EXTRA2, 10),
                (mavutil.mavlink.MAV_DATA_STREAM_EXTRA3, 2),
            ]
            for stream_id, rate in streams:
                self._enqueue_cmd("request_data_stream", stream_id=stream_id, rate=rate)
        else:
            # PX4: use SET_MESSAGE_INTERVAL
            messages = [
                (mavutil.mavlink.MAVLINK_MSG_ID_HEARTBEAT, 1000000),        # 1Hz
                (mavutil.mavlink.MAVLINK_MSG_ID_ATTITUDE, 100000),          # 10Hz
                (mavutil.mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT, 100000),
                (mavutil.mavlink.MAVLINK_MSG_ID_GPS_RAW_INT, 500000),       # 2Hz
                (mavutil.mavlink.MAVLINK_MSG_ID_VFR_HUD, 100000),
                (mavutil.mavlink.MAVLINK_MSG_ID_SYS_STATUS, 500000),
            ]
            for msg_id, interval in messages:
                self._enqueue_cmd("set_message_interval", msg_id=msg_id, interval=interval)

    def _enqueue_cmd(self, cmd_type: str, **kwargs):
        self._cmd_queue.put((cmd_type, kwargs))

    def _run_loop(self):
        last_heartbeat = 0

        while self._running:
            # Send GCS heartbeat every 1s
            now = time.time()
            if now - last_heartbeat >= 1.0:
                try:
                    self._mav.mav.heartbeat_send(
                        mavutil.mavlink.MAV_TYPE_GCS,
                        mavutil.mavlink.MAV_AUTOPILOT_INVALID,
                        0, 0, 0
                    )
                except (OSError, struct.error) as e:
                    print(f"[Drone] Error sending GCS heartbeat: {e}")
                last_heartbeat = now

            # Drain command queue
            while not self._cmd_queue.empty():
                try:
                    cmd_type, kwargs = self._cmd_queue.get_nowait()
                    self._execute_cmd(cmd_type, kwargs)
                except queue.Empty:
                    break

            # Receive messages
            try:
                msg = self._mav.recv_match(blocking=True, timeout=0.05)
                if msg is not None:
                    self._handle_message(msg)
            except (OSError, struct.error, ValueError) as e:
                if self._running:
                    print(f"[Drone] Error receiving message: {e}")
                    time.sleep(0.01)
            except Exception as e:
                if self._running:
                    print(f"[Drone] Unexpected error in run loop: {e}")
                    time.sleep(0.1)

    def _execute_cmd(self, cmd_type: str, kwargs: dict):
        try:
            if cmd_type == "request_data_stream":
                self._mav.mav.request_data_stream_send(
                    self._target_system, self._target_component,
                    kwargs["stream_id"], kwargs["rate"], 1
                )
            elif cmd_type == "set_message_interval":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                    0, kwargs["msg_id"], kwargs["interval"],
                    0, 0, 0, 0, 0
                )
            elif cmd_type == "arm":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 1, 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "disarm":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "takeoff":
                alt = kwargs.get("alt", 10)
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
                    0, 0, 0, 0, 0, 0, 0, alt
                )
            elif cmd_type == "land":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_NAV_LAND,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "set_mode":
                mode_name = kwargs["mode"]
                if self._is_ardupilot:
                    # Use our own vehicle-type-specific mapping (the 'all' dialect
                    # doesn't include ArduPilot mode tables)
                    mode_map = ardupilot_modes_for_type(self._mav_type)
                    name_to_id = {v: k for k, v in mode_map.items()}
                    mode_id = name_to_id.get(mode_name)
                    if mode_id is not None:
                        self._mav.set_mode(mode_id)
                    else:
                        print(f"Unknown ArduPilot mode: {mode_name}")
                else:
                    # PX4: reverse-lookup mode name to (main_mode, sub_mode),
                    # then encode into custom_mode and send MAV_CMD_DO_SET_MODE
                    name_to_key = {}
                    for key, name in PX4_MODES.items():
                        if name not in name_to_key:
                            name_to_key[name] = key
                    mode_key = name_to_key.get(mode_name)
                    if mode_key is not None:
                        main_mode, sub_mode = mode_key
                        custom_mode = (main_mode << 16) | (sub_mode << 24)
                        self._mav.mav.command_long_send(
                            self._target_system, self._target_component,
                            mavutil.mavlink.MAV_CMD_DO_SET_MODE,
                            0,
                            mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,  # param1: base_mode
                            custom_mode,  # param2: custom_mode
                            0, 0, 0, 0, 0
                        )
                    else:
                        print(f"Unknown PX4 mode: {mode_name}")
            elif cmd_type == "set_standard_mode":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    262,  # MAV_CMD_DO_SET_STANDARD_MODE
                    0,
                    kwargs["standard_mode"],  # param1: standard mode enum
                    0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "request_message":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
                    0,
                    kwargs["msg_id"],
                    kwargs.get("param2", 0),
                    0, 0, 0, 0, 0
                )
            elif cmd_type == "rc_override":
                channels = self._validate_rc_channels(kwargs["channels"])
                self._mav.mav.rc_channels_override_send(
                    self._target_system, self._target_component,
                    *channels[:8]
                )
            elif cmd_type == "manual_control":
                self._mav.mav.manual_control_send(
                    self._target_system,
                    kwargs.get("x", 0),
                    kwargs.get("y", 0),
                    kwargs.get("z", 500),
                    kwargs.get("r", 0),
                    kwargs.get("buttons", 0),
                )
            elif cmd_type == "mission_count":
                self._mav.mav.mission_count_send(
                    self._target_system, self._target_component,
                    kwargs["count"],
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "mission_item_int":
                self._mav.mav.mission_item_int_send(
                    self._target_system, self._target_component,
                    kwargs["seq"],
                    kwargs["frame"],
                    kwargs["command"],
                    kwargs["current"],
                    kwargs["autocontinue"],
                    kwargs.get("param1", 0),
                    kwargs.get("param2", 0),
                    kwargs.get("param3", 0),
                    kwargs.get("param4", 0),
                    kwargs["x"],
                    kwargs["y"],
                    kwargs["z"],
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "mission_clear":
                self._mav.mav.mission_clear_all_send(
                    self._target_system, self._target_component,
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "fence_enable":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_DO_FENCE_ENABLE,
                    0, kwargs.get("enable", 1), 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "set_current_mission":
                self._mav.mav.mission_set_current_send(
                    self._target_system, self._target_component,
                    kwargs["seq"],
                )
            elif cmd_type == "request_param_list":
                self._mav.mav.param_request_list_send(
                    self._target_system, self._target_component,
                )
            elif cmd_type == "mission_request_list":
                self._mav.mav.mission_request_list_send(
                    self._target_system, self._target_component,
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "mission_request_int":
                self._mav.mav.mission_request_int_send(
                    self._target_system, self._target_component,
                    kwargs["seq"],
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "mission_ack":
                self._mav.mav.mission_ack_send(
                    self._target_system, self._target_component,
                    kwargs.get("ack_type", mavutil.mavlink.MAV_MISSION_ACCEPTED),
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "motor_test":
                motor_instance = kwargs["motor"]
                throttle_pct = kwargs["throttle"]
                duration_sec = kwargs["duration"]
                motor_count = kwargs.get("motor_count", 1)

                if self._is_ardupilot:
                    # ArduPilot: use MAV_CMD_DO_MOTOR_TEST
                    self._mav.mav.command_long_send(
                        self._target_system, self._target_component,
                        mavutil.mavlink.MAV_CMD_DO_MOTOR_TEST,
                        0,
                        motor_instance,       # param1: motor instance (1-indexed)
                        0,                    # param2: throttle type (0=percent)
                        throttle_pct,         # param3: throttle value (0-100%)
                        duration_sec,         # param4: timeout (seconds)
                        motor_count,          # param5: motor count (0=all)
                        0,                    # param6: test order
                        0,
                    )
                else:
                    # PX4: use MAV_CMD_ACTUATOR_TEST (command ID 310)
                    # param1: output value (0 to 1 for motors)
                    # param2: timeout in seconds
                    # param5: actuator function (101-108 for Motor1-Motor8)
                    MAV_CMD_ACTUATOR_TEST = 310
                    value = throttle_pct / 100.0  # Convert to 0-1 range
                    if motor_count == 0:
                        # Test all motors - send to each one (Motor1=101 through Motor8=108)
                        for m in range(8):
                            motor_function = 101 + m  # Motor1=101, Motor2=102, etc.
                            self._mav.mav.command_long_send(
                                self._target_system, self._target_component,
                                MAV_CMD_ACTUATOR_TEST,
                                0,
                                value,           # param1: actuator value (0-1)
                                duration_sec,    # param2: timeout in seconds
                                0,               # param3: reserved
                                0,               # param4: reserved
                                motor_function,  # param5: actuator function (101-108)
                                0, 0,
                            )
                            time.sleep(0.05)  # Small delay between commands
                    else:
                        # Test single motor (Motor1=101, Motor2=102, etc.)
                        motor_function = 100 + motor_instance  # 1->101, 2->102, etc.
                        self._mav.mav.command_long_send(
                            self._target_system, self._target_component,
                            MAV_CMD_ACTUATOR_TEST,
                            0,
                            value,           # param1: actuator value (0-1)
                            duration_sec,    # param2: timeout in seconds
                            0,               # param3: reserved
                            0,               # param4: reserved
                            motor_function,  # param5: actuator function (101-108)
                            0, 0,
                        )
            elif cmd_type == "servo_set":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_DO_SET_SERVO,
                    0,
                    kwargs["servo"],  # param1: servo instance
                    kwargs["pwm"],    # param2: PWM value
                    0, 0, 0, 0, 0,
                )
            elif cmd_type == "goto":
                self._mav.mav.set_position_target_global_int_send(
                    0,  # time_boot_ms
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                    0b0000111111111000,  # type_mask: use only lat/lon/alt
                    int(kwargs["lat"] * 1e7),
                    int(kwargs["lon"] * 1e7),
                    kwargs["alt"],
                    0, 0, 0,  # vx, vy, vz
                    0, 0, 0,  # afx, afy, afz
                    0, 0,     # yaw, yaw_rate
                )
            elif cmd_type == "set_home":
                # MAV_CMD_DO_SET_HOME: param1=1 means use current position, param1=0 means use specified
                use_current = kwargs.get("use_current", False)
                lat = kwargs.get("lat", 0)
                lon = kwargs.get("lon", 0)
                alt = kwargs.get("alt", 0)
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_DO_SET_HOME,
                    0,
                    1 if use_current else 0,  # param1: 1=use current position, 0=use specified
                    0, 0, 0,  # params 2-4 unused
                    lat, lon, alt  # param5=lat, param6=lon, param7=alt
                )
            elif cmd_type == "set_roi":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_DO_SET_ROI_LOCATION,
                    0, 0, 0, 0, 0,
                    kwargs["lat"],
                    kwargs["lon"],
                    kwargs.get("alt", 0),
                )
            elif cmd_type == "preflight_calibration":
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_PREFLIGHT_CALIBRATION,
                    0,
                    kwargs.get("param1", 0),  # gyro
                    kwargs.get("param2", 0),  # mag
                    kwargs.get("param3", 0),  # pressure
                    kwargs.get("param4", 0),  # radio
                    kwargs.get("param5", 0),  # accel (1=accel, 2=level)
                    kwargs.get("param6", 0),
                    0,
                )
            elif cmd_type == "set_param":
                param_id = kwargs["param_id"]
                if isinstance(param_id, str):
                    param_id = param_id.encode('utf-8')
                param_id = param_id.ljust(16, b'\x00')
                self._mav.mav.param_set_send(
                    self._target_system, self._target_component,
                    param_id, kwargs["value"],
                    kwargs.get("param_type", 9),  # MAV_PARAM_TYPE_REAL32
                )
            elif cmd_type == "request_camera_info":
                # Request camera information from all camera components
                self._mav.mav.command_long_send(
                    self._target_system, 0,  # 0 = broadcast to all components
                    mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
                    0,
                    mavutil.mavlink.MAVLINK_MSG_ID_CAMERA_INFORMATION,
                    0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "gimbal_pitch_yaw":
                import math
                pitch_rad = math.radians(kwargs.get("pitch", 0))
                yaw_rad = math.radians(kwargs.get("yaw", 0))
                self._mav.mav.command_long_send(
                    self._target_system, self._target_component,
                    mavutil.mavlink.MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW,
                    0,
                    pitch_rad,      # param1: pitch angle (rad)
                    yaw_rad,        # param2: yaw angle (rad)
                    kwargs.get("pitch_rate", float('nan')),  # param3: pitch rate
                    kwargs.get("yaw_rate", float('nan')),    # param4: yaw rate
                    0,              # param5: gimbal manager flags
                    0, 0
                )
        except Exception as e:
            print(f"[Drone] Command error ({cmd_type}): {e}")

    def _handle_message(self, msg):
        msg_type = msg.get_type()
        now = time.time()

        # Track message for inspector
        self._track_message(msg, msg_type, now)

        # Route mission protocol messages to dedicated queue (avoids race with _run_loop)
        if msg_type in ("MISSION_REQUEST_INT", "MISSION_REQUEST", "MISSION_ACK",
                        "MISSION_COUNT", "MISSION_ITEM_INT"):
            self._mission_msg_queue.put(msg)
            return

        # Store parameter values
        if msg_type == "PARAM_VALUE":
            with self._params_lock:
                name = msg.param_id.rstrip('\x00') if isinstance(msg.param_id, str) else msg.param_id.decode('utf-8', errors='replace').rstrip('\x00')
                self._params[name] = {
                    'value': msg.param_value,
                    'type': msg.param_type,
                    'index': msg.param_index,
                }
                self._params_total = msg.param_count
            return

        # Store camera information
        if msg_type == "CAMERA_INFORMATION":
            with self._camera_lock:
                comp_id = msg.get_srcComponent()
                vendor = msg.vendor_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'vendor_name') else ''
                model = msg.model_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'model_name') else ''
                self._cameras[comp_id] = {
                    'component_id': comp_id,
                    'vendor': vendor,
                    'model': model,
                    'firmware_version': getattr(msg, 'firmware_version', 0),
                    'focal_length': getattr(msg, 'focal_length', 0),
                    'sensor_size_h': getattr(msg, 'sensor_size_h', 0),
                    'sensor_size_v': getattr(msg, 'sensor_size_v', 0),
                    'resolution_h': getattr(msg, 'resolution_h', 0),
                    'resolution_v': getattr(msg, 'resolution_v', 0),
                    'flags': getattr(msg, 'flags', 0),
                }
            return

        # Store gimbal device information
        if msg_type == "GIMBAL_DEVICE_INFORMATION":
            with self._camera_lock:
                comp_id = msg.get_srcComponent()
                vendor = msg.vendor_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'vendor_name') else ''
                model = msg.model_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'model_name') else ''
                self._gimbals[comp_id] = {
                    'component_id': comp_id,
                    'vendor': vendor,
                    'model': model,
                    'firmware_version': getattr(msg, 'firmware_version', ''),
                    'cap_flags': getattr(msg, 'cap_flags', 0),
                    'tilt_max': getattr(msg, 'tilt_max', 0),
                    'tilt_min': getattr(msg, 'tilt_min', 0),
                    'pan_max': getattr(msg, 'pan_max', 0),
                    'pan_min': getattr(msg, 'pan_min', 0),
                }
            return

        # Capture STATUSTEXT messages (deduplicate within 1s window)
        if msg_type == "STATUSTEXT":
            text = msg.text.rstrip('\x00') if isinstance(msg.text, str) else msg.text.decode('utf-8', errors='replace').rstrip('\x00')
            severity = msg.severity  # 0=EMERGENCY..7=DEBUG
            now = time.time()
            with self._statustext_lock:
                # Skip duplicate: same text+severity within last 1 second
                for prev in reversed(self._statustext_queue):
                    if now - prev['time'] > 1.0:
                        break
                    if prev['text'] == text and prev['severity'] == severity:
                        return
                self._statustext_queue.append({
                    'severity': severity,
                    'text': text,
                    'time': now,
                })
                # Keep max 100 messages
                if len(self._statustext_queue) > 100:
                    self._statustext_queue = self._statustext_queue[-100:]
            return

        # Handle COMMAND_ACK and convert to status messages for calibration feedback
        if msg_type == "COMMAND_ACK":
            command = msg.command
            result = msg.result
            now = time.time()

            # MAV_CMD_PREFLIGHT_CALIBRATION = 241
            if command == 241:
                result_texts = {
                    0: ("Calibration accepted", 6),      # MAV_RESULT_ACCEPTED
                    1: ("Calibration temporarily rejected - try again", 4),  # MAV_RESULT_TEMPORARILY_REJECTED
                    2: ("Calibration denied", 3),        # MAV_RESULT_DENIED
                    3: ("Calibration unsupported", 4),   # MAV_RESULT_UNSUPPORTED
                    4: ("Calibration failed", 3),        # MAV_RESULT_FAILED
                    5: ("Calibration in progress", 6),   # MAV_RESULT_IN_PROGRESS
                    6: ("Calibration cancelled", 4),     # MAV_RESULT_CANCELLED
                }
                text, severity = result_texts.get(result, (f"Calibration result: {result}", 4))
                with self._statustext_lock:
                    self._statustext_queue.append({
                        'severity': severity,
                        'text': text,
                        'time': now,
                    })
            return

        # Handle AVAILABLE_MODES (standard modes protocol, msg ID 435)
        if msg_type == "AVAILABLE_MODES":
            with self._available_modes_lock:
                self._available_modes_count = msg.number_modes
                mode_name = msg.mode_name.rstrip('\x00') if isinstance(msg.mode_name, str) else msg.mode_name.decode('utf-8', errors='replace').rstrip('\x00')
                properties = msg.properties
                # Filter out non-user-selectable modes (MAV_MODE_PROPERTY_NOT_USER_SELECTABLE = 0x2)
                if properties & 0x2:
                    return
                entry = {
                    'mode_index': msg.mode_index,
                    'standard_mode': msg.standard_mode,
                    'custom_mode': msg.custom_mode,
                    'properties': properties,
                    'mode_name': mode_name,
                    'advanced': bool(properties & 0x1),  # MAV_MODE_PROPERTY_ADVANCED
                }
                # Replace if same mode_index already stored, else append
                existing_indices = {m['mode_index'] for m in self._available_modes}
                if msg.mode_index in existing_indices:
                    self._available_modes = [
                        entry if m['mode_index'] == msg.mode_index else m
                        for m in self._available_modes
                    ]
                else:
                    self._available_modes.append(entry)
            return

        with self._lock:
            if msg_type == "HEARTBEAT":
                src_system = msg.get_srcSystem()
                src_component = msg.get_srcComponent()

                # Register ALL components for tracking (even non-targets)
                self._register_component(src_system, src_component, msg.type, msg.autopilot)

                # Only update telemetry from the exact autopilot we connected to
                if src_system != self._target_system or src_component != self._target_component:
                    return

                # Skip GCS heartbeats (shouldn't happen after component filter, but just in case)
                if msg.type == mavutil.mavlink.MAV_TYPE_GCS:
                    return

                base_mode = msg.base_mode
                self._telemetry.armed = bool(base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
                self._telemetry.system_status = msg.system_status
                self._telemetry.last_heartbeat = time.time()
                self._telemetry.platform_type = MAV_TYPES.get(msg.type, f"Type {msg.type}")

                # Decode mode
                if self._is_ardupilot:
                    custom = msg.custom_mode
                    mode_map = ardupilot_modes_for_type(self._mav_type)
                    self._telemetry.mode = mode_map.get(custom, f"MODE_{custom}")
                else:
                    # PX4 mode decoding - fixed bit positions
                    main_mode = (msg.custom_mode >> 16) & 0xFF
                    sub_mode = (msg.custom_mode >> 24) & 0xFF
                    self._telemetry.mode = PX4_MODES.get(
                        (main_mode, sub_mode), f"PX4_{main_mode}_{sub_mode}"
                    )

            elif msg_type == "ATTITUDE":
                self._telemetry.roll = msg.roll
                self._telemetry.pitch = msg.pitch
                self._telemetry.yaw = msg.yaw
                self._telemetry.rollspeed = msg.rollspeed
                self._telemetry.pitchspeed = msg.pitchspeed
                self._telemetry.yawspeed = msg.yawspeed

            elif msg_type == "GLOBAL_POSITION_INT":
                self._telemetry.lat = msg.lat / 1e7
                self._telemetry.lon = msg.lon / 1e7
                self._telemetry.alt = msg.relative_alt / 1000.0
                self._telemetry.alt_msl = msg.alt / 1000.0

            elif msg_type == "GPS_RAW_INT":
                self._telemetry.fix_type = msg.fix_type
                self._telemetry.satellites = msg.satellites_visible
                self._telemetry.hdop = msg.eph / 100.0 if msg.eph != 65535 else 99.99

            elif msg_type == "VFR_HUD":
                self._telemetry.airspeed = msg.airspeed
                self._telemetry.groundspeed = msg.groundspeed
                self._telemetry.heading = msg.heading
                self._telemetry.climb = msg.climb

            elif msg_type == "SYS_STATUS":
                self._telemetry.voltage = msg.voltage_battery / 1000.0
                self._telemetry.current = msg.current_battery / 100.0 if msg.current_battery != -1 else 0.0
                self._telemetry.remaining = msg.battery_remaining

            elif msg_type == "MISSION_CURRENT":
                self._telemetry.mission_seq = msg.seq

    def arm(self):
        self._enqueue_cmd("arm")

    def disarm(self):
        self._enqueue_cmd("disarm")

    def takeoff(self, alt: float = 10):
        self._enqueue_cmd("takeoff", alt=alt)

    def land(self):
        if self._is_ardupilot:
            self._enqueue_cmd("set_mode", mode="LAND")
        else:
            self._enqueue_cmd("land")

    def rtl(self):
        self._enqueue_cmd("set_mode", mode="RTL")

    def set_mode(self, mode: str):
        self._enqueue_cmd("set_mode", mode=mode)

    @staticmethod
    def _validate_rc_channels(channels: list) -> list[int]:
        """Validate and sanitize RC channel values.

        Returns a list of exactly 8 integers. Each value is either 0 (release)
        or clamped to the valid PWM range 1000-2000.
        """
        validated = []
        for val in channels[:8]:  # Truncate to max 8
            try:
                v = int(val)
            except (TypeError, ValueError):
                v = 0
            # 0 = release, otherwise clamp to 1000-2000
            if v != 0:
                v = max(1000, min(2000, v))
            validated.append(v)
        # Pad to 8 channels with 0 (release)
        while len(validated) < 8:
            validated.append(0)
        return validated

    def rc_override(self, channels: list[int]):
        # Safety-net validation in case caller skipped it
        channels = self._validate_rc_channels(channels)
        if self._is_ardupilot:
            self._enqueue_cmd("rc_override", channels=channels)
        else:
            # Map RC channels to MANUAL_CONTROL axes
            # ch1=roll→y, ch2=pitch→x, ch3=throttle→z, ch4=yaw→r
            def pwm_to_manual(pwm, center=1500, scale=1000):
                return int((pwm - center) / 500 * scale)

            x = pwm_to_manual(channels[1]) if len(channels) > 1 else 0  # pitch
            y = pwm_to_manual(channels[0]) if len(channels) > 0 else 0  # roll
            z = int((channels[2] - 1000) / 1000 * 1000) if len(channels) > 2 else 500  # throttle 0-1000
            r = pwm_to_manual(channels[3]) if len(channels) > 3 else 0  # yaw
            self._enqueue_cmd("manual_control", x=x, y=y, z=z, r=r)

    def motor_test(self, motor: int = 1, throttle: float = 5.0, duration: float = 2.0, all_motors: bool = False):
        self._enqueue_cmd(
            "motor_test",
            motor=motor,
            throttle=throttle,
            duration=duration,
            motor_count=0 if all_motors else 1,
        )

    def servo_set(self, servo: int = 1, pwm: int = 1500):
        self._enqueue_cmd("servo_set", servo=servo, pwm=pwm)

    def goto(self, lat: float, lon: float, alt: float):
        self._enqueue_cmd("goto", lat=lat, lon=lon, alt=alt)

    def set_roi(self, lat: float, lon: float, alt: float = 0):
        self._enqueue_cmd("set_roi", lat=lat, lon=lon, alt=alt)

    def set_home(self, lat: float, lon: float, alt: float = 0):
        """Set home/return position to specified coordinates."""
        self._enqueue_cmd("set_home", lat=lat, lon=lon, alt=alt)

    def calibrate(self, cal_type: str):
        """Start a sensor calibration. Types: gyro, accel, level, compass, pressure, cancel, next_step."""
        cal_map = {
            "gyro":     {"param1": 1},
            "compass":  {"param2": 1},
            "pressure": {"param3": 1},
            "accel":    {"param5": 1},
            "level":    {"param5": 2},
            "cancel":   {"param1": 0, "param2": 0, "param3": 0, "param4": 0, "param5": 0, "param6": 0},  # All zeros = cancel
            "next_step": {"param5": 4},  # Simple accel cal accept (next position)
        }
        params = cal_map.get(cal_type, {})
        if params:
            self._enqueue_cmd("preflight_calibration", **params)

    def request_available_modes(self):
        """Request AVAILABLE_MODES from the vehicle (standard modes protocol)."""
        self._modes_requested = True
        # MAV_CMD_REQUEST_MESSAGE with param1=435 (AVAILABLE_MODES), param2=0 (all modes)
        self._enqueue_cmd("request_message", msg_id=435, param2=0)

    def get_available_modes(self) -> list:
        """Return list of available modes, sorted by mode_index."""
        with self._available_modes_lock:
            return sorted(self._available_modes, key=lambda m: m['mode_index'])

    def set_standard_mode(self, standard_mode_id: int):
        """Set flight mode using MAV_CMD_DO_SET_STANDARD_MODE."""
        self._enqueue_cmd("set_standard_mode", standard_mode=standard_mode_id)

    def get_static_modes(self) -> list[str]:
        """Return the static mode name list appropriate for this vehicle type."""
        if self._is_ardupilot:
            mode_map = ardupilot_modes_for_type(self._mav_type)
            return [name for _, name in sorted(mode_map.items())]
        else:
            # PX4: return unique mode names (skip duplicates from sub-mode variants)
            seen = set()
            modes = []
            for _, name in sorted(PX4_MODES.items()):
                if name not in seen:
                    seen.add(name)
                    modes.append(name)
            return modes

    def get_cameras(self) -> list:
        """Return list of discovered cameras."""
        with self._camera_lock:
            return list(self._cameras.values())

    def get_gimbals(self) -> list:
        """Return list of discovered gimbals."""
        with self._camera_lock:
            return list(self._gimbals.values())

    def request_camera_info(self):
        """Request camera information from all cameras."""
        self._enqueue_cmd("request_camera_info")

    def set_gimbal_pitch_yaw(self, pitch: float, yaw: float, pitch_rate: float = 0, yaw_rate: float = 0):
        """Set gimbal pitch and yaw angles in degrees."""
        self._enqueue_cmd("gimbal_pitch_yaw", pitch=pitch, yaw=yaw, pitch_rate=pitch_rate, yaw_rate=yaw_rate)

    def send_mission_cmd(self, cmd_type: str, **kwargs):
        self._enqueue_cmd(cmd_type, **kwargs)

    def drain_mission_queue(self):
        """Clear stale messages from the mission queue."""
        while not self._mission_msg_queue.empty():
            try:
                self._mission_msg_queue.get_nowait()
            except queue.Empty:
                break

    def recv_mission_msg(self, timeout: float = 5.0):
        """Receive any mission protocol message from the queue."""
        try:
            return self._mission_msg_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    # Parameters
    def request_params(self):
        self._enqueue_cmd("request_param_list")

    def set_param(self, param_id: str, value: float, param_type: int = 9):
        self._enqueue_cmd("set_param", param_id=param_id, value=value, param_type=param_type)

    def _track_message(self, msg, msg_type: str, now: float):
        """Track message for the MAVLink inspector."""
        src_system = msg.get_srcSystem()
        src_component = msg.get_srcComponent()

        # Create a key that includes source info for unique tracking
        key = f"{msg_type}:{src_system}:{src_component}"

        with self._msg_stats_lock:
            # Initialize if new message type
            if key not in self._msg_stats:
                self._msg_stats[key] = {
                    'msg_type': msg_type,
                    'src_system': src_system,
                    'src_component': src_component,
                    'count': 0,
                    'last_time': 0,
                    'rate': 0.0,
                    'last_data': {},
                }
                # Use deque with maxlen for automatic size limiting and O(1) popleft
                self._msg_history[key] = deque(maxlen=100)

            stats = self._msg_stats[key]
            stats['count'] += 1
            stats['last_time'] = now

            # Add timestamp to history for rate calculation
            history = self._msg_history[key]
            history.append(now)

            # Remove old timestamps outside the rate window (O(1) popleft with deque)
            cutoff = now - self._rate_window
            while history and history[0] < cutoff:
                history.popleft()

            # Calculate rate (messages per second)
            if len(history) >= 2:
                time_span = history[-1] - history[0]
                if time_span > 0:
                    stats['rate'] = round((len(history) - 1) / time_span, 1)
            else:
                stats['rate'] = 0.0

            # Extract message data (convert to dict for JSON serialization)
            try:
                msg_dict = msg.to_dict()
                # Remove mavpackettype as it's redundant
                msg_dict.pop('mavpackettype', None)
                # Limit size of data stored and sanitize NaN/Inf values
                stats['last_data'] = sanitize_for_json({k: v for k, v in list(msg_dict.items())[:20]})
            except (AttributeError, ValueError, TypeError) as e:
                print(f"[Drone] Error extracting message data for {msg_type}: {e}")
                stats['last_data'] = {}

    def get_message_stats(self) -> list:
        """Return message statistics for the inspector."""
        with self._msg_stats_lock:
            now = time.time()
            result = []
            for key, stats in self._msg_stats.items():
                # Include age since last message
                age = round(now - stats['last_time'], 1) if stats['last_time'] > 0 else -1
                result.append({
                    'msg_type': stats['msg_type'],
                    'src_system': stats['src_system'],
                    'src_component': stats['src_component'],
                    'count': stats['count'],
                    'rate': stats['rate'],
                    'age': age,
                    'last_data': stats['last_data'],
                })
            # Sort by message type
            result.sort(key=lambda x: x['msg_type'])
            return result

    def clear_message_stats(self):
        """Clear all message statistics."""
        with self._msg_stats_lock:
            self._msg_stats.clear()
            self._msg_history.clear()

    def _register_component(self, src_system: int, src_component: int, mav_type: int, autopilot: int):
        """Register a discovered component from its heartbeat."""
        key = f"{src_system}:{src_component}"
        now = time.time()

        # Determine component category and name
        if mav_type in VEHICLE_TYPES:
            category = "vehicle"
            type_name = MAV_TYPES.get(mav_type, f"Type {mav_type}")
        elif mav_type in PERIPHERAL_TYPES:
            category = "peripheral"
            type_name = PERIPHERAL_TYPES[mav_type]
        else:
            category = "unknown"
            type_name = MAV_TYPES.get(mav_type, f"Type {mav_type}")

        # Autopilot type
        autopilot_name = "unknown"
        if autopilot == 3:  # MAV_AUTOPILOT_ARDUPILOTMEGA
            autopilot_name = "ardupilot"
        elif autopilot == 12:  # MAV_AUTOPILOT_PX4
            autopilot_name = "px4"
        elif autopilot == 8:  # MAV_AUTOPILOT_INVALID
            autopilot_name = "none"

        with self._components_lock:
            if key not in self._components:
                self._components[key] = {
                    'src_system': src_system,
                    'src_component': src_component,
                    'mav_type': mav_type,
                    'type_name': type_name,
                    'category': category,
                    'autopilot': autopilot_name,
                    'first_seen': now,
                    'last_seen': now,
                    'heartbeat_count': 1,
                    'is_target': False,
                }
            else:
                self._components[key]['last_seen'] = now
                self._components[key]['heartbeat_count'] += 1

    def _mark_target_component(self):
        """Mark the current target as the connected vehicle."""
        key = f"{self._target_system}:{self._target_component}"
        with self._components_lock:
            # Clear previous target
            for comp in self._components.values():
                comp['is_target'] = False
            # Mark new target
            if key in self._components:
                self._components[key]['is_target'] = True

    def get_components(self) -> list:
        """Return list of discovered components."""
        with self._components_lock:
            now = time.time()
            result = []
            for key, comp in self._components.items():
                age = round(now - comp['last_seen'], 1)
                result.append({
                    **comp,
                    'age': age,
                    'active': age < 5,  # Active if heartbeat within last 5 seconds
                })
            # Sort: target first, then vehicles, then by system/component
            result.sort(key=lambda x: (
                not x['is_target'],
                x['category'] != 'vehicle',
                x['src_system'],
                x['src_component']
            ))
            return result

    def drain_statustext(self) -> list:
        """Return and clear pending STATUSTEXT messages."""
        with self._statustext_lock:
            msgs = list(self._statustext_queue)
            self._statustext_queue.clear()
            return msgs

    def get_params(self) -> tuple[dict, int]:
        with self._params_lock:
            return dict(self._params), self._params_total

    @property
    def is_ardupilot(self) -> bool:
        return self._is_ardupilot

    @property
    def target_system(self) -> int:
        return self._target_system

    @property
    def target_component(self) -> int:
        return self._target_component
