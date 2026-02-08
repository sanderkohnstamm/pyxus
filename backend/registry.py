import threading
from typing import Optional

from drone import DroneConnection
from vehicle import Vehicle
from mission import MissionManager


class VehicleRegistry:
    """Manages multiple connections and vehicles."""

    def __init__(self):
        self._connections: dict[str, DroneConnection] = {}  # conn_id -> DroneConnection
        self._vehicles: dict[str, Vehicle] = {}  # vehicle_id -> Vehicle
        self._active_vehicle_id: Optional[str] = None
        self._lock = threading.Lock()
        self._conn_counter = 0

    def add_connection(self, connection_string: str) -> tuple:
        """Connect to a new MAVLink endpoint. Returns (conn_id, [vehicle_ids]) or (None, error_str)."""
        conn = DroneConnection()
        conn.on_vehicle_discovered = self._on_vehicle_discovered

        success = conn.connect(connection_string)
        if not success:
            return None, "Connection failed"

        with self._lock:
            self._conn_counter += 1
            conn_id = f"conn{self._conn_counter}"
            self._connections[conn_id] = conn

            # Collect vehicles discovered during connect
            vehicle_ids = []
            for sysid, vehicle in conn.get_vehicles().items():
                vid = self._resolve_vehicle_id(vehicle, conn_id)
                vehicle.vehicle_id = vid
                vehicle.mission_manager = MissionManager(vehicle)
                self._vehicles[vid] = vehicle
                vehicle_ids.append(vid)

            # Set active to first vehicle if none set
            if self._active_vehicle_id is None and vehicle_ids:
                self._active_vehicle_id = vehicle_ids[0]

        return conn_id, vehicle_ids

    def remove_connection(self, conn_id: str) -> bool:
        """Disconnect and remove a connection and its vehicles."""
        with self._lock:
            conn = self._connections.pop(conn_id, None)
            if conn is None:
                return False

            # Remove all vehicles from this connection
            to_remove = [vid for vid, v in self._vehicles.items() if v.connection is conn]
            for vid in to_remove:
                del self._vehicles[vid]

            # Reset active if removed
            if self._active_vehicle_id in to_remove:
                remaining = list(self._vehicles.keys())
                self._active_vehicle_id = remaining[0] if remaining else None

        conn.disconnect()
        return True

    def _resolve_vehicle_id(self, vehicle: Vehicle, conn_id: str) -> str:
        """Generate a unique vehicle ID. Uses sysid if unique, otherwise conn+sysid."""
        sysid_str = str(vehicle.target_system)
        # Check if this sysid already exists from a different connection
        for vid, existing in self._vehicles.items():
            if existing.target_system == vehicle.target_system and existing.connection is not vehicle.connection:
                # Collision - need prefixed IDs
                # Rename existing vehicle if it has simple sysid format
                if vid == sysid_str:
                    old_conn_id = self._find_conn_id(existing.connection)
                    new_vid = f"{old_conn_id}s{sysid_str}"
                    existing.vehicle_id = new_vid
                    self._vehicles[new_vid] = existing
                    del self._vehicles[vid]
                    if self._active_vehicle_id == vid:
                        self._active_vehicle_id = new_vid
                return f"{conn_id}s{sysid_str}"
        return sysid_str

    def _find_conn_id(self, connection: DroneConnection) -> str:
        for cid, conn in self._connections.items():
            if conn is connection:
                return cid
        return "c?"

    def _on_vehicle_discovered(self, vehicle: Vehicle):
        """Callback from DroneConnection when a new vehicle appears on the link."""
        with self._lock:
            conn_id = self._find_conn_id(vehicle.connection)
            vid = self._resolve_vehicle_id(vehicle, conn_id)
            vehicle.vehicle_id = vid
            vehicle.mission_manager = MissionManager(vehicle)
            self._vehicles[vid] = vehicle

            if self._active_vehicle_id is None:
                self._active_vehicle_id = vid

        print(f"Registry: new vehicle {vid} discovered")

    # --- Accessors ---

    @property
    def active_vehicle_id(self) -> Optional[str]:
        with self._lock:
            return self._active_vehicle_id

    def set_active_vehicle(self, vehicle_id: str) -> bool:
        with self._lock:
            if vehicle_id in self._vehicles:
                self._active_vehicle_id = vehicle_id
                return True
            return False

    def get_vehicle(self, vehicle_id: str) -> Optional[Vehicle]:
        with self._lock:
            return self._vehicles.get(vehicle_id)

    def get_active_vehicle(self) -> Optional[Vehicle]:
        with self._lock:
            if self._active_vehicle_id:
                return self._vehicles.get(self._active_vehicle_id)
            return None

    def list_vehicles(self) -> list:
        with self._lock:
            result = []
            for vid, v in self._vehicles.items():
                telem = v.get_telemetry()
                result.append({
                    'vehicle_id': vid,
                    'target_system': v.target_system,
                    'platform_type': telem.get('platform_type', 'Unknown'),
                    'autopilot': telem.get('autopilot', 'unknown'),
                    'armed': telem.get('armed', False),
                    'mode': telem.get('mode', ''),
                    'color': v.color,
                    'active': vid == self._active_vehicle_id,
                })
            return result

    def list_connections(self) -> list:
        with self._lock:
            result = []
            for cid, conn in self._connections.items():
                vehicle_ids = [vid for vid, v in self._vehicles.items() if v.connection is conn]
                result.append({
                    'id': cid,
                    'connection_string': conn.connection_string,
                    'connected': conn.connected,
                    'vehicle_ids': vehicle_ids,
                })
            return result

    def get_all_telemetry(self) -> dict:
        """Return telemetry for all vehicles. {vehicle_id: {...telemetry, color, mission_status, statustext}}"""
        with self._lock:
            vehicles_snapshot = dict(self._vehicles)

        result = {}
        for vid, v in vehicles_snapshot.items():
            telem = v.get_telemetry()
            telem['color'] = v.color
            telem['vehicle_id'] = vid
            if v.mission_manager:
                telem['mission_status'] = v.mission_manager.status
            status_msgs = v.drain_statustext()
            if status_msgs:
                telem['statustext'] = status_msgs
            result[vid] = telem
        return result

    def has_any_connection(self) -> bool:
        with self._lock:
            return any(c.connected for c in self._connections.values())

    def disconnect_all(self):
        with self._lock:
            conn_ids = list(self._connections.keys())

        for cid in conn_ids:
            self.remove_connection(cid)

    # --- Command helpers (route to active or specified vehicle) ---

    def get_vehicle_or_active(self, vehicle_id: str = None) -> Optional[Vehicle]:
        """Get specified vehicle or the active vehicle."""
        with self._lock:
            vid = vehicle_id or self._active_vehicle_id
            if vid:
                return self._vehicles.get(vid)
            return None

    def get_connection_for_vehicle(self, vehicle: Vehicle) -> Optional[DroneConnection]:
        return vehicle.connection if vehicle else None
