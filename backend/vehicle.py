import threading
import queue
import time

from drone import TelemetryState, MAV_TYPES


VEHICLE_COLORS = ['#06b6d4', '#f97316', '#8b5cf6', '#10b981', '#ec4899', '#eab308']
_color_index = 0


def next_vehicle_color():
    global _color_index
    color = VEHICLE_COLORS[_color_index % len(VEHICLE_COLORS)]
    _color_index += 1
    return color


class Vehicle:
    """Per-vehicle state, one instance per discovered autopilot sysid."""

    def __init__(self, vehicle_id: str, connection, target_system: int,
                 target_component: int, is_ardupilot: bool, mav_type: int,
                 color: str = None):
        self.vehicle_id = vehicle_id
        self.connection = connection  # parent DroneConnection
        self.target_system = target_system
        self.target_component = target_component
        self.is_ardupilot = is_ardupilot
        self.mav_type = mav_type

        self.telemetry = TelemetryState()
        self.telemetry.autopilot = "ardupilot" if is_ardupilot else "px4"
        self.telemetry.platform_type = MAV_TYPES.get(mav_type, f"Type {mav_type}")

        self.lock = threading.Lock()

        # Parameters
        self.params: dict = {}
        self.params_total: int = 0
        self.params_lock = threading.Lock()

        # Mission protocol messages routed here
        self.mission_msg_queue: queue.Queue = queue.Queue()

        # Status text
        self.statustext_queue: list = []
        self.statustext_lock = threading.Lock()

        # Cameras / gimbals
        self.cameras: dict = {}
        self.gimbals: dict = {}
        self.camera_lock = threading.Lock()

        # Color for map display
        self.color = color or next_vehicle_color()

        # Mission manager set after creation
        self.mission_manager = None

    def get_telemetry(self) -> dict:
        with self.lock:
            return self.telemetry.to_dict()

    def drain_mission_queue(self):
        while not self.mission_msg_queue.empty():
            try:
                self.mission_msg_queue.get_nowait()
            except queue.Empty:
                break

    def recv_mission_msg(self, timeout: float = 5.0):
        try:
            return self.mission_msg_queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def get_params(self) -> tuple:
        with self.params_lock:
            return dict(self.params), self.params_total

    def get_cameras(self) -> list:
        with self.camera_lock:
            return list(self.cameras.values())

    def get_gimbals(self) -> list:
        with self.camera_lock:
            return list(self.gimbals.values())

    def drain_statustext(self) -> list:
        with self.statustext_lock:
            msgs = list(self.statustext_queue)
            self.statustext_queue.clear()
            return msgs
