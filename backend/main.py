import asyncio
import json
import os
import re
import shutil
import urllib.parse
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

# --- Terrain elevation cache ---
# Keyed by (round(lat, 4), round(lon, 4)) -> elevation in meters
_terrain_cache: dict[tuple[float, float], float] = {}

from drone import DroneConnection
from mission import MissionManager, Waypoint
from weather import (
    weather_client, route_analyzer, set_platform,
    PLATFORM_PROFILES, current_platform, MissionAnalyzer
)
from datetime import datetime


# --- Settings ---

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "settings.json")


def load_settings() -> dict:
    try:
        with open(SETTINGS_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_settings(data: dict):
    with open(SETTINGS_PATH, "w") as f:
        json.dump(data, f, indent=2)


# --- Models ---

class AddDroneRequest(BaseModel):
    connection_string: str
    name: str = ""


class TakeoffRequest(BaseModel):
    alt: float = 10.0


class ModeRequest(BaseModel):
    mode: str = ""
    standard_mode: Optional[int] = None


class WaypointModel(BaseModel):
    lat: float
    lon: float
    alt: float = 50.0
    item_type: str = "waypoint"
    param1: float = 0
    param2: float = 2
    param3: float = 0
    param4: float = 0


class MissionUploadRequest(BaseModel):
    waypoints: list[WaypointModel]


class FenceUploadRequest(BaseModel):
    lat: float
    lon: float
    radius: float = 200.0


class PolygonFenceRequest(BaseModel):
    vertices: list[dict]  # [{lat, lon}]


class MissionSetCurrentRequest(BaseModel):
    index: int  # 0-based waypoint index


class GotoRequest(BaseModel):
    lat: float
    lon: float
    alt: float = 50.0


class RoiRequest(BaseModel):
    lat: float
    lon: float
    alt: float = 0.0


class SetHomeRequest(BaseModel):
    lat: float
    lon: float
    alt: float = 0.0


class MotorTestRequest(BaseModel):
    motor: int = 1          # Motor instance (1-indexed)
    throttle: float = 5.0   # Throttle percent (0-100)
    duration: float = 2.0   # Seconds
    all_motors: bool = False


class ServoTestRequest(BaseModel):
    servo: int = 1    # Servo output number
    pwm: int = 1500   # PWM value


class ParamSetRequest(BaseModel):
    param_id: str
    value: float
    confirm: bool = False


class CalibrationRequest(BaseModel):
    type: str  # gyro | accel | level | compass | pressure


class RouteWeatherRequest(BaseModel):
    waypoints: list[dict]  # [{lat, lon}]
    mission_start_time: Optional[str] = None  # ISO format


class PlatformSelectRequest(BaseModel):
    platform_id: str


# --- Drone Registry ---

# drone_id -> {drone: DroneConnection, mission: MissionManager, name: str, connection_string: str}
drone_registry: dict[str, dict] = {}


def get_drone(drone_id: str) -> tuple:
    """Look up drone + mission manager by ID; raise 404 if not found."""
    entry = drone_registry.get(drone_id)
    if not entry:
        raise HTTPException(404, f"Drone '{drone_id}' not found")
    return entry["drone"], entry["mission"]


# --- WebSocket Manager ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        if not self.active_connections:
            return
        message = json.dumps(data)
        # Parallel broadcast to all clients
        async def send_to(ws):
            try:
                await ws.send_text(message)
                return None
            except:
                return ws
        results = await asyncio.gather(*[send_to(ws) for ws in self.active_connections])
        for ws in results:
            if ws is not None:
                self.disconnect(ws)


ws_manager = ConnectionManager()


# --- Telemetry broadcast task ---

async def telemetry_broadcast():
    """Broadcast telemetry for all drones with delta compression and adaptive rate.

    Optimizations over the previous fixed-10Hz full-dict approach:
    - Generation counter: skip drones whose telemetry hasn't changed (cheap int compare)
    - Delta compression: only send fields that actually changed since last broadcast
    - Full sync: send complete telemetry every 5s as a reliability fallback
    - Adaptive rate per drone:
        * Armed + moving (groundspeed > 0.5): 10 Hz
        * Armed + stationary: 5 Hz
        * Disarmed / idle: 1 Hz heartbeat
    """
    # Per-drone tracking state
    last_snapshot: dict[str, dict] = {}          # drone_id -> last sent telemetry dict
    last_generation: dict[str, int] = {}         # drone_id -> last seen generation counter
    last_mission_status: dict[str, str] = {}     # drone_id -> last sent mission status
    last_full_sync: dict[str, float] = {}        # drone_id -> monotonic time of last full send
    last_send_time: dict[str, float] = {}        # drone_id -> monotonic time of last broadcast

    FULL_SYNC_INTERVAL = 5.0  # seconds between full telemetry snapshots
    # Adaptive rate intervals (seconds between sends)
    RATE_ACTIVE = 0.1    # 10 Hz  – armed and moving
    RATE_ARMED  = 0.2    #  5 Hz  – armed but stationary
    RATE_IDLE   = 1.0    #  1 Hz  – disarmed / parked

    # Fields that are always included in every message (delta or full)
    ALWAYS_KEYS = {"type", "drone_id", "drone_name"}

    while True:
        now = asyncio.get_event_loop().time()

        if ws_manager.active_connections and drone_registry:
            for drone_id, entry in list(drone_registry.items()):
                drone = entry["drone"]
                mission_mgr = entry["mission"]
                if not drone.connected:
                    continue

                # --- Adaptive rate: decide if this drone is due for a send ---
                prev_snap = last_snapshot.get(drone_id, {})
                armed = prev_snap.get("armed", False)
                groundspeed = prev_snap.get("groundspeed", 0)

                if armed and groundspeed > 0.5:
                    min_interval = RATE_ACTIVE
                elif armed:
                    min_interval = RATE_ARMED
                else:
                    min_interval = RATE_IDLE

                elapsed = now - last_send_time.get(drone_id, 0)
                if elapsed < min_interval:
                    continue

                # --- Generation counter: cheap check if telemetry changed ---
                gen = drone.telemetry_generation
                status_msgs = drone.drain_statustext()
                mission_status = mission_mgr.status
                prev_mission = last_mission_status.get(drone_id)

                gen_changed = gen != last_generation.get(drone_id, -1)
                mission_changed = mission_status != prev_mission
                has_statustext = bool(status_msgs)
                force_full = (now - last_full_sync.get(drone_id, 0)) >= FULL_SYNC_INTERVAL

                if not (gen_changed or mission_changed or has_statustext or force_full):
                    continue

                # --- Build the message ---
                telemetry = drone.get_telemetry()

                if force_full or not prev_snap:
                    # Full snapshot: send everything
                    message = dict(telemetry)
                    message["_full"] = True
                    last_full_sync[drone_id] = now
                else:
                    # Delta: only include fields that changed
                    message = {}
                    for key, val in telemetry.items():
                        if key in ALWAYS_KEYS:
                            continue
                        if prev_snap.get(key) != val:
                            message[key] = val

                    if mission_changed:
                        message["mission_status"] = mission_status

                    # If nothing actually changed in values (generation bumped
                    # but rounding made values identical), skip unless statustext
                    if not message and not has_statustext:
                        last_generation[drone_id] = gen
                        continue

                # Attach envelope fields
                message["type"] = "telemetry"
                message["drone_id"] = drone_id
                message["drone_name"] = entry["name"]

                message["mission_status"] = mission_status

                if has_statustext:
                    message["statustext"] = status_msgs

                await ws_manager.broadcast(message)

                # Update tracking state
                last_snapshot[drone_id] = telemetry.copy()
                last_generation[drone_id] = gen
                last_mission_status[drone_id] = mission_status
                last_send_time[drone_id] = now

        # Sleep at the fastest possible rate (10 Hz).
        # Per-drone rate limiting above prevents over-sending for idle drones.
        await asyncio.sleep(0.1)


# --- App lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(telemetry_broadcast())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    # Disconnect all drones
    for entry in drone_registry.values():
        try:
            entry["drone"].disconnect()
        except Exception:
            pass
    drone_registry.clear()


# --- FastAPI App ---

app = FastAPI(title="Pyxus Drone Control", lifespan=lifespan)


# --- Drone CRUD Endpoints ---

@app.get("/api/drones")
async def api_drones_list():
    """List all connected drones with basic status."""
    result = []
    for drone_id, entry in drone_registry.items():
        drone = entry["drone"]
        tel = drone.get_telemetry() if drone.connected else {}
        result.append({
            "drone_id": drone_id,
            "name": entry["name"],
            "connection_string": entry["connection_string"],
            "connected": drone.connected,
            "armed": tel.get("armed", False),
            "mode": tel.get("mode", ""),
            "platform_type": tel.get("platform_type", "Unknown"),
            "autopilot": tel.get("autopilot", "unknown"),
        })
    return {"status": "ok", "drones": result}


@app.post("/api/drones")
async def api_drones_add(req: AddDroneRequest):
    """Connect a new drone and add it to the registry."""
    drone = DroneConnection()
    success = drone.connect(req.connection_string)
    if not success:
        return {"status": "error", "error": "Could not connect. Check connection string and ensure vehicle is running."}

    drone_id = uuid.uuid4().hex[:8]
    name = req.name or f"Drone-{drone_id[:4]}"
    mission_mgr = MissionManager(drone)

    drone_registry[drone_id] = {
        "drone": drone,
        "mission": mission_mgr,
        "name": name,
        "connection_string": req.connection_string,
    }

    tel = drone.get_telemetry()
    return {
        "status": "ok",
        "drone_id": drone_id,
        "name": name,
        "autopilot": tel.get("autopilot", "unknown"),
    }


@app.delete("/api/drones/{drone_id}")
async def api_drones_remove(drone_id: str):
    """Disconnect and remove a drone from the registry."""
    entry = drone_registry.pop(drone_id, None)
    if not entry:
        raise HTTPException(404, f"Drone '{drone_id}' not found")
    try:
        entry["drone"].disconnect()
    except Exception:
        pass
    return {"status": "ok", "drone_id": drone_id}


# --- REST Endpoints (all require drone_id) ---

@app.get("/api/status")
async def api_status(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if drone.connected:
        telemetry = drone.get_telemetry()
        return {
            "status": "connected",
            "autopilot": telemetry.get("autopilot", "unknown"),
        }
    return {"status": "disconnected"}


@app.post("/api/arm")
async def api_arm(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.arm()
    return {"status": "ok", "command": "arm"}


@app.post("/api/disarm")
async def api_disarm(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.disarm()
    return {"status": "ok", "command": "disarm"}


@app.post("/api/takeoff")
async def api_takeoff(req: TakeoffRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    if not drone.vehicle_profile.get("supports_takeoff", True):
        return {"status": "error", "error": "Vehicle type does not support takeoff"}
    if drone.is_ardupilot:
        drone.set_mode("GUIDED")
        await asyncio.sleep(0.5)
    drone.takeoff(req.alt)
    return {"status": "ok", "command": "takeoff", "alt": req.alt}


@app.post("/api/land")
async def api_land(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    profile = drone.vehicle_profile
    if profile.get("category") in ("ground", "surface"):
        # Ground/surface vehicles: issue HOLD mode instead of land command
        drone.set_mode("HOLD")
        return {"status": "ok", "command": "hold"}
    drone.land()
    return {"status": "ok", "command": "land"}


@app.post("/api/rtl")
async def api_rtl(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.rtl()
    return {"status": "ok", "command": "rtl"}


@app.post("/api/mode")
async def api_mode(req: ModeRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    if req.standard_mode is not None:
        drone.set_standard_mode(req.standard_mode)
        return {"status": "ok", "command": "mode", "standard_mode": req.standard_mode}
    drone.set_mode(req.mode)
    return {"status": "ok", "command": "mode", "mode": req.mode}


@app.get("/api/modes")
async def api_modes(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    modes = drone.get_available_modes()
    static_modes = drone.get_static_modes()
    with drone._available_modes_lock:
        total = drone._available_modes_count
    return {
        "status": "ok",
        "modes": modes,
        "static_modes": static_modes,
        "total_modes": total,
        "supports_standard_modes": len(modes) > 0,
    }


@app.post("/api/goto")
async def api_goto(req: GotoRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    if drone.is_ardupilot:
        drone.set_mode("GUIDED")
        await asyncio.sleep(0.3)
    drone.goto(req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "goto", "lat": req.lat, "lon": req.lon, "alt": req.alt}


@app.post("/api/roi")
async def api_roi(req: RoiRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_roi(req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "roi", "lat": req.lat, "lon": req.lon}


@app.post("/api/home/set")
async def api_set_home(req: SetHomeRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_home(req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "set_home", "lat": req.lat, "lon": req.lon, "alt": req.alt}


@app.post("/api/mission/upload")
async def api_mission_upload(req: MissionUploadRequest, drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    waypoints = [
        Waypoint(
            lat=w.lat, lon=w.lon, alt=w.alt,
            item_type=w.item_type, param1=w.param1,
            param2=w.param2, param3=w.param3, param4=w.param4,
        )
        for w in req.waypoints
    ]
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, mission_mgr.upload, waypoints)
    if success:
        return {"status": "ok", "command": "mission_upload", "count": len(waypoints)}
    return {"status": "error", "error": "Mission upload failed"}


@app.post("/api/mission/start")
async def api_mission_start(drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.start()
    return {"status": "ok" if success else "error", "command": "mission_start"}


@app.post("/api/mission/pause")
async def api_mission_pause(drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.pause()
    return {"status": "ok" if success else "error", "command": "mission_pause"}


@app.post("/api/mission/resume")
async def api_mission_resume(drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.resume()
    return {"status": "ok" if success else "error", "command": "mission_resume"}


@app.post("/api/mission/clear")
async def api_mission_clear(drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.clear()
    return {"status": "ok" if success else "error", "command": "mission_clear"}


@app.post("/api/mission/set_current")
async def api_mission_set_current(req: MissionSetCurrentRequest, drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    seq = mission_mgr.get_mission_seq_for_index(req.index)
    drone.send_mission_cmd("set_current_mission", seq=seq)
    return {"status": "ok", "command": "mission_set_current", "seq": seq, "index": req.index}


# --- Mission Download ---

@app.get("/api/mission/download")
async def api_mission_download(drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    loop = asyncio.get_event_loop()
    waypoints = await loop.run_in_executor(None, mission_mgr.download)
    return {"status": "ok", "waypoints": waypoints}


# --- Geofence ---

@app.get("/api/fence/download")
async def api_fence_download(drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    loop = asyncio.get_event_loop()
    fence_items = await loop.run_in_executor(None, mission_mgr.download_fence)
    return {"status": "ok", "fence_items": fence_items}


@app.post("/api/fence/upload_polygon")
async def api_fence_upload_polygon(req: PolygonFenceRequest, drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    if len(req.vertices) < 3:
        return {"status": "error", "error": "Need at least 3 vertices"}
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, mission_mgr.upload_polygon_fence, req.vertices)
    if success:
        return {"status": "ok", "command": "polygon_fence_upload"}
    return {"status": "error", "error": "Polygon fence upload failed"}


@app.post("/api/fence/upload")
async def api_fence_upload(req: FenceUploadRequest, drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(
        None, mission_mgr.upload_fence, req.lat, req.lon, req.radius
    )
    if success:
        return {"status": "ok", "command": "fence_upload"}
    return {"status": "error", "error": "Fence upload failed"}


@app.post("/api/fence/clear")
async def api_fence_clear(drone_id: str = Query(...)):
    drone, mission_mgr = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.clear_fence()
    return {"status": "ok" if success else "error", "command": "fence_clear"}


# --- Motor / Servo Test ---

@app.post("/api/motor/test")
async def api_motor_test(req: MotorTestRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}

    telemetry = drone.get_telemetry()
    if telemetry.get("armed", False):
        return {"status": "error", "error": "Vehicle must be disarmed for motor test"}

    drone.motor_test(
        motor=req.motor,
        throttle=req.throttle,
        duration=req.duration,
        all_motors=req.all_motors,
    )
    motor_desc = "all motors" if req.all_motors else f"motor {req.motor}"
    return {"status": "ok", "command": "motor_test", "motor": motor_desc, "throttle": req.throttle}


@app.post("/api/servo/test")
async def api_servo_test(req: ServoTestRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.servo_set(servo=req.servo, pwm=req.pwm)
    return {"status": "ok", "command": "servo_test", "servo": req.servo, "pwm": req.pwm}


# --- Cameras & Gimbals ---

class GimbalControlRequest(BaseModel):
    pitch: float = 0.0
    yaw: float = 0.0
    pitch_rate: float = 0.0
    yaw_rate: float = 0.0


@app.get("/api/cameras")
async def api_cameras(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.request_camera_info()
    await asyncio.sleep(0.5)
    cameras = drone.get_cameras()
    gimbals = drone.get_gimbals()
    return {"status": "ok", "cameras": cameras, "gimbals": gimbals}


@app.post("/api/gimbal/control")
async def api_gimbal_control(req: GimbalControlRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_gimbal_pitch_yaw(req.pitch, req.yaw, req.pitch_rate, req.yaw_rate)
    return {"status": "ok", "command": "gimbal_control", "pitch": req.pitch, "yaw": req.yaw}


# --- Parameters ---

@app.get("/api/params")
async def api_params(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    params, total = drone.get_params()
    return {
        "status": "ok",
        "params": params,
        "total": total,
        "received": len(params),
    }


@app.post("/api/params/refresh")
async def api_params_refresh(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.request_params()
    return {"status": "ok", "command": "param_request_list"}


# Safety-critical parameter prefixes that require confirmation
CRITICAL_PARAM_PREFIXES = {
    "BATT_": "battery",
    "FS_": "failsafe",
    "ARMING_": "arming checks",
    "MOT_": "motors",
    "INS_": "inertial sensors",
}


@app.post("/api/params/set")
async def api_params_set(req: ParamSetRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}

    # Check if this is a safety-critical parameter
    param_upper = req.param_id.upper()
    for prefix, category in CRITICAL_PARAM_PREFIXES.items():
        if param_upper.startswith(prefix):
            if not req.confirm:
                return {
                    "status": "confirm_required",
                    "warning": f"'{req.param_id}' is a safety-critical {category} parameter. Incorrect values may cause loss of vehicle. Please confirm.",
                    "param_id": req.param_id,
                    "value": req.value,
                }
            break

    ok = drone.set_param(req.param_id, req.value)
    if not ok:
        return {"status": "error", "error": f"Invalid value for '{req.param_id}': value must be numeric"}
    return {"status": "ok", "command": "param_set", "param_id": req.param_id, "value": req.value}


@app.get("/api/params/metadata/{vehicle}")
async def api_params_metadata(vehicle: str):
    """Proxy parameter metadata to avoid CORS issues. Supports ArduPilot and PX4."""
    import httpx

    ardupilot_map = {
        "arducopter": "ArduCopter",
        "arduplane": "ArduPlane",
        "rover": "Rover",
        "ardusub": "ArduSub",
        "antennatracker": "AntennaTracker",
    }

    vehicle_lower = vehicle.lower()

    if vehicle_lower == "px4":
        url = "https://raw.githubusercontent.com/mavlink/qgroundcontrol/master/src/FirmwarePlugin/PX4/PX4ParameterFactMetaData.xml"
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    import xml.etree.ElementTree as ET
                    root = ET.fromstring(resp.text)
                    metadata = {}
                    for param in root.findall(".//parameter"):
                        name = param.get("name")
                        if name:
                            info = {
                                "Description": param.findtext("short_desc") or param.findtext("long_desc") or "",
                                "DisplayName": param.get("name"),
                            }
                            min_val = param.findtext("min")
                            max_val = param.findtext("max")
                            if min_val or max_val:
                                info["Range"] = {"low": float(min_val) if min_val else None, "high": float(max_val) if max_val else None}
                            unit = param.findtext("unit")
                            if unit:
                                info["Units"] = unit
                            values = {}
                            for val in param.findall("values/value"):
                                code = val.get("code")
                                if code:
                                    values[code] = val.text or ""
                            if values:
                                info["Values"] = values
                            bitmask = {}
                            for bit in param.findall("bitmask/bit"):
                                index = bit.get("index")
                                if index:
                                    bitmask[index] = bit.text or ""
                            if bitmask:
                                info["Bitmask"] = bitmask
                            if param.get("reboot_required") == "true":
                                info["RebootRequired"] = True
                            metadata[name] = info
                    return {"status": "ok", "metadata": metadata}
                return {"status": "error", "error": f"Failed to fetch: {resp.status_code}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    vehicle_name = ardupilot_map.get(vehicle_lower, vehicle)
    url = f"https://autotest.ardupilot.org/Parameters/{vehicle_name}/apm.pdef.json"

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                raw = resp.json()
                # ArduPilot pdef.json is grouped by prefix: {"GRP_": {"GRP_PARAM": {...}}}
                # Flatten into a single dict keyed by full parameter name
                metadata = {}
                for group_params in raw.values():
                    if isinstance(group_params, dict):
                        for param_name, param_info in group_params.items():
                            if isinstance(param_info, dict):
                                metadata[param_name] = param_info
                return {"status": "ok", "metadata": metadata}
            return {"status": "error", "error": f"Failed to fetch: {resp.status_code}"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# --- MAVLink Inspector ---

@app.get("/api/mavlink/stats")
async def api_mavlink_stats(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    stats = drone.get_message_stats()
    return {
        "status": "ok",
        "messages": stats,
        "target_system": drone.target_system,
        "target_component": drone.target_component,
    }


@app.post("/api/mavlink/stats/clear")
async def api_mavlink_stats_clear(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.clear_message_stats()
    return {"status": "ok"}


@app.get("/api/mavlink/components")
async def api_mavlink_components(drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    components = drone.get_components()
    return {
        "status": "ok",
        "components": components,
        "target_system": drone.target_system,
        "target_component": drone.target_component,
    }


# --- Settings ---

@app.get("/api/settings")
async def api_settings_get():
    return {"status": "ok", "settings": load_settings()}


@app.put("/api/settings")
async def api_settings_put(req: dict):
    current = load_settings()
    for key, val in req.items():
        if isinstance(val, dict) and isinstance(current.get(key), dict):
            current[key].update(val)
        else:
            current[key] = val
    save_settings(current)
    return {"status": "ok"}


# --- Calibration ---

@app.post("/api/calibrate")
async def api_calibrate(req: CalibrationRequest, drone_id: str = Query(...)):
    drone, _ = get_drone(drone_id)
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.calibrate(req.type)
    return {"status": "ok", "command": "calibrate", "type": req.type}


# --- Terrain Elevation Proxy ---

@app.get("/api/terrain/elevation")
async def api_terrain_elevation(locations: str = Query(...)):
    """Proxy terrain elevation lookups with in-memory caching.

    Query format: locations=lat1,lon1|lat2,lon2|...
    Returns: { elevations: [{ lat, lon, elevation }] }
    Caches results keyed by coordinates rounded to 4 decimal places (~11m).
    Limit: 100 points per request.
    """
    import httpx

    # Parse locations
    pairs = locations.strip().split("|")
    if len(pairs) > 100:
        pairs = pairs[:100]

    parsed = []
    for pair in pairs:
        parts = pair.strip().split(",")
        if len(parts) != 2:
            continue
        try:
            lat = float(parts[0])
            lon = float(parts[1])
            parsed.append((lat, lon))
        except ValueError:
            continue

    if not parsed:
        return {"elevations": []}

    # Check cache, collect misses
    results = {}  # index -> elevation
    cache_misses = []  # (index, lat, lon)

    for i, (lat, lon) in enumerate(parsed):
        cache_key = (round(lat, 4), round(lon, 4))
        if cache_key in _terrain_cache:
            results[i] = _terrain_cache[cache_key]
        else:
            cache_misses.append((i, lat, lon))

    # Fetch uncached points from Open-Elevation API
    if cache_misses:
        # Build location string for the API
        batch_size = 100
        for batch_start in range(0, len(cache_misses), batch_size):
            batch = cache_misses[batch_start:batch_start + batch_size]
            loc_str = "|".join(f"{lat},{lon}" for _, lat, lon in batch)
            api_url = f"https://api.open-elevation.com/api/v1/lookup?locations={loc_str}"

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.get(api_url)
                    if resp.status_code == 200:
                        data = resp.json()
                        api_results = data.get("results", [])
                        for j, entry in enumerate(api_results):
                            if j < len(batch):
                                idx, lat, lon = batch[j]
                                elev = entry.get("elevation")
                                if elev is not None:
                                    results[idx] = float(elev)
                                    # Cache it
                                    cache_key = (round(lat, 4), round(lon, 4))
                                    _terrain_cache[cache_key] = float(elev)
                                else:
                                    results[idx] = None
                    else:
                        # API error -- fill with None
                        for idx, _, _ in batch:
                            results.setdefault(idx, None)
            except Exception:
                # Network/timeout error -- fill with None
                for idx, _, _ in batch:
                    results.setdefault(idx, None)

    # Build response preserving input order
    elevations = []
    for i, (lat, lon) in enumerate(parsed):
        elevations.append({
            "lat": lat,
            "lon": lon,
            "elevation": results.get(i),
        })

    return {"elevations": elevations}


# --- Weather ---

@app.get("/api/weather/point")
async def api_weather_point(lat: float = Query(...), lon: float = Query(...), forecast_time: Optional[str] = None):
    """Get weather data for a specific point"""
    try:
        time_obj = datetime.fromisoformat(forecast_time) if forecast_time else None
        weather = await weather_client.fetch_weather(lat, lon, time_obj)

        analyzer = MissionAnalyzer(current_platform)
        impact = analyzer.calculate_impact(weather)

        return {
            "status": "ok",
            "weather": {
                "lat": weather.lat,
                "lon": weather.lon,
                "time": weather.time.isoformat(),
                "temperature": weather.temperature,
                "wind_speed": weather.wind_speed,
                "wind_direction": weather.wind_direction,
                "wind_gusts": weather.wind_gusts,
                "precipitation": weather.precipitation,
                "visibility": weather.visibility,
                "cloud_cover": weather.cloud_cover,
                "cloud_ceiling": weather.cloud_ceiling,
                "pressure": weather.pressure,
                "humidity": weather.humidity,
            },
            "impact": {
                "risk_level": impact.risk_level,
                "risk_score": impact.risk_score,
                "stability_margin": impact.stability_margin,
                "energy_penalty": impact.energy_penalty,
                "isr_degradation": impact.isr_degradation,
                "link_margin_db": impact.link_margin_db,
                "violations": impact.violations,
                "warnings": impact.warnings,
            }
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/api/weather/route")
async def api_weather_route(req: RouteWeatherRequest):
    """Get weather analysis for entire route"""
    try:
        start_time = datetime.fromisoformat(req.mission_start_time) if req.mission_start_time else None
        route_weather = await route_analyzer.analyze_route(req.waypoints, start_time)

        return {
            "status": "ok",
            "route_analysis": {
                "route_risk_level": route_weather.route_risk_level,
                "route_risk_score": route_weather.route_risk_score,
                "total_energy_penalty": route_weather.total_energy_penalty,
                "critical_segments": route_weather.critical_segments,
                "waypoint_weather": [
                    {
                        "waypoint_index": i,
                        "risk_level": impact.risk_level,
                        "risk_score": impact.risk_score,
                        "stability_margin": impact.stability_margin,
                        "energy_penalty": impact.energy_penalty,
                        "isr_degradation": impact.isr_degradation,
                        "link_margin_db": impact.link_margin_db,
                        "violations": impact.violations,
                        "warnings": impact.warnings,
                        "weather": {
                            "temperature": impact.weather.temperature,
                            "wind_speed": impact.weather.wind_speed,
                            "wind_direction": impact.weather.wind_direction,
                            "precipitation": impact.weather.precipitation,
                            "cloud_cover": impact.weather.cloud_cover,
                            "visibility": impact.weather.visibility,
                        }
                    }
                    for i, impact in enumerate(route_weather.waypoint_weather)
                ]
            }
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/api/weather/platforms")
async def api_weather_platforms():
    """Get available platform profiles"""
    return {
        "status": "ok",
        "platforms": {
            pid: {
                "name": p.name,
                "type": p.platform_type,
                "max_wind_speed": p.max_wind_speed,
                "temp_range": [p.temp_min, p.temp_max],
                "max_precipitation": p.max_precipitation,
            }
            for pid, p in PLATFORM_PROFILES.items()
        },
        "current_platform": next(
            (pid for pid, p in PLATFORM_PROFILES.items() if p == current_platform),
            "multirotor_medium"
        )
    }


@app.post("/api/weather/platform")
async def api_weather_platform_set(req: PlatformSelectRequest):
    """Set active platform profile"""
    try:
        set_platform(req.platform_id)
        return {
            "status": "ok",
            "platform": req.platform_id,
            "name": current_platform.name
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


# --- Video stream proxy ---

_SHELL_METACHAR_RE = re.compile(r'[;|&`$(){}]')
_ALLOWED_SCHEMES = {"rtsp", "http", "https", "udp"}
_MAX_URL_LENGTH = 2048


@app.get("/api/video/stream")
async def video_stream(url: str = Query(...)):
    if not url:
        return {"status": "error", "error": "No URL provided"}

    if len(url) > _MAX_URL_LENGTH:
        return {"status": "error", "error": f"URL exceeds maximum length of {_MAX_URL_LENGTH} characters"}

    if _SHELL_METACHAR_RE.search(url):
        return {"status": "error", "error": "URL contains disallowed characters"}

    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        return {"status": "error", "error": "Unsupported URL scheme"}
    if not parsed.hostname:
        return {"status": "error", "error": "URL must contain a valid hostname"}

    if not shutil.which("ffmpeg"):
        return {"status": "error", "error": "ffmpeg not installed on server"}

    args = ["ffmpeg", "-y"]
    if url.startswith("rtsp://"):
        args += ["-rtsp_transport", "tcp"]
    args += [
        "-i", url,
        "-f", "mpjpeg",
        "-q:v", "5",
        "-r", "15",
        "-an",
        "-boundary_tag", "frame",
        "pipe:1",
    ]

    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )

    async def generate():
        try:
            while True:
                chunk = await process.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                process.kill()
                await process.wait()
            except Exception:
                pass

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# --- WebSocket ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "rc_override":
                    drone_id = msg.get("drone_id")
                    if drone_id and drone_id in drone_registry:
                        drone = drone_registry[drone_id]["drone"]
                        if drone.connected:
                            raw_channels = msg.get("channels", [])
                            if raw_channels and isinstance(raw_channels, list):
                                # Validate and sanitize channel values
                                validated = []
                                for val in raw_channels[:8]:  # Truncate to max 8
                                    try:
                                        v = int(val)
                                    except (TypeError, ValueError):
                                        v = 0  # Non-numeric -> release
                                    # 0 = release, otherwise clamp to 1000-2000
                                    if v != 0:
                                        v = max(1000, min(2000, v))
                                    validated.append(v)
                                # Pad to 8 channels with 0 (release)
                                while len(validated) < 8:
                                    validated.append(0)
                                drone.rc_override(validated)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# --- Static files (production) ---

frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
