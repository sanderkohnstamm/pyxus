import threading
import time
from dataclasses import dataclass
from typing import Optional

from pymavlink import mavutil


@dataclass
class Waypoint:
    lat: float
    lon: float
    alt: float  # relative altitude in meters
    seq: int = 0
    item_type: str = "waypoint"  # waypoint, takeoff, loiter_unlim, loiter_turns, loiter_time, roi, land
    param1: float = 0   # hold time (wp), turns (loiter_turns), time in sec (loiter_time)
    param2: float = 2   # acceptance radius
    param3: float = 0   # loiter radius (positive = CW, negative = CCW)
    param4: float = 0   # yaw angle


# Map item_type to MAVLink command
ITEM_TYPE_COMMANDS = {
    "waypoint": mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,
    "takeoff": mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
    "loiter_unlim": mavutil.mavlink.MAV_CMD_NAV_LOITER_UNLIM,
    "loiter_turns": mavutil.mavlink.MAV_CMD_NAV_LOITER_TURNS,
    "loiter_time": mavutil.mavlink.MAV_CMD_NAV_LOITER_TIME,
    "roi": mavutil.mavlink.MAV_CMD_DO_SET_ROI,
    "land": mavutil.mavlink.MAV_CMD_NAV_LAND,
    "do_jump": mavutil.mavlink.MAV_CMD_DO_JUMP,           # 177: param1=target seq, param2=repeat count
    "do_set_servo": mavutil.mavlink.MAV_CMD_DO_SET_SERVO, # 183: param1=servo #, param2=PWM
}

# Reverse map: MAVLink command number -> item_type string
COMMAND_ITEM_TYPES = {v: k for k, v in ITEM_TYPE_COMMANDS.items()}


class MissionManager:
    def __init__(self, drone):
        self._drone = drone
        self._status = "idle"
        self._lock = threading.Lock()

    @property
    def status(self) -> str:
        with self._lock:
            return self._status

    def _set_status(self, status: str):
        with self._lock:
            self._status = status

    def _send_mission_item(self, seq: int, waypoints: list[Waypoint]):
        """Send a single mission item for the given sequence number."""
        if seq == 0:
            # Home position - always first waypoint location at ground level
            self._drone.send_mission_cmd(
                "mission_item_int",
                seq=0,
                frame=mavutil.mavlink.MAV_FRAME_GLOBAL_INT,
                command=mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,
                current=0,
                autocontinue=1,
                x=int(waypoints[0].lat * 1e7),
                y=int(waypoints[0].lon * 1e7),
                z=0,
            )
        else:
            # User mission items start at seq 1
            wp = waypoints[seq - 1]
            command = ITEM_TYPE_COMMANDS.get(
                wp.item_type,
                mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,
            )
            self._drone.send_mission_cmd(
                "mission_item_int",
                seq=seq,
                frame=mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                command=command,
                current=0,
                autocontinue=1,
                param1=wp.param1,
                param2=wp.param2,
                param3=wp.param3,
                param4=wp.param4,
                x=int(wp.lat * 1e7),
                y=int(wp.lon * 1e7),
                z=wp.alt,
            )

    def upload(self, waypoints: list[Waypoint]) -> bool:
        """Upload mission waypoints using MAVLink mission protocol."""
        if not self._drone.connected or not waypoints:
            return False

        self._set_status("uploading")
        self._drone.drain_mission_queue()

        try:
            # Total count = home (seq 0) + user items
            total_count = len(waypoints) + 1

            # Send MISSION_COUNT
            self._drone.send_mission_cmd(
                "mission_count", count=total_count
            )

            # Event-driven loop: process messages until ACK or timeout
            deadline = time.time() + 30  # 30s total timeout
            while time.time() < deadline:
                msg = self._drone.recv_mission_msg(timeout=5.0)
                if msg is None:
                    self._set_status("upload_failed")
                    return False

                msg_type = msg.get_type()

                if msg_type == "MISSION_ACK":
                    if msg.type == mavutil.mavlink.MAV_MISSION_ACCEPTED:
                        self._set_status("uploaded")
                        return True
                    else:
                        print(f"Mission ACK error: type={msg.type}")
                        self._set_status("upload_failed")
                        return False

                if msg_type in ("MISSION_REQUEST_INT", "MISSION_REQUEST"):
                    seq = msg.seq
                    if seq < total_count:
                        self._send_mission_item(seq, waypoints)
                    else:
                        print(f"Mission request for invalid seq {seq}")
                        self._set_status("upload_failed")
                        return False

            self._set_status("upload_failed")
            return False

        except Exception as e:
            print(f"Mission upload error: {e}")
            self._set_status("upload_failed")
            return False

    def start(self) -> bool:
        """Start the uploaded mission."""
        if not self._drone.connected:
            return False

        try:
            # Set mission to first waypoint
            self._drone.send_mission_cmd("set_current_mission", seq=1)
            time.sleep(0.2)

            # Switch to auto mode
            if self._drone.is_ardupilot:
                self._drone.set_mode("AUTO")
            else:
                self._drone.set_mode("MISSION")

            self._set_status("running")
            return True
        except Exception as e:
            print(f"Mission start error: {e}")
            return False

    def pause(self) -> bool:
        """Pause the current mission (switch to loiter/hold)."""
        if not self._drone.connected:
            return False

        try:
            if self._drone.is_ardupilot:
                self._drone.set_mode("LOITER")
            else:
                self._drone.set_mode("HOLD")

            self._set_status("paused")
            return True
        except Exception as e:
            print(f"Mission pause error: {e}")
            return False

    def clear(self) -> bool:
        """Clear all mission items from the vehicle."""
        if not self._drone.connected:
            return False

        try:
            self._drone.send_mission_cmd("mission_clear")
            self._set_status("idle")
            return True
        except Exception as e:
            print(f"Mission clear error: {e}")
            return False

    def upload_fence(self, lat: float, lon: float, radius: float) -> bool:
        """Upload a circular inclusion geofence."""
        if not self._drone.connected:
            return False

        self._drone.drain_mission_queue()
        fence_type = mavutil.mavlink.MAV_MISSION_TYPE_FENCE

        try:
            self._drone.send_mission_cmd(
                "mission_count", count=1, mission_type=fence_type
            )

            # Event-driven loop for fence upload
            deadline = time.time() + 15
            item_sent = False
            while time.time() < deadline:
                msg = self._drone.recv_mission_msg(timeout=5.0)
                if msg is None:
                    return False

                msg_type = msg.get_type()

                if msg_type == "MISSION_ACK":
                    if msg.type == mavutil.mavlink.MAV_MISSION_ACCEPTED:
                        self._drone.send_mission_cmd("fence_enable", enable=1)
                        return True
                    return False

                if msg_type in ("MISSION_REQUEST_INT", "MISSION_REQUEST"):
                    self._drone.send_mission_cmd(
                        "mission_item_int",
                        seq=0,
                        frame=mavutil.mavlink.MAV_FRAME_GLOBAL,
                        command=5003,  # MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION
                        current=0,
                        autocontinue=0,
                        param1=radius,
                        x=int(lat * 1e7),
                        y=int(lon * 1e7),
                        z=0,
                        mission_type=fence_type,
                    )

            return False

        except Exception as e:
            print(f"Fence upload error: {e}")
            return False

    def download(self) -> list[dict]:
        """Download mission items from vehicle. Returns list of waypoint dicts."""
        if not self._drone.connected:
            return []

        self._drone.drain_mission_queue()

        try:
            # Request mission list
            self._drone.send_mission_cmd("mission_request_list")

            # Wait for MISSION_COUNT
            msg = self._drone.recv_mission_msg(timeout=5.0)
            if msg is None or msg.get_type() != "MISSION_COUNT":
                return []

            count = msg.count
            if count <= 1:
                # Only home position or empty
                return []

            items = []
            # Request items 1..count-1 (skip seq 0 = home)
            for seq in range(1, count):
                self._drone.send_mission_cmd("mission_request_int", seq=seq)

                deadline = time.time() + 5.0
                while time.time() < deadline:
                    item_msg = self._drone.recv_mission_msg(timeout=3.0)
                    if item_msg is None:
                        # Send ACK with error and bail
                        return []
                    if item_msg.get_type() == "MISSION_ITEM_INT" and item_msg.seq == seq:
                        item_type = COMMAND_ITEM_TYPES.get(item_msg.command, "waypoint")
                        items.append({
                            "lat": item_msg.x / 1e7,
                            "lon": item_msg.y / 1e7,
                            "alt": item_msg.z,
                            "item_type": item_type,
                            "param1": item_msg.param1,
                            "param2": item_msg.param2,
                            "param3": item_msg.param3,
                            "param4": item_msg.param4,
                        })
                        break

            # Send ACK
            self._drone.send_mission_cmd("mission_ack")
            return items

        except Exception as e:
            print(f"Mission download error: {e}")
            return []

    def download_fence(self) -> list[dict]:
        """Download fence items from vehicle."""
        if not self._drone.connected:
            return []

        fence_type = mavutil.mavlink.MAV_MISSION_TYPE_FENCE
        self._drone.drain_mission_queue()

        try:
            self._drone.send_mission_cmd("mission_request_list", mission_type=fence_type)

            msg = self._drone.recv_mission_msg(timeout=5.0)
            if msg is None or msg.get_type() != "MISSION_COUNT":
                return []

            count = msg.count
            if count == 0:
                return []

            items = []
            for seq in range(count):
                self._drone.send_mission_cmd("mission_request_int", seq=seq, mission_type=fence_type)

                deadline = time.time() + 5.0
                while time.time() < deadline:
                    item_msg = self._drone.recv_mission_msg(timeout=3.0)
                    if item_msg is None:
                        return []
                    if item_msg.get_type() == "MISSION_ITEM_INT" and item_msg.seq == seq:
                        items.append({
                            "command": item_msg.command,
                            "lat": item_msg.x / 1e7,
                            "lon": item_msg.y / 1e7,
                            "alt": item_msg.z,
                            "param1": item_msg.param1,
                            "param2": item_msg.param2,
                            "param3": item_msg.param3,
                            "param4": item_msg.param4,
                        })
                        break

            self._drone.send_mission_cmd("mission_ack", mission_type=fence_type)
            return items

        except Exception as e:
            print(f"Fence download error: {e}")
            return []

    def upload_polygon_fence(self, vertices: list[dict]) -> bool:
        """Upload polygon inclusion fence using MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION."""
        if not self._drone.connected or len(vertices) < 3:
            return False

        fence_type = mavutil.mavlink.MAV_MISSION_TYPE_FENCE
        self._drone.drain_mission_queue()

        try:
            count = len(vertices)
            self._drone.send_mission_cmd("mission_count", count=count, mission_type=fence_type)

            deadline = time.time() + 30
            while time.time() < deadline:
                msg = self._drone.recv_mission_msg(timeout=5.0)
                if msg is None:
                    return False

                msg_type = msg.get_type()

                if msg_type == "MISSION_ACK":
                    if msg.type == mavutil.mavlink.MAV_MISSION_ACCEPTED:
                        self._drone.send_mission_cmd("fence_enable", enable=1)
                        return True
                    return False

                if msg_type in ("MISSION_REQUEST_INT", "MISSION_REQUEST"):
                    seq = msg.seq
                    if seq < count:
                        v = vertices[seq]
                        self._drone.send_mission_cmd(
                            "mission_item_int",
                            seq=seq,
                            frame=mavutil.mavlink.MAV_FRAME_GLOBAL,
                            command=5001,  # MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION
                            current=0,
                            autocontinue=0,
                            param1=count,  # vertex count
                            x=int(v["lat"] * 1e7),
                            y=int(v["lon"] * 1e7),
                            z=0,
                            mission_type=fence_type,
                        )

            return False

        except Exception as e:
            print(f"Polygon fence upload error: {e}")
            return False

    def clear_fence(self) -> bool:
        """Clear geofence from the vehicle."""
        if not self._drone.connected:
            return False

        try:
            self._drone.send_mission_cmd("fence_enable", enable=0)
            time.sleep(0.1)
            self._drone.send_mission_cmd(
                "mission_clear",
                mission_type=mavutil.mavlink.MAV_MISSION_TYPE_FENCE,
            )
            return True
        except Exception as e:
            print(f"Fence clear error: {e}")
            return False
