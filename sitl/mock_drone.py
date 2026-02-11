#!/usr/bin/env python3
"""
Mock MAVLink drone simulator for multi-drone testing.

Spawns N simulated drones, each on its own UDP port, sending telemetry
at ~10 Hz and responding to commands, mission upload/download, and fence protocol.

Drones auto-arm and fly a figure-8 pattern by default.
Upload a mission and switch to AUTO to fly the waypoints.

Usage:
    python mock_drone.py --count 3 --base-port 14550
"""

import argparse
import math
import random
import threading
import time

from pymavlink import mavutil
from pymavlink.dialects.v20 import common as mavlink2


# Base positions for drones (spread around a point)
BASE_LAT = 51.9225  # ~Utrecht, Netherlands
BASE_LON = 4.4792
SPREAD = 0.005  # ~500 m between drones

# Earth radius for distance calculations
EARTH_RADIUS = 6371000.0  # meters


def haversine(lat1, lon1, lat2, lon2):
    """Distance in meters between two lat/lon points."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bearing(lat1, lon1, lat2, lon2):
    """Bearing in radians from point 1 to point 2."""
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - \
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(dlon)
    return math.atan2(y, x)


def move_latlon(lat, lon, bearing_rad, distance_m):
    """Move lat/lon by distance along bearing."""
    d = distance_m / EARTH_RADIUS
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(bearing_rad))
    lon2 = lon1 + math.atan2(math.sin(bearing_rad) * math.sin(d) * math.cos(lat1),
                              math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return math.degrees(lat2), math.degrees(lon2)


class MockDrone:
    """Simulates a single MAVLink drone."""

    def __init__(self, drone_id, port, base_lat, base_lon):
        self.drone_id = drone_id
        self.port = port
        self.sysid = drone_id + 1  # MAVLink system IDs start at 1
        self.compid = 1

        # Position state
        self.home_lat = base_lat
        self.home_lon = base_lon
        self.lat = base_lat
        self.lon = base_lon
        self.alt = 0.0  # relative alt in meters
        self.alt_msl = 10.0
        self.heading = 0.0
        self.groundspeed = 0.0
        self.airspeed = 0.0
        self.climb = 0.0
        self.vx = 0.0  # m/s north
        self.vy = 0.0  # m/s east

        # Attitude
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0
        self.rollspeed = 0.0
        self.pitchspeed = 0.0
        self.yawspeed = 0.0

        # State
        self.armed = False
        self.mode = "STABILIZE"
        self.flying = False
        self.target_alt = 25.0

        # Figure-8 parameters (default flight pattern)
        self.figure8_t = random.uniform(0, 2 * math.pi)
        self.figure8_radius = 80 + random.uniform(-10, 10)  # meters
        self.figure8_speed = 0.15 + random.uniform(-0.02, 0.02)  # radians/sec
        self.figure8_center_lat = base_lat
        self.figure8_center_lon = base_lon
        self.figure8_active = False

        # Mission storage
        self.mission_items = []
        self.mission_count_expected = 0
        self.mission_current_seq = 0
        self.mission_flying = False
        self.wp_acceptance_radius = 8.0  # meters

        # Fence storage
        self.fence_items = []
        self.fence_count_expected = 0

        # Guided mode target
        self.guided_target = None  # (lat, lon, alt)

        # Parameters (realistic ArduCopter set)
        self.params = {
            "SYSID_THISMAV": float(self.sysid),
            "ARMING_CHECK": 1.0,
            "ARMING_REQUIRE": 1.0,
            "BATT_MONITOR": 4.0,
            "BATT_CAPACITY": 5200.0,
            "BATT_LOW_VOLT": 14.0,
            "BATT_CRT_VOLT": 13.2,
            "WP_RADIUS": 2.0,
            "WP_SPEED": 5.0,
            "WP_YAW_BEHAVIOR": 1.0,
            "RTL_ALT": 3000.0,
            "RTL_SPEED": 0.0,
            "WPNAV_SPEED": 500.0,
            "WPNAV_ACCEL": 100.0,
            "WPNAV_SPEED_UP": 250.0,
            "WPNAV_SPEED_DN": 150.0,
            "FLTMODE1": 0.0,
            "FLTMODE2": 2.0,
            "FLTMODE3": 5.0,
            "FLTMODE4": 4.0,
            "FLTMODE5": 3.0,
            "FLTMODE6": 6.0,
            "PILOT_SPEED_UP": 250.0,
            "PILOT_SPEED_DN": 0.0,
            "PILOT_ACCEL_Z": 250.0,
            "INS_ACCEL_FILTER": 20.0,
            "INS_GYRO_FILTER": 20.0,
            "ATC_RAT_RLL_P": 0.135,
            "ATC_RAT_PIT_P": 0.135,
            "ATC_RAT_YAW_P": 0.18,
            "MOT_BAT_VOLT_MAX": 16.8,
            "MOT_BAT_VOLT_MIN": 13.2,
            "FRAME_CLASS": 1.0,
            "FRAME_TYPE": 1.0,
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

        # Battery simulation
        self.voltage = 16.8
        self.current = 0.5
        self.remaining = 100
        self._batt_start_time = time.time()

        # Wind simulation (adds drift)
        self.wind_speed = random.uniform(0, 3)  # m/s
        self.wind_dir = random.uniform(0, 2 * math.pi)  # radians

        # GPS noise
        self.gps_noise = 0.000001  # ~0.1m in lat/lon

        # Vibration simulation
        self.vibe_x = 0.0
        self.vibe_y = 0.0
        self.vibe_z = 0.0

        # Connection
        self.conn = None
        self.running = False
        self.thread = None
        self._src_system = 255
        self._src_component = 0

    def start(self):
        """Start the mock drone on its UDP port."""
        conn_str = f"udpout:127.0.0.1:{self.port}"
        self.conn = mavutil.mavlink_connection(
            conn_str,
            source_system=self.sysid,
            source_component=self.compid,
        )
        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        print(f"  Drone {self.drone_id} (sysid={self.sysid}) -> udpin:0.0.0.0:{self.port}")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)

    def _run(self):
        """Main loop: send telemetry + handle incoming commands."""
        last_send = 0
        last_slow_send = 0
        recv_thread = threading.Thread(target=self._recv_loop, daemon=True)
        recv_thread.start()

        # Auto-arm and takeoff after 2 seconds
        startup_time = time.time() + 2.0
        auto_started = False

        while self.running:
            now = time.time()
            dt = now - last_send if last_send else 0.1

            # Auto-arm and fly
            if not auto_started and now > startup_time:
                self.armed = True
                self.flying = True
                self.mode = "GUIDED"
                auto_started = True
                print(f"  Drone {self.drone_id}: Auto-armed and flying")

            # Update simulation
            self._update_sim(dt)

            # Send telemetry at ~10 Hz
            if now - last_send >= 0.1:
                self._send_heartbeat()
                self._send_global_position()
                self._send_attitude()
                self._send_gps_raw()
                self._send_vfr_hud()
                self._send_sys_status()
                self._send_mission_current()
                last_send = now

            # Send slower telemetry at ~2 Hz
            if now - last_slow_send >= 0.5:
                self._send_vibration()
                self._send_battery2()
                self._send_ekf_status()
                self._send_home_position()
                last_slow_send = now

            time.sleep(0.02)  # 50 Hz internal loop

    def _recv_loop(self):
        """Receive and handle incoming MAVLink messages."""
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

    def _update_sim(self, dt):
        """Update simulated drone state."""
        if dt <= 0 or dt > 1:
            return

        # Battery drain
        if self.armed:
            if self.flying and self.alt > 1:
                drain_rate = 0.015 + self.groundspeed * 0.003  # faster flight = more drain
                self.current = 12.0 + self.groundspeed * 1.5 + random.uniform(-0.5, 0.5)
            else:
                drain_rate = 0.003
                self.current = 1.5 + random.uniform(-0.2, 0.2)
            self.remaining = max(0, self.remaining - drain_rate * dt)
            self.voltage = 13.2 + (self.remaining / 100.0) * 3.6 + random.uniform(-0.05, 0.05)
        else:
            self.current = 0.3 + random.uniform(-0.1, 0.1)
            self.voltage = 16.8 + random.uniform(-0.02, 0.02)

        # Vibration (higher when flying)
        if self.flying and self.alt > 0.5:
            self.vibe_x = 8 + random.uniform(-3, 3)
            self.vibe_y = 8 + random.uniform(-3, 3)
            self.vibe_z = 12 + random.uniform(-5, 5)
        else:
            self.vibe_x = random.uniform(0, 1)
            self.vibe_y = random.uniform(0, 1)
            self.vibe_z = random.uniform(0, 2)

        # Altitude changes
        if self.flying:
            alt_diff = self.target_alt - self.alt
            if abs(alt_diff) > 0.3:
                climb_rate = min(2.5, max(-2.0, alt_diff * 0.8))
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

        self.alt_msl = 10.0 + self.alt

        # Horizontal movement
        if self.flying and self.alt > 2.0:
            if self.mode == "AUTO" and self.mission_flying:
                self._fly_mission(dt)
            elif self.mode == "GUIDED" and self.guided_target:
                self._fly_to_target(dt, self.guided_target[0], self.guided_target[1], self.guided_target[2])
            elif self.mode == "RTL":
                dist = haversine(self.lat, self.lon, self.home_lat, self.home_lon)
                if dist > 3:
                    self._fly_to_target(dt, self.home_lat, self.home_lon, 15.0)
                else:
                    self.target_alt = 0
                    self.flying = True
                    if self.alt < 0.5:
                        self.armed = False
                        self.flying = False
                        self.mode = "STABILIZE"
                        print(f"  Drone {self.drone_id}: RTL complete, disarmed")
            elif self.mode == "LAND":
                self.target_alt = 0
                if self.alt < 0.5:
                    self.armed = False
                    self.flying = False
                    self.mode = "STABILIZE"
                    print(f"  Drone {self.drone_id}: Landed, disarmed")
            else:
                # Default: fly figure-8 pattern
                self._fly_figure8(dt)

        # Attitude simulation
        if self.flying and self.alt > 1:
            # Bank angle proportional to turn rate
            target_roll = math.radians(max(-25, min(25, self.yawspeed * 15)))
            self.roll += (target_roll - self.roll) * min(1, 3 * dt)
            # Pitch slightly nose-down when moving forward
            target_pitch = math.radians(-max(0, min(8, self.groundspeed * 1.0)))
            self.pitch += (target_pitch - self.pitch) * min(1, 3 * dt)
            self.rollspeed = random.uniform(-0.02, 0.02)
            self.pitchspeed = random.uniform(-0.02, 0.02)
        else:
            self.roll *= 0.9
            self.pitch *= 0.9
            self.rollspeed = 0
            self.pitchspeed = 0
            self.yawspeed = 0

    def _fly_figure8(self, dt):
        """Fly a figure-8 / lemniscate pattern."""
        self.figure8_t += self.figure8_speed * dt

        t = self.figure8_t
        # Lemniscate of Bernoulli parametric
        denom = 1 + math.sin(t) ** 2
        target_x = self.figure8_radius * math.cos(t) / denom
        target_y = self.figure8_radius * math.sin(t) * math.cos(t) / denom

        # Convert to lat/lon offset
        target_lat = self.figure8_center_lat + target_x / 111000.0
        target_lon = self.figure8_center_lon + target_y / (111000.0 * math.cos(math.radians(self.figure8_center_lat)))

        self._move_toward(dt, target_lat, target_lon, speed=8.0)

    def _fly_mission(self, dt):
        """Fly the uploaded mission waypoints sequentially."""
        if not self.mission_items or self.mission_current_seq >= len(self.mission_items):
            self.mission_flying = False
            self.mode = "LOITER"
            print(f"  Drone {self.drone_id}: Mission complete")
            return

        item = self.mission_items[self.mission_current_seq]
        if item is None:
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

        # Skip home position at seq 0 (lat/lon might be 0,0)
        if self.mission_current_seq == 0 or (wp_lat == 0 and wp_lon == 0):
            self.mission_current_seq += 1
            return

        self.target_alt = wp_alt
        dist = haversine(self.lat, self.lon, wp_lat, wp_lon)

        if dist < self.wp_acceptance_radius:
            print(f"  Drone {self.drone_id}: Reached WP {self.mission_current_seq} ({dist:.1f}m)")
            self.mission_current_seq += 1
        else:
            self._fly_to_target(dt, wp_lat, wp_lon, wp_alt)

    def _fly_to_target(self, dt, target_lat, target_lon, target_alt):
        """Fly toward a specific lat/lon/alt."""
        self.target_alt = target_alt
        self._move_toward(dt, target_lat, target_lon, speed=5.0)

    def _move_toward(self, dt, target_lat, target_lon, speed=5.0):
        """Move drone position toward target at given speed."""
        dist = haversine(self.lat, self.lon, target_lat, target_lon)
        if dist < 0.5:
            self.groundspeed *= 0.9
            return

        brng = bearing(self.lat, self.lon, target_lat, target_lon)
        move_dist = min(speed * dt, dist)

        # Add wind effect
        wind_lat = self.wind_speed * math.cos(self.wind_dir) * dt / 111000.0
        wind_lon = self.wind_speed * math.sin(self.wind_dir) * dt / (111000.0 * math.cos(math.radians(self.lat)))

        new_lat, new_lon = move_latlon(self.lat, self.lon, brng, move_dist)
        new_lat += wind_lat
        new_lon += wind_lon

        # Heading smoothly tracks bearing
        target_heading = math.degrees(brng) % 360
        heading_diff = (target_heading - self.heading + 540) % 360 - 180
        self.yawspeed = math.radians(heading_diff) * 2
        self.heading = (self.heading + heading_diff * min(1, 3 * dt)) % 360
        self.yaw = math.radians(self.heading)

        self.lat = new_lat
        self.lon = new_lon
        self.groundspeed = speed if dist > 1 else dist
        self.airspeed = self.groundspeed + self.wind_speed * 0.5 + random.uniform(-0.3, 0.3)

        self.vx = self.groundspeed * math.cos(brng)
        self.vy = self.groundspeed * math.sin(brng)

    def _handle_message(self, msg):
        """Handle incoming MAVLink messages."""
        mtype = msg.get_type()

        if mtype == "COMMAND_LONG":
            self._handle_command(msg)
        elif mtype == "SET_MODE":
            modes = {0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
                     5: "LOITER", 6: "RTL", 9: "LAND"}
            self.mode = modes.get(msg.custom_mode, f"MODE_{msg.custom_mode}")
            self._start_mode_behavior()
            print(f"  Drone {self.drone_id}: Mode -> {self.mode}")
        elif mtype == "MISSION_COUNT":
            self._handle_mission_count(msg)
        elif mtype in ("MISSION_ITEM_INT", "MISSION_ITEM"):
            self._handle_mission_item(msg)
        elif mtype == "MISSION_REQUEST_LIST":
            self._handle_mission_request_list(msg)
        elif mtype == "MISSION_REQUEST_INT":
            self._handle_mission_request_int(msg)
        elif mtype == "MISSION_REQUEST":
            self._handle_mission_request_int(msg)  # same logic
        elif mtype == "MISSION_ACK":
            pass  # download complete acknowledgement from GCS
        elif mtype == "MISSION_CLEAR_ALL":
            self._handle_mission_clear(msg)
        elif mtype == "MISSION_SET_CURRENT":
            if msg.seq < len(self.mission_items):
                self.mission_current_seq = msg.seq
                print(f"  Drone {self.drone_id}: Mission current -> {msg.seq}")
        elif mtype == "PARAM_REQUEST_LIST":
            self._send_all_params()
        elif mtype == "PARAM_SET":
            self._handle_param_set(msg)
        elif mtype == "PARAM_REQUEST_READ":
            self._handle_param_read(msg)
        elif mtype == "RC_CHANNELS_OVERRIDE":
            pass  # Silently accept RC override
        elif mtype == "SET_POSITION_TARGET_GLOBAL_INT":
            self._handle_set_position_target(msg)
        elif mtype == "COMMAND_INT":
            self._handle_command_int(msg)

    def _start_mode_behavior(self):
        """Set up behavior when mode changes."""
        if self.mode == "AUTO":
            if self.mission_items:
                self.mission_flying = True
                if self.mission_current_seq == 0:
                    self.mission_current_seq = 1  # skip home
                print(f"  Drone {self.drone_id}: Starting mission from WP {self.mission_current_seq}")
            else:
                print(f"  Drone {self.drone_id}: No mission loaded")
        else:
            self.mission_flying = False

    def _handle_command(self, msg):
        """Handle COMMAND_LONG messages."""
        cmd = msg.command

        # MAV_CMD_COMPONENT_ARM_DISARM (400)
        if cmd == 400:
            if msg.param1 == 1:
                self.armed = True
                print(f"  Drone {self.drone_id}: Armed")
            else:
                self.armed = False
                self.flying = False
                self.mission_flying = False
                print(f"  Drone {self.drone_id}: Disarmed")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_TAKEOFF (22)
        elif cmd == 22:
            if self.armed:
                self.target_alt = msg.param7 if msg.param7 > 0 else 10.0
                self.flying = True
                self.mode = "GUIDED"
                print(f"  Drone {self.drone_id}: Takeoff to {self.target_alt}m")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_LAND (21)
        elif cmd == 21:
            self.target_alt = 0
            self.mode = "LAND"
            self.mission_flying = False
            print(f"  Drone {self.drone_id}: Landing")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_RETURN_TO_LAUNCH (20)
        elif cmd == 20:
            self.mode = "RTL"
            self.mission_flying = False
            self.target_alt = 15
            print(f"  Drone {self.drone_id}: RTL")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_MODE (176)
        elif cmd == 176:
            modes = {0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
                     5: "LOITER", 6: "RTL", 9: "LAND"}
            self.mode = modes.get(int(msg.param2), f"MODE_{int(msg.param2)}")
            self._start_mode_behavior()
            print(f"  Drone {self.drone_id}: Mode -> {self.mode}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_WAYPOINT (goto via COMMAND_LONG)
        elif cmd == 16:
            if msg.param5 != 0 and msg.param6 != 0:
                self.guided_target = (msg.param5, msg.param6, msg.param7 if msg.param7 > 0 else self.target_alt)
                self.mode = "GUIDED"
                print(f"  Drone {self.drone_id}: Goto {msg.param5:.6f}, {msg.param6:.6f}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_ROI (201)
        elif cmd == 201:
            print(f"  Drone {self.drone_id}: ROI set")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_HOME (179)
        elif cmd == 179:
            if msg.param1 == 1:
                self.home_lat = self.lat
                self.home_lon = self.lon
            elif msg.param5 != 0:
                self.home_lat = msg.param5
                self.home_lon = msg.param6
            print(f"  Drone {self.drone_id}: Home set ({self.home_lat:.6f}, {self.home_lon:.6f})")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_MISSION_START (300)
        elif cmd == 300:
            self.mode = "AUTO"
            self._start_mode_behavior()
            print(f"  Drone {self.drone_id}: Mission start")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_CHANGE_SPEED (178)
        elif cmd == 178:
            print(f"  Drone {self.drone_id}: Speed set to {msg.param2}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_REPOSITION (192)
        elif cmd == 192:
            if msg.param5 != 0 and msg.param6 != 0:
                self.guided_target = (msg.param5 / 1e7 if abs(msg.param5) > 1000 else msg.param5,
                                      msg.param6 / 1e7 if abs(msg.param6) > 1000 else msg.param6,
                                      msg.param7 if msg.param7 > 0 else self.target_alt)
                self.mode = "GUIDED"
            self._send_command_ack(cmd, 0)

        # MAV_CMD_REQUEST_AUTOPILOT_CAPABILITIES (520)
        elif cmd == 520:
            self._send_command_ack(cmd, 0)

        else:
            # ACK everything else as accepted
            self._send_command_ack(cmd, 0)

    def _handle_command_int(self, msg):
        """Handle COMMAND_INT messages (position commands)."""
        cmd = msg.command
        if cmd == 192 or cmd == 16:  # DO_REPOSITION or NAV_WAYPOINT
            lat = msg.x / 1e7 if msg.x != 0 else None
            lon = msg.y / 1e7 if msg.y != 0 else None
            alt = msg.z if msg.z > 0 else self.target_alt
            if lat and lon:
                self.guided_target = (lat, lon, alt)
                self.mode = "GUIDED"
        self._send_command_ack(cmd, 0)

    def _handle_set_position_target(self, msg):
        """Handle SET_POSITION_TARGET_GLOBAL_INT (guided position)."""
        lat = msg.lat_int / 1e7
        lon = msg.lon_int / 1e7
        alt = msg.alt if msg.alt > 0 else self.target_alt
        if lat != 0 and lon != 0:
            self.guided_target = (lat, lon, alt)
            self.mode = "GUIDED"

    # --- Mission upload protocol ---

    def _handle_mission_count(self, msg):
        """Start mission upload protocol."""
        mission_type = getattr(msg, 'mission_type', 0)
        if mission_type == 2:  # FENCE
            self.fence_count_expected = msg.count
            self.fence_items = [None] * msg.count
            print(f"  Drone {self.drone_id}: Fence upload started, expecting {msg.count} items")
            self.conn.mav.mission_request_int_send(
                msg.get_srcSystem(), msg.get_srcComponent(), 0,
                mission_type=2,
            )
        else:
            self.mission_count_expected = msg.count
            self.mission_items = [None] * msg.count
            self.mission_current_seq = 0
            print(f"  Drone {self.drone_id}: Mission upload started, expecting {msg.count} items")
            self.conn.mav.mission_request_int_send(
                msg.get_srcSystem(), msg.get_srcComponent(), 0,
                mission_type=0,
            )

    def _handle_mission_item(self, msg):
        """Handle incoming mission item (upload)."""
        mission_type = getattr(msg, 'mission_type', 0)
        seq = msg.seq

        if mission_type == 2:  # FENCE
            if seq < len(self.fence_items):
                self.fence_items[seq] = msg
                next_seq = seq + 1
                if next_seq < self.fence_count_expected:
                    self.conn.mav.mission_request_int_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), next_seq,
                        mission_type=2,
                    )
                else:
                    self.conn.mav.mission_ack_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), 0,
                        mission_type=2,
                    )
                    print(f"  Drone {self.drone_id}: Fence upload complete ({len(self.fence_items)} items)")
        else:
            if seq < len(self.mission_items):
                self.mission_items[seq] = msg
                next_seq = seq + 1
                if next_seq < self.mission_count_expected:
                    self.conn.mav.mission_request_int_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), next_seq,
                        mission_type=0,
                    )
                else:
                    self.conn.mav.mission_ack_send(
                        msg.get_srcSystem(), msg.get_srcComponent(), 0,
                        mission_type=0,
                    )
                    print(f"  Drone {self.drone_id}: Mission upload complete ({len(self.mission_items)} items)")

    # --- Mission download protocol ---

    def _handle_mission_request_list(self, msg):
        """GCS requests list of mission items (download start)."""
        mission_type = getattr(msg, 'mission_type', 0)
        if mission_type == 2:  # FENCE
            count = len([f for f in self.fence_items if f is not None])
            self.conn.mav.mission_count_send(
                msg.get_srcSystem(), msg.get_srcComponent(),
                count, mission_type=2,
            )
            print(f"  Drone {self.drone_id}: Fence download requested, {count} items")
        else:
            count = len([m for m in self.mission_items if m is not None])
            self.conn.mav.mission_count_send(
                msg.get_srcSystem(), msg.get_srcComponent(),
                count, mission_type=0,
            )
            print(f"  Drone {self.drone_id}: Mission download requested, {count} items")

    def _handle_mission_request_int(self, msg):
        """GCS requests a specific mission item (download)."""
        seq = msg.seq
        mission_type = getattr(msg, 'mission_type', 0)

        if mission_type == 2:  # FENCE
            if seq < len(self.fence_items) and self.fence_items[seq] is not None:
                item = self.fence_items[seq]
                self.conn.mav.mission_item_int_send(
                    msg.get_srcSystem(), msg.get_srcComponent(),
                    seq,
                    getattr(item, 'frame', 0),
                    getattr(item, 'command', 5003),
                    0, 0,
                    getattr(item, 'param1', 0),
                    getattr(item, 'param2', 0),
                    getattr(item, 'param3', 0),
                    getattr(item, 'param4', 0),
                    getattr(item, 'x', 0),
                    getattr(item, 'y', 0),
                    getattr(item, 'z', 0),
                    mission_type=2,
                )
        else:
            if seq < len(self.mission_items) and self.mission_items[seq] is not None:
                item = self.mission_items[seq]
                self.conn.mav.mission_item_int_send(
                    msg.get_srcSystem(), msg.get_srcComponent(),
                    seq,
                    getattr(item, 'frame', 3),
                    getattr(item, 'command', 16),
                    1 if seq == self.mission_current_seq else 0,
                    1,
                    getattr(item, 'param1', 0),
                    getattr(item, 'param2', 0),
                    getattr(item, 'param3', 0),
                    getattr(item, 'param4', 0),
                    getattr(item, 'x', 0),
                    getattr(item, 'y', 0),
                    getattr(item, 'z', 0),
                    mission_type=0,
                )
            else:
                # Send NACK for invalid request
                self.conn.mav.mission_ack_send(
                    msg.get_srcSystem(), msg.get_srcComponent(),
                    1,  # MAV_MISSION_ERROR
                    mission_type=0,
                )

    def _handle_mission_clear(self, msg):
        """Handle MISSION_CLEAR_ALL."""
        mission_type = getattr(msg, 'mission_type', 0)
        if mission_type == 2:
            self.fence_items = []
            self.fence_count_expected = 0
            print(f"  Drone {self.drone_id}: Fence cleared")
        else:
            self.mission_items = []
            self.mission_count_expected = 0
            self.mission_current_seq = 0
            self.mission_flying = False
            print(f"  Drone {self.drone_id}: Mission cleared")
        self.conn.mav.mission_ack_send(
            msg.get_srcSystem(), msg.get_srcComponent(), 0,
            mission_type=mission_type,
        )

    # --- Parameters ---

    def _send_all_params(self):
        """Send all parameters."""
        items = list(self.params.items())
        for i, (name, value) in enumerate(items):
            self.conn.mav.param_value_send(
                name.encode('utf-8'),
                value,
                mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
                len(items),
                i,
            )
            time.sleep(0.01)  # small delay to avoid flooding

    def _handle_param_set(self, msg):
        """Handle PARAM_SET."""
        name = msg.param_id.rstrip('\x00')
        self.params[name] = msg.param_value
        idx = list(self.params.keys()).index(name) if name in self.params else 0
        self.conn.mav.param_value_send(
            name.encode('utf-8'),
            msg.param_value,
            mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
            len(self.params),
            idx,
        )
        print(f"  Drone {self.drone_id}: Param {name} = {msg.param_value}")

    def _handle_param_read(self, msg):
        """Handle PARAM_REQUEST_READ."""
        name = msg.param_id.rstrip('\x00')
        if msg.param_index >= 0:
            items = list(self.params.items())
            if msg.param_index < len(items):
                name, value = items[msg.param_index]
                self.conn.mav.param_value_send(
                    name.encode('utf-8'), value,
                    mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
                    len(self.params), msg.param_index,
                )
        elif name in self.params:
            idx = list(self.params.keys()).index(name)
            self.conn.mav.param_value_send(
                name.encode('utf-8'), self.params[name],
                mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
                len(self.params), idx,
            )

    # --- Telemetry senders ---

    def _send_command_ack(self, command, result):
        self.conn.mav.command_ack_send(command, result)

    def _send_heartbeat(self):
        state = 4 if self.armed else 3  # MAV_STATE_ACTIVE / STANDBY
        mode_flags = 1 | 16 | 64  # CUSTOM | STABILIZE | MANUAL
        if self.armed:
            mode_flags |= 128  # SAFETY_ARMED

        custom_mode = {"STABILIZE": 0, "ALT_HOLD": 2, "AUTO": 3, "GUIDED": 4,
                       "LOITER": 5, "RTL": 6, "LAND": 9}.get(self.mode, 0)

        self.conn.mav.heartbeat_send(
            type=2,  # MAV_TYPE_QUADROTOR
            autopilot=3,  # MAV_AUTOPILOT_ARDUPILOT
            base_mode=mode_flags,
            custom_mode=custom_mode,
            system_status=state,
        )

    def _send_global_position(self):
        # Add GPS noise
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
            self.roll,
            self.pitch,
            self.yaw,
            self.rollspeed,
            self.pitchspeed,
            self.yawspeed,
        )

    def _send_gps_raw(self):
        sats = 12 + random.randint(-2, 2)
        hdop = 110 + random.randint(-20, 20)
        self.conn.mav.gps_raw_int_send(
            int(time.time() * 1e6) & 0xFFFFFFFFFFFFFFFF,
            3,  # GPS_FIX_TYPE_3D_FIX
            int(self.lat * 1e7),
            int(self.lon * 1e7),
            int(self.alt_msl * 1000),
            hdop,  # hdop * 100
            80,   # vdop * 100
            int(self.groundspeed * 100),
            int(self.heading * 100),
            sats,
        )

    def _send_vfr_hud(self):
        throttle = 55 + random.randint(-5, 5) if (self.flying and self.alt > 1) else 0
        self.conn.mav.vfr_hud_send(
            self.airspeed,
            self.groundspeed,
            int(self.heading) % 360,
            throttle,
            self.alt_msl,
            self.climb,
        )

    def _send_sys_status(self):
        # Realistic sensor flags
        sensors_present = 0x1 | 0x2 | 0x4 | 0x8 | 0x20 | 0x40 | 0x200  # gyro, accel, mag, baro, gps, optical, battery
        load = 300 + random.randint(-50, 100)
        self.conn.mav.sys_status_send(
            sensors_present, sensors_present, sensors_present,
            load,
            int(self.voltage * 1000),
            int(self.current * 100),
            int(self.remaining),
            0, 0, 0, 0, 0, 0,
        )

    def _send_mission_current(self):
        """Send MISSION_CURRENT to report active waypoint."""
        if self.mission_items:
            self.conn.mav.mission_current_send(self.mission_current_seq)

    def _send_vibration(self):
        """Send VIBRATION message."""
        self.conn.mav.vibration_send(
            int(time.time() * 1e6) & 0xFFFFFFFFFFFFFFFF,
            self.vibe_x,
            self.vibe_y,
            self.vibe_z,
            0, 0, 0,  # clipping counts
        )

    def _send_battery2(self):
        """Send BATTERY_STATUS for richer battery info."""
        voltages = [int(self.voltage * 1000 / 4)] * 4 + [65535] * 6  # 4S battery
        self.conn.mav.battery_status_send(
            0,  # id
            0,  # battery_function
            0,  # type (unknown)
            int((20 + random.uniform(-2, 2)) * 100),  # temperature cdegC
            voltages,
            int(self.current * 100),
            int((100 - self.remaining) * 50),  # current_consumed mAh
            -1,  # energy_consumed
            int(self.remaining),
        )

    def _send_ekf_status(self):
        """Send EKF_STATUS_REPORT."""
        self.conn.mav.ekf_status_report_send(
            0x1FF,  # flags: all good
            0.1 + random.uniform(0, 0.05),  # velocity_variance
            0.05 + random.uniform(0, 0.03),  # pos_horiz_variance
            0.1 + random.uniform(0, 0.05),  # pos_vert_variance
            0.01 + random.uniform(0, 0.01),  # compass_variance
            0.02 + random.uniform(0, 0.01),  # terrain_alt_variance
        )

    def _send_home_position(self):
        """Send HOME_POSITION."""
        self.conn.mav.home_position_send(
            int(self.home_lat * 1e7),
            int(self.home_lon * 1e7),
            int(10.0 * 1000),  # altitude MSL mm
            0, 0, 0,  # local x, y, z
            [1, 0, 0, 0],  # quaternion
            0, 0, 0,  # approach x, y, z
        )


def main():
    parser = argparse.ArgumentParser(description="Mock MAVLink drone simulator")
    parser.add_argument("--count", type=int, default=3, help="Number of drones (default: 3)")
    parser.add_argument("--base-port", type=int, default=14550, help="Starting UDP port (default: 14550)")
    args = parser.parse_args()

    print(f"Starting {args.count} mock drones (ports {args.base_port}-{args.base_port + args.count - 1})")

    drones = []
    for i in range(args.count):
        # Spread drones in a circle around the base position
        angle = 2 * math.pi * i / args.count
        lat = BASE_LAT + SPREAD * math.cos(angle)
        lon = BASE_LON + SPREAD * math.sin(angle)
        port = args.base_port + i

        drone = MockDrone(i, port, lat, lon)
        drone.start()
        drones.append(drone)

    print(f"\nAll drones running. They will auto-arm and fly a figure-8 pattern.")
    print(f"Upload a mission and set AUTO mode to fly waypoints.\n")
    print(f"Connect with:")
    for d in drones:
        print(f"  udpin:0.0.0.0:{d.port}")
    print("\nPress Ctrl+C to stop.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping drones...")
        for d in drones:
            d.stop()
        print("Done.")


if __name__ == "__main__":
    main()
