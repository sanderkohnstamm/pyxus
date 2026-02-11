#!/usr/bin/env python3
"""
Mock MAVLink drone simulator for multi-drone testing.

Spawns N simulated drones, each on its own UDP port, sending telemetry
at ~10 Hz and responding to basic commands + mission protocol.

Usage:
    python mock_drone.py --count 3 --base-port 14550
"""

import argparse
import math
import struct
import threading
import time
from collections import defaultdict

from pymavlink import mavutil
from pymavlink.dialects.v20 import common as mavlink2


# Base positions for drones (spread around a point)
BASE_LAT = 51.9225  # ~Utrecht, Netherlands
BASE_LON = 4.4792
SPREAD = 0.005  # ~500 m between drones


class MockDrone:
    """Simulates a single MAVLink drone."""

    def __init__(self, drone_id, port, base_lat, base_lon):
        self.drone_id = drone_id
        self.port = port
        self.sysid = drone_id + 1  # MAVLink system IDs start at 1
        self.compid = 1

        # Position state
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.lat = base_lat
        self.lon = base_lon
        self.alt = 0.0  # relative alt in meters
        self.alt_msl = 10.0
        self.heading = 0.0
        self.groundspeed = 0.0
        self.airspeed = 0.0
        self.climb = 0.0

        # Attitude
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0

        # State
        self.armed = False
        self.mode = "STABILIZE"
        self.flying = False
        self.target_alt = 10.0

        # Circular flight parameters
        self.orbit_radius = 0.0005  # ~50 m
        self.orbit_speed = 0.3  # radians/sec
        self.orbit_angle = (drone_id * 2 * math.pi / 5)  # offset per drone
        self.orbit_active = False

        # Mission storage
        self.mission_items = []
        self.mission_count_expected = 0
        self.mission_current = 0

        # Parameters (minimal set)
        self.params = {
            "SYSID_THISMAV": float(self.sysid),
            "ARMING_CHECK": 1.0,
            "BATT_MONITOR": 4.0,
            "BATT_CAPACITY": 5000.0,
            "WP_RADIUS": 2.0,
            "RTL_ALT": 3000.0,
            "FLTMODE1": 0.0,
            "FLTMODE2": 2.0,
            "FLTMODE3": 5.0,
        }

        # Battery simulation
        self.voltage = 16.8
        self.current = 5.0
        self.remaining = 100

        # Connection
        self.conn = None
        self.running = False
        self.thread = None

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
        recv_thread = threading.Thread(target=self._recv_loop, daemon=True)
        recv_thread.start()

        while self.running:
            now = time.time()
            dt = now - last_send if last_send else 0.1

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
                last_send = now

            time.sleep(0.02)  # 50 Hz internal loop

    def _recv_loop(self):
        """Receive and handle incoming MAVLink messages."""
        while self.running:
            try:
                msg = self.conn.recv_match(blocking=True, timeout=0.5)
                if msg is None:
                    continue
                self._handle_message(msg)
            except Exception:
                pass

    def _update_sim(self, dt):
        """Update simulated drone state."""
        # Battery drain
        if self.armed:
            drain = 0.002 if self.flying else 0.0005
            self.remaining = max(0, self.remaining - drain)
            self.voltage = 12.0 + (self.remaining / 100.0) * 4.8
            self.current = 15.0 if self.flying else 2.0

        # Takeoff / land
        if self.flying:
            if self.alt < self.target_alt:
                self.alt = min(self.alt + 2.0 * dt, self.target_alt)
                self.climb = 2.0
            elif self.alt > self.target_alt + 0.5:
                self.alt = max(self.alt - 2.0 * dt, self.target_alt)
                self.climb = -2.0
            else:
                self.climb = 0.0

            # Circular orbit when at altitude
            if self.alt >= self.target_alt - 0.5:
                self.orbit_active = True

            if self.orbit_active:
                self.orbit_angle += self.orbit_speed * dt
                self.lat = self.base_lat + self.orbit_radius * math.cos(self.orbit_angle)
                self.lon = self.base_lon + self.orbit_radius * math.sin(self.orbit_angle)
                self.heading = math.degrees(self.orbit_angle + math.pi / 2) % 360
                self.yaw = math.radians(self.heading)
                self.groundspeed = self.orbit_speed * self.orbit_radius * 111000  # rough m/s
                self.airspeed = self.groundspeed + 1.0
                self.roll = math.radians(15)  # slight bank
                self.pitch = math.radians(-2)
        else:
            # On ground
            if self.alt > 0.1:
                self.alt = max(0, self.alt - 3.0 * dt)
                self.climb = -3.0
            else:
                self.alt = 0
                self.climb = 0
                self.orbit_active = False
                self.groundspeed = 0
                self.airspeed = 0
                self.roll = 0
                self.pitch = 0

        self.alt_msl = 10.0 + self.alt

    def _handle_message(self, msg):
        """Handle incoming MAVLink messages."""
        mtype = msg.get_type()

        if mtype == "COMMAND_LONG":
            self._handle_command(msg)
        elif mtype == "SET_MODE":
            modes = {0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
                     5: "LOITER", 6: "RTL", 9: "LAND"}
            self.mode = modes.get(msg.custom_mode, f"MODE_{msg.custom_mode}")
            print(f"  Drone {self.drone_id}: Mode -> {self.mode}")
        elif mtype == "MISSION_COUNT":
            self._handle_mission_count(msg)
        elif mtype == "MISSION_ITEM_INT":
            self._handle_mission_item(msg)
        elif mtype == "MISSION_ITEM":
            self._handle_mission_item(msg)
        elif mtype == "PARAM_REQUEST_LIST":
            self._send_all_params()
        elif mtype == "PARAM_SET":
            self._handle_param_set(msg)
        elif mtype == "RC_CHANNELS_OVERRIDE":
            pass  # Silently accept RC override

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
            print(f"  Drone {self.drone_id}: Landing")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_RETURN_TO_LAUNCH (20)
        elif cmd == 20:
            self.target_alt = 15
            self.mode = "RTL"
            print(f"  Drone {self.drone_id}: RTL")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_MODE (176)
        elif cmd == 176:
            modes = {0: "STABILIZE", 2: "ALT_HOLD", 3: "AUTO", 4: "GUIDED",
                     5: "LOITER", 6: "RTL", 9: "LAND"}
            self.mode = modes.get(int(msg.param2), f"MODE_{int(msg.param2)}")
            print(f"  Drone {self.drone_id}: Mode -> {self.mode}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_NAV_WAYPOINT (goto)
        elif cmd == 16:
            if msg.param5 != 0 and msg.param6 != 0:
                self.base_lat = msg.param5
                self.base_lon = msg.param6
                if msg.param7 > 0:
                    self.target_alt = msg.param7
                print(f"  Drone {self.drone_id}: Goto {msg.param5:.6f}, {msg.param6:.6f}")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_ROI (201)
        elif cmd == 201:
            print(f"  Drone {self.drone_id}: ROI set")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_DO_SET_HOME (179)
        elif cmd == 179:
            print(f"  Drone {self.drone_id}: Home set")
            self._send_command_ack(cmd, 0)

        # MAV_CMD_MISSION_START (300)
        elif cmd == 300:
            self.mode = "AUTO"
            print(f"  Drone {self.drone_id}: Mission start")
            self._send_command_ack(cmd, 0)

        else:
            # ACK everything else
            self._send_command_ack(cmd, 0)

    def _handle_mission_count(self, msg):
        """Start mission upload protocol."""
        self.mission_count_expected = msg.count
        self.mission_items = [None] * msg.count
        print(f"  Drone {self.drone_id}: Mission upload started, expecting {msg.count} items")
        # Request first item
        self.conn.mav.mission_request_int_send(
            msg.get_srcSystem(), msg.get_srcComponent(), 0,
            mission_type=0
        )

    def _handle_mission_item(self, msg):
        """Handle incoming mission item."""
        seq = msg.seq
        if seq < len(self.mission_items):
            self.mission_items[seq] = msg
            next_seq = seq + 1
            if next_seq < self.mission_count_expected:
                # Request next item
                self.conn.mav.mission_request_int_send(
                    msg.get_srcSystem(), msg.get_srcComponent(), next_seq,
                    mission_type=0
                )
            else:
                # All items received
                self.conn.mav.mission_ack_send(
                    msg.get_srcSystem(), msg.get_srcComponent(), 0,
                    mission_type=0
                )
                print(f"  Drone {self.drone_id}: Mission upload complete ({len(self.mission_items)} items)")

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

    def _send_command_ack(self, command, result):
        self.conn.mav.command_ack_send(command, result)

    def _send_heartbeat(self):
        state = 4 if self.armed else 3  # MAV_STATE_ACTIVE / STANDBY
        mode_flags = 1 | 16 | 64 | 128  # CUSTOM | STABILIZE | MANUAL | SAFETY_ARMED
        if self.armed:
            mode_flags |= 128

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
        self.conn.mav.global_position_int_send(
            int(time.time() * 1000) & 0xFFFFFFFF,
            int(self.lat * 1e7),
            int(self.lon * 1e7),
            int(self.alt_msl * 1000),
            int(self.alt * 1000),
            0, 0,
            int(self.climb * 100),
            int(self.heading * 100),
        )

    def _send_attitude(self):
        self.conn.mav.attitude_send(
            int(time.time() * 1000) & 0xFFFFFFFF,
            self.roll,
            self.pitch,
            self.yaw,
            0, 0, 0,
        )

    def _send_gps_raw(self):
        self.conn.mav.gps_raw_int_send(
            int(time.time() * 1e6) & 0xFFFFFFFFFFFFFFFF,
            3,  # GPS_FIX_TYPE_3D_FIX
            int(self.lat * 1e7),
            int(self.lon * 1e7),
            int(self.alt_msl * 1000),
            120,  # hdop * 100
            80,   # vdop * 100
            int(self.groundspeed * 100),
            int(self.heading * 100),
            12,  # satellites
        )

    def _send_vfr_hud(self):
        self.conn.mav.vfr_hud_send(
            self.airspeed,
            self.groundspeed,
            int(self.heading),
            50,  # throttle
            self.alt_msl,
            self.climb,
        )

    def _send_sys_status(self):
        self.conn.mav.sys_status_send(
            0xFFFF, 0xFFFF, 0xFFFF,
            500,  # load
            int(self.voltage * 1000),
            int(self.current * 100),
            int(self.remaining),
            0, 0, 0, 0, 0, 0,
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

    print(f"\nAll drones running. Connect with:")
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
