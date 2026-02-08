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


# ArduPilot mode mappings (copter)
ARDUPILOT_MODES = {
    0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
    4: "GUIDED", 5: "LOITER", 6: "RTL", 7: "CIRCLE",
    9: "LAND", 11: "DRIFT", 13: "SPORT", 14: "FLIP",
    15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE", 18: "THROW",
    19: "AVOID_ADSB", 20: "GUIDED_NOGPS", 21: "SMART_RTL",
}

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
        self._cmd_queue: queue.Queue = queue.Queue()
        self._connected = False
        self._connection_string = ""

        # Multi-vehicle: sysid -> Vehicle
        self._vehicles: dict = {}
        self._vehicles_lock = threading.Lock()
        # Callback for registry to learn about new vehicles
        self.on_vehicle_discovered = None  # callable(vehicle)

        # MAVLink message inspector
        self._msg_stats: dict = {}
        self._msg_stats_lock = threading.Lock()
        self._rate_window = 2.0
        self._msg_history: dict = {}

        # All discovered components (from heartbeats)
        self._components: dict = {}
        self._components_lock = threading.Lock()

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def connection_string(self) -> str:
        return self._connection_string

    def connect(self, connection_string: str) -> bool:
        if self._connected:
            self.disconnect()

        self._connection_string = connection_string

        try:
            self._mav = mavutil.mavlink_connection(
                connection_string,
                baud=57600,
                source_system=255,
                source_component=0,
            )

            # Wait for a heartbeat from component 1 (autopilot)
            start_time = time.time()
            vehicle_msg = None

            while time.time() - start_time < 10:
                msg = self._mav.recv_match(type='HEARTBEAT', blocking=True, timeout=1)
                if msg is None:
                    continue

                src_system = msg.get_srcSystem()
                src_component = msg.get_srcComponent()
                mav_type = msg.type

                # Track this component
                self._register_component(src_system, src_component, mav_type, msg.autopilot)

                # Only connect to component 1 (autopilot) with vehicle type
                if src_component == 1 and mav_type in VEHICLE_TYPES:
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

            # Create first Vehicle from the initial heartbeat
            first_vehicle = self._create_vehicle_from_heartbeat(vehicle_msg)
            if first_vehicle is None:
                self._mav.close()
                self._mav = None
                return False

            print(f"Connected to {first_vehicle.telemetry.platform_type} (sys={first_vehicle.target_system}, comp={first_vehicle.target_component})")

            self._connected = True
            self._running = True
            self._thread = threading.Thread(target=self._run_loop, daemon=True)
            self._thread.start()

            # Request data streams for first vehicle
            self._request_data_streams(first_vehicle)
            return True

        except Exception as e:
            print(f"Connection failed: {e}")
            if self._mav:
                try:
                    self._mav.close()
                except:
                    pass
                self._mav = None
            return False

    def _create_vehicle_from_heartbeat(self, msg):
        """Create a Vehicle object from a HEARTBEAT message."""
        from vehicle import Vehicle
        src_system = msg.get_srcSystem()
        src_component = msg.get_srcComponent()
        is_ardupilot = msg.autopilot == mavutil.mavlink.MAV_AUTOPILOT_ARDUPILOTMEGA

        vehicle = Vehicle(
            vehicle_id=str(src_system),
            connection=self,
            target_system=src_system,
            target_component=src_component,
            is_ardupilot=is_ardupilot,
            mav_type=msg.type,
        )

        with self._vehicles_lock:
            self._vehicles[src_system] = vehicle

        # Mark component as target
        key = f"{src_system}:{src_component}"
        with self._components_lock:
            if key in self._components:
                self._components[key]['is_target'] = True

        return vehicle

    def get_vehicles(self) -> dict:
        """Return dict of sysid -> Vehicle."""
        with self._vehicles_lock:
            return dict(self._vehicles)

    def get_vehicle(self, sysid: int):
        """Get a specific vehicle by sysid."""
        with self._vehicles_lock:
            return self._vehicles.get(sysid)

    def disconnect(self):
        self._running = False
        self._connected = False
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        if self._mav:
            try:
                self._mav.close()
            except:
                pass
            self._mav = None
        with self._vehicles_lock:
            self._vehicles.clear()

    def _request_data_streams(self, vehicle):
        """Request data streams for a specific vehicle."""
        ts = vehicle.target_system
        tc = vehicle.target_component
        if vehicle.is_ardupilot:
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
                self._enqueue_cmd("request_data_stream", stream_id=stream_id, rate=rate,
                                  _target_system=ts, _target_component=tc)
        else:
            messages = [
                (mavutil.mavlink.MAVLINK_MSG_ID_HEARTBEAT, 1000000),
                (mavutil.mavlink.MAVLINK_MSG_ID_ATTITUDE, 100000),
                (mavutil.mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT, 100000),
                (mavutil.mavlink.MAVLINK_MSG_ID_GPS_RAW_INT, 500000),
                (mavutil.mavlink.MAVLINK_MSG_ID_VFR_HUD, 100000),
                (mavutil.mavlink.MAVLINK_MSG_ID_SYS_STATUS, 500000),
            ]
            for msg_id, interval in messages:
                self._enqueue_cmd("set_message_interval", msg_id=msg_id, interval=interval,
                                  _target_system=ts, _target_component=tc)

    def _enqueue_cmd(self, cmd_type: str, **kwargs):
        self._cmd_queue.put((cmd_type, kwargs))

    def enqueue_vehicle_cmd(self, vehicle, cmd_type: str, **kwargs):
        """Enqueue a command targeted at a specific vehicle."""
        kwargs['_target_system'] = vehicle.target_system
        kwargs['_target_component'] = vehicle.target_component
        kwargs['_is_ardupilot'] = vehicle.is_ardupilot
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
                except:
                    pass
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
            except Exception:
                if self._running:
                    time.sleep(0.01)

    def _execute_cmd(self, cmd_type: str, kwargs: dict):
        """Execute a command. Uses _target_system/_target_component from kwargs."""
        ts = kwargs.pop('_target_system', None)
        tc = kwargs.pop('_target_component', None)
        is_ap = kwargs.pop('_is_ardupilot', None)

        # Fallback: use first vehicle's target if not specified
        if ts is None or tc is None:
            with self._vehicles_lock:
                if self._vehicles:
                    v = next(iter(self._vehicles.values()))
                    ts = ts or v.target_system
                    tc = tc or v.target_component
                    if is_ap is None:
                        is_ap = v.is_ardupilot
                else:
                    return
        if is_ap is None:
            is_ap = True

        try:
            if cmd_type == "request_data_stream":
                self._mav.mav.request_data_stream_send(
                    ts, tc,
                    kwargs["stream_id"], kwargs["rate"], 1
                )
            elif cmd_type == "set_message_interval":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                    0, kwargs["msg_id"], kwargs["interval"],
                    0, 0, 0, 0, 0
                )
            elif cmd_type == "arm":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 1, 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "disarm":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "takeoff":
                alt = kwargs.get("alt", 10)
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
                    0, 0, 0, 0, 0, 0, 0, alt
                )
            elif cmd_type == "land":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_NAV_LAND,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "set_mode":
                mode_name = kwargs["mode"]
                if is_ap:
                    mode_id = self._mav.mode_mapping().get(mode_name)
                    if mode_id is not None:
                        self._mav.mav.set_mode_send(ts, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, mode_id)
                else:
                    self._mav.set_mode_apm(mode_name)
            elif cmd_type == "rc_override":
                channels = kwargs["channels"]
                while len(channels) < 8:
                    channels.append(0)
                self._mav.mav.rc_channels_override_send(
                    ts, tc,
                    *channels[:8]
                )
            elif cmd_type == "manual_control":
                self._mav.mav.manual_control_send(
                    ts,
                    kwargs.get("x", 0),
                    kwargs.get("y", 0),
                    kwargs.get("z", 500),
                    kwargs.get("r", 0),
                    kwargs.get("buttons", 0),
                )
            elif cmd_type == "mission_count":
                self._mav.mav.mission_count_send(
                    ts, tc,
                    kwargs["count"],
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "mission_item_int":
                self._mav.mav.mission_item_int_send(
                    ts, tc,
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
                    ts, tc,
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "fence_enable":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_DO_FENCE_ENABLE,
                    0, kwargs.get("enable", 1), 0, 0, 0, 0, 0, 0
                )
            elif cmd_type == "set_current_mission":
                self._mav.mav.mission_set_current_send(
                    ts, tc,
                    kwargs["seq"],
                )
            elif cmd_type == "request_param_list":
                self._mav.mav.param_request_list_send(
                    ts, tc,
                )
            elif cmd_type == "mission_request_list":
                self._mav.mav.mission_request_list_send(
                    ts, tc,
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "mission_request_int":
                self._mav.mav.mission_request_int_send(
                    ts, tc,
                    kwargs["seq"],
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "mission_ack":
                self._mav.mav.mission_ack_send(
                    ts, tc,
                    kwargs.get("ack_type", mavutil.mavlink.MAV_MISSION_ACCEPTED),
                    kwargs.get("mission_type", mavutil.mavlink.MAV_MISSION_TYPE_MISSION),
                )
            elif cmd_type == "motor_test":
                motor_instance = kwargs["motor"]
                throttle_pct = kwargs["throttle"]
                duration_sec = kwargs["duration"]
                motor_count = kwargs.get("motor_count", 1)

                if is_ap:
                    self._mav.mav.command_long_send(
                        ts, tc,
                        mavutil.mavlink.MAV_CMD_DO_MOTOR_TEST,
                        0,
                        motor_instance, 0, throttle_pct, duration_sec,
                        motor_count, 0, 0,
                    )
                else:
                    MAV_CMD_ACTUATOR_TEST = 310
                    value = throttle_pct / 100.0
                    if motor_count == 0:
                        for m in range(8):
                            motor_function = 101 + m
                            self._mav.mav.command_long_send(
                                ts, tc,
                                MAV_CMD_ACTUATOR_TEST,
                                0, value, duration_sec, 0, 0, motor_function, 0, 0,
                            )
                            time.sleep(0.05)
                    else:
                        motor_function = 100 + motor_instance
                        self._mav.mav.command_long_send(
                            ts, tc,
                            MAV_CMD_ACTUATOR_TEST,
                            0, value, duration_sec, 0, 0, motor_function, 0, 0,
                        )
            elif cmd_type == "servo_set":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_DO_SET_SERVO,
                    0,
                    kwargs["servo"], kwargs["pwm"],
                    0, 0, 0, 0, 0,
                )
            elif cmd_type == "goto":
                self._mav.mav.set_position_target_global_int_send(
                    0, ts, tc,
                    mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                    0b0000111111111000,
                    int(kwargs["lat"] * 1e7),
                    int(kwargs["lon"] * 1e7),
                    kwargs["alt"],
                    0, 0, 0, 0, 0, 0, 0, 0,
                )
            elif cmd_type == "set_home":
                use_current = kwargs.get("use_current", False)
                lat = kwargs.get("lat", 0)
                lon = kwargs.get("lon", 0)
                alt = kwargs.get("alt", 0)
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_DO_SET_HOME,
                    0,
                    1 if use_current else 0,
                    0, 0, 0,
                    lat, lon, alt
                )
            elif cmd_type == "set_roi":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_DO_SET_ROI_LOCATION,
                    0, 0, 0, 0, 0,
                    kwargs["lat"],
                    kwargs["lon"],
                    kwargs.get("alt", 0),
                )
            elif cmd_type == "preflight_calibration":
                self._mav.mav.command_long_send(
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_PREFLIGHT_CALIBRATION,
                    0,
                    kwargs.get("param1", 0),
                    kwargs.get("param2", 0),
                    kwargs.get("param3", 0),
                    kwargs.get("param4", 0),
                    kwargs.get("param5", 0),
                    kwargs.get("param6", 0),
                    0,
                )
            elif cmd_type == "set_param":
                param_id = kwargs["param_id"]
                if isinstance(param_id, str):
                    param_id = param_id.encode('utf-8')
                param_id = param_id.ljust(16, b'\x00')
                self._mav.mav.param_set_send(
                    ts, tc,
                    param_id, kwargs["value"],
                    kwargs.get("param_type", 9),
                )
            elif cmd_type == "request_camera_info":
                self._mav.mav.command_long_send(
                    ts, 0,
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
                    ts, tc,
                    mavutil.mavlink.MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW,
                    0,
                    pitch_rad, yaw_rad,
                    kwargs.get("pitch_rate", float('nan')),
                    kwargs.get("yaw_rate", float('nan')),
                    0, 0, 0
                )
        except Exception as e:
            print(f"Command error ({cmd_type}): {e}")

    def _get_vehicle_for_msg(self, msg):
        """Get the Vehicle for this message's src_system, or None."""
        src_system = msg.get_srcSystem()
        with self._vehicles_lock:
            return self._vehicles.get(src_system)

    def _handle_message(self, msg):
        msg_type = msg.get_type()
        now = time.time()
        src_system = msg.get_srcSystem()
        src_component = msg.get_srcComponent()

        # Track message for inspector
        self._track_message(msg, msg_type, now)

        # Route mission protocol messages to the vehicle's queue
        if msg_type in ("MISSION_REQUEST_INT", "MISSION_REQUEST", "MISSION_ACK",
                        "MISSION_COUNT", "MISSION_ITEM_INT"):
            vehicle = self._get_vehicle_for_msg(msg)
            if vehicle:
                vehicle.mission_msg_queue.put(msg)
            return

        # Store parameter values on the correct vehicle
        if msg_type == "PARAM_VALUE":
            vehicle = self._get_vehicle_for_msg(msg)
            if vehicle:
                with vehicle.params_lock:
                    name = msg.param_id.rstrip('\x00') if isinstance(msg.param_id, str) else msg.param_id.decode('utf-8', errors='replace').rstrip('\x00')
                    vehicle.params[name] = {
                        'value': msg.param_value,
                        'type': msg.param_type,
                        'index': msg.param_index,
                    }
                    vehicle.params_total = msg.param_count
            return

        # Store camera information on the correct vehicle
        if msg_type == "CAMERA_INFORMATION":
            vehicle = self._get_vehicle_for_msg(msg)
            if vehicle:
                with vehicle.camera_lock:
                    comp_id = msg.get_srcComponent()
                    vendor = msg.vendor_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'vendor_name') else ''
                    model = msg.model_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'model_name') else ''
                    vehicle.cameras[comp_id] = {
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
            vehicle = self._get_vehicle_for_msg(msg)
            if vehicle:
                with vehicle.camera_lock:
                    comp_id = msg.get_srcComponent()
                    vendor = msg.vendor_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'vendor_name') else ''
                    model = msg.model_name.rstrip(b'\x00').decode('utf-8', errors='replace') if hasattr(msg, 'model_name') else ''
                    vehicle.gimbals[comp_id] = {
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

        # Capture STATUSTEXT messages on the correct vehicle
        if msg_type == "STATUSTEXT":
            text = msg.text.rstrip('\x00') if isinstance(msg.text, str) else msg.text.decode('utf-8', errors='replace').rstrip('\x00')
            severity = msg.severity
            vehicle = self._get_vehicle_for_msg(msg)
            if vehicle:
                with vehicle.statustext_lock:
                    for prev in reversed(vehicle.statustext_queue):
                        if now - prev['time'] > 1.0:
                            break
                        if prev['text'] == text and prev['severity'] == severity:
                            return
                    vehicle.statustext_queue.append({
                        'severity': severity,
                        'text': text,
                        'time': now,
                    })
                    if len(vehicle.statustext_queue) > 100:
                        vehicle.statustext_queue = vehicle.statustext_queue[-100:]
            return

        # Handle COMMAND_ACK - route calibration feedback to vehicle
        if msg_type == "COMMAND_ACK":
            command = msg.command
            result = msg.result
            if command == 241:  # MAV_CMD_PREFLIGHT_CALIBRATION
                result_texts = {
                    0: ("Calibration accepted", 6),
                    1: ("Calibration temporarily rejected - try again", 4),
                    2: ("Calibration denied", 3),
                    3: ("Calibration unsupported", 4),
                    4: ("Calibration failed", 3),
                    5: ("Calibration in progress", 6),
                    6: ("Calibration cancelled", 4),
                }
                text, severity = result_texts.get(result, (f"Calibration result: {result}", 4))
                vehicle = self._get_vehicle_for_msg(msg)
                if vehicle:
                    with vehicle.statustext_lock:
                        vehicle.statustext_queue.append({
                            'severity': severity,
                            'text': text,
                            'time': now,
                        })
            return

        # HEARTBEAT - update vehicle telemetry or discover new vehicles
        if msg_type == "HEARTBEAT":
            self._register_component(src_system, src_component, msg.type, msg.autopilot)

            # Skip GCS heartbeats
            if msg.type == mavutil.mavlink.MAV_TYPE_GCS:
                return

            # Only process component 1 (autopilot) heartbeats for vehicle telemetry
            if src_component != 1:
                return

            # Check if this is a known vehicle
            vehicle = None
            with self._vehicles_lock:
                vehicle = self._vehicles.get(src_system)

            # Auto-discover new vehicles on this connection
            if vehicle is None and msg.type in VEHICLE_TYPES and src_component == 1:
                vehicle = self._create_vehicle_from_heartbeat(msg)
                if vehicle and self.on_vehicle_discovered:
                    self.on_vehicle_discovered(vehicle)
                # Request data streams for newly discovered vehicle
                if vehicle:
                    self._request_data_streams(vehicle)
                    print(f"Auto-discovered vehicle sysid={src_system} ({vehicle.telemetry.platform_type})")

            if vehicle is None:
                return

            with vehicle.lock:
                base_mode = msg.base_mode
                vehicle.telemetry.armed = bool(base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
                vehicle.telemetry.system_status = msg.system_status
                vehicle.telemetry.last_heartbeat = time.time()
                vehicle.telemetry.platform_type = MAV_TYPES.get(msg.type, f"Type {msg.type}")

                if vehicle.is_ardupilot:
                    custom = msg.custom_mode
                    vehicle.telemetry.mode = ARDUPILOT_MODES.get(custom, f"MODE_{custom}")
                else:
                    main_mode = (msg.custom_mode >> 16) & 0xFF
                    sub_mode = (msg.custom_mode >> 24) & 0xFF
                    vehicle.telemetry.mode = PX4_MODES.get(
                        (main_mode, sub_mode), f"PX4_{main_mode}_{sub_mode}"
                    )
            return

        # Route telemetry messages to the correct vehicle
        vehicle = self._get_vehicle_for_msg(msg)
        if vehicle is None:
            return

        with vehicle.lock:
            if msg_type == "ATTITUDE":
                vehicle.telemetry.roll = msg.roll
                vehicle.telemetry.pitch = msg.pitch
                vehicle.telemetry.yaw = msg.yaw
                vehicle.telemetry.rollspeed = msg.rollspeed
                vehicle.telemetry.pitchspeed = msg.pitchspeed
                vehicle.telemetry.yawspeed = msg.yawspeed

            elif msg_type == "GLOBAL_POSITION_INT":
                vehicle.telemetry.lat = msg.lat / 1e7
                vehicle.telemetry.lon = msg.lon / 1e7
                vehicle.telemetry.alt = msg.relative_alt / 1000.0
                vehicle.telemetry.alt_msl = msg.alt / 1000.0

            elif msg_type == "GPS_RAW_INT":
                vehicle.telemetry.fix_type = msg.fix_type
                vehicle.telemetry.satellites = msg.satellites_visible
                vehicle.telemetry.hdop = msg.eph / 100.0 if msg.eph != 65535 else 99.99

            elif msg_type == "VFR_HUD":
                vehicle.telemetry.airspeed = msg.airspeed
                vehicle.telemetry.groundspeed = msg.groundspeed
                vehicle.telemetry.heading = msg.heading
                vehicle.telemetry.climb = msg.climb

            elif msg_type == "SYS_STATUS":
                vehicle.telemetry.voltage = msg.voltage_battery / 1000.0
                vehicle.telemetry.current = msg.current_battery / 100.0 if msg.current_battery != -1 else 0.0
                vehicle.telemetry.remaining = msg.battery_remaining

            elif msg_type == "MISSION_CURRENT":
                vehicle.telemetry.mission_seq = msg.seq

    # --- High-level vehicle command helpers ---
    # These take a Vehicle and enqueue commands targeted at it.

    def arm(self, vehicle):
        self.enqueue_vehicle_cmd(vehicle, "arm")

    def disarm(self, vehicle):
        self.enqueue_vehicle_cmd(vehicle, "disarm")

    def takeoff(self, vehicle, alt: float = 10):
        self.enqueue_vehicle_cmd(vehicle, "takeoff", alt=alt)

    def land(self, vehicle):
        if vehicle.is_ardupilot:
            self.enqueue_vehicle_cmd(vehicle, "set_mode", mode="LAND")
        else:
            self.enqueue_vehicle_cmd(vehicle, "land")

    def rtl(self, vehicle):
        self.enqueue_vehicle_cmd(vehicle, "set_mode", mode="RTL")

    def set_mode(self, vehicle, mode: str):
        self.enqueue_vehicle_cmd(vehicle, "set_mode", mode=mode)

    def rc_override(self, vehicle, channels: list):
        if vehicle.is_ardupilot:
            self.enqueue_vehicle_cmd(vehicle, "rc_override", channels=channels)
        else:
            def pwm_to_manual(pwm, center=1500, scale=1000):
                return int((pwm - center) / 500 * scale)

            x = pwm_to_manual(channels[1]) if len(channels) > 1 else 0
            y = pwm_to_manual(channels[0]) if len(channels) > 0 else 0
            z = int((channels[2] - 1000) / 1000 * 1000) if len(channels) > 2 else 500
            r = pwm_to_manual(channels[3]) if len(channels) > 3 else 0
            self.enqueue_vehicle_cmd(vehicle, "manual_control", x=x, y=y, z=z, r=r)

    def motor_test(self, vehicle, motor: int = 1, throttle: float = 5.0, duration: float = 2.0, all_motors: bool = False):
        self.enqueue_vehicle_cmd(
            vehicle, "motor_test",
            motor=motor, throttle=throttle, duration=duration,
            motor_count=0 if all_motors else 1,
        )

    def servo_set(self, vehicle, servo: int = 1, pwm: int = 1500):
        self.enqueue_vehicle_cmd(vehicle, "servo_set", servo=servo, pwm=pwm)

    def goto(self, vehicle, lat: float, lon: float, alt: float):
        self.enqueue_vehicle_cmd(vehicle, "goto", lat=lat, lon=lon, alt=alt)

    def set_roi(self, vehicle, lat: float, lon: float, alt: float = 0):
        self.enqueue_vehicle_cmd(vehicle, "set_roi", lat=lat, lon=lon, alt=alt)

    def set_home(self, vehicle, lat: float, lon: float, alt: float = 0):
        self.enqueue_vehicle_cmd(vehicle, "set_home", lat=lat, lon=lon, alt=alt)

    def calibrate(self, vehicle, cal_type: str):
        cal_map = {
            "gyro":     {"param1": 1},
            "compass":  {"param2": 1},
            "pressure": {"param3": 1},
            "accel":    {"param5": 1},
            "level":    {"param5": 2},
            "cancel":   {"param1": 0, "param2": 0, "param3": 0, "param4": 0, "param5": 0, "param6": 0},
            "next_step": {"param5": 4},
        }
        params = cal_map.get(cal_type, {})
        if params:
            self.enqueue_vehicle_cmd(vehicle, "preflight_calibration", **params)

    def request_camera_info(self, vehicle):
        self.enqueue_vehicle_cmd(vehicle, "request_camera_info")

    def set_gimbal_pitch_yaw(self, vehicle, pitch: float, yaw: float, pitch_rate: float = 0, yaw_rate: float = 0):
        self.enqueue_vehicle_cmd(vehicle, "gimbal_pitch_yaw", pitch=pitch, yaw=yaw, pitch_rate=pitch_rate, yaw_rate=yaw_rate)

    def send_mission_cmd(self, vehicle, cmd_type: str, **kwargs):
        self.enqueue_vehicle_cmd(vehicle, cmd_type, **kwargs)

    def request_params(self, vehicle):
        self.enqueue_vehicle_cmd(vehicle, "request_param_list")

    def set_param(self, vehicle, param_id: str, value: float, param_type: int = 9):
        self.enqueue_vehicle_cmd(vehicle, "set_param", param_id=param_id, value=value, param_type=param_type)

    def _track_message(self, msg, msg_type: str, now: float):
        """Track message for the MAVLink inspector."""
        src_system = msg.get_srcSystem()
        src_component = msg.get_srcComponent()

        key = f"{msg_type}:{src_system}:{src_component}"

        with self._msg_stats_lock:
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
                self._msg_history[key] = deque(maxlen=100)

            stats = self._msg_stats[key]
            stats['count'] += 1
            stats['last_time'] = now

            history = self._msg_history[key]
            history.append(now)

            cutoff = now - self._rate_window
            while history and history[0] < cutoff:
                history.popleft()

            if len(history) >= 2:
                time_span = history[-1] - history[0]
                if time_span > 0:
                    stats['rate'] = round((len(history) - 1) / time_span, 1)
            else:
                stats['rate'] = 0.0

            try:
                msg_dict = msg.to_dict()
                msg_dict.pop('mavpackettype', None)
                stats['last_data'] = sanitize_for_json({k: v for k, v in list(msg_dict.items())[:20]})
            except Exception:
                stats['last_data'] = {}

    def get_message_stats(self) -> list:
        """Return message statistics for the inspector."""
        with self._msg_stats_lock:
            now = time.time()
            result = []
            for key, stats in self._msg_stats.items():
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

        if mav_type in VEHICLE_TYPES:
            category = "vehicle"
            type_name = MAV_TYPES.get(mav_type, f"Type {mav_type}")
        elif mav_type in PERIPHERAL_TYPES:
            category = "peripheral"
            type_name = PERIPHERAL_TYPES[mav_type]
        else:
            category = "unknown"
            type_name = MAV_TYPES.get(mav_type, f"Type {mav_type}")

        autopilot_name = "unknown"
        if autopilot == 3:
            autopilot_name = "ardupilot"
        elif autopilot == 12:
            autopilot_name = "px4"
        elif autopilot == 8:
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
                    'active': age < 5,
                })
            result.sort(key=lambda x: (
                not x['is_target'],
                x['category'] != 'vehicle',
                x['src_system'],
                x['src_component']
            ))
            return result
