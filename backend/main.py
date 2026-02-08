import asyncio
import json
import os
import shutil
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from registry import VehicleRegistry
from mission import Waypoint
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

class ConnectRequest(BaseModel):
    connection_string: str


class TakeoffRequest(BaseModel):
    alt: float = 10.0


class ModeRequest(BaseModel):
    mode: str


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


class CalibrationRequest(BaseModel):
    type: str  # gyro | accel | level | compass | pressure


class RouteWeatherRequest(BaseModel):
    waypoints: list[dict]  # [{lat, lon}]
    mission_start_time: Optional[str] = None  # ISO format


class PlatformSelectRequest(BaseModel):
    platform_id: str


class ActiveVehicleRequest(BaseModel):
    vehicle_id: str


# --- Globals ---

registry = VehicleRegistry()


# --- Helpers ---

def get_vehicle(vehicle_id: str = None):
    """Get specified vehicle or active vehicle. Raises HTTPException if not found."""
    v = registry.get_vehicle_or_active(vehicle_id)
    if v is None:
        if vehicle_id:
            raise HTTPException(status_code=404, detail=f"Vehicle '{vehicle_id}' not found")
        raise HTTPException(status_code=400, detail="No active vehicle")
    return v


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
    """Broadcast telemetry for all vehicles at ~10Hz with delta detection."""
    last_telemetry = {}  # {vehicle_id: {telemetry dict}}

    # Keys that change frequently and should always be checked
    volatile_keys = {'lat', 'lon', 'alt', 'alt_msl', 'roll', 'pitch', 'yaw', 'heading',
                     'groundspeed', 'airspeed', 'climb', 'voltage', 'current', 'heartbeat_age'}

    while True:
        if registry.has_any_connection() and ws_manager.active_connections:
            all_telem = registry.get_all_telemetry()

            # Check for changes in any vehicle
            has_changes = False

            # Detect vehicle added/removed
            if set(all_telem.keys()) != set(last_telemetry.keys()):
                has_changes = True

            if not has_changes:
                for vid, telem in all_telem.items():
                    last = last_telemetry.get(vid, {})
                    if (
                        telem.get('statustext') or
                        any(telem.get(k) != last.get(k) for k in volatile_keys) or
                        telem.get('armed') != last.get('armed') or
                        telem.get('mode') != last.get('mode') or
                        telem.get('mission_seq') != last.get('mission_seq') or
                        telem.get('mission_status') != last.get('mission_status')
                    ):
                        has_changes = True
                        break

            if has_changes:
                await ws_manager.broadcast({
                    "type": "telemetry_multi",
                    "active": registry.active_vehicle_id,
                    "vehicles": all_telem,
                })
                last_telemetry = {vid: dict(t) for vid, t in all_telem.items()}

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
    registry.disconnect_all()


# --- FastAPI App ---

app = FastAPI(title="Pyxus Drone Control", lifespan=lifespan)


# --- Connection & Vehicle Management ---

@app.get("/api/status")
async def api_status():
    v = registry.get_active_vehicle()
    if v:
        telem = v.get_telemetry()
        return {
            "status": "connected",
            "autopilot": telem.get("autopilot", "unknown"),
        }
    return {"status": "disconnected"}


@app.post("/api/connect")
async def api_connect(req: ConnectRequest):
    conn_id, result = registry.add_connection(req.connection_string)
    if conn_id:
        return {"status": "connected", "conn_id": conn_id, "vehicle_ids": result}
    return {"status": "failed", "error": result}


@app.post("/api/disconnect")
async def api_disconnect():
    registry.disconnect_all()
    return {"status": "disconnected"}


@app.post("/api/connections")
async def api_add_connection(req: ConnectRequest):
    conn_id, result = registry.add_connection(req.connection_string)
    if conn_id:
        return {"status": "ok", "conn_id": conn_id, "vehicle_ids": result}
    return {"status": "error", "error": result}


@app.delete("/api/connections/{conn_id}")
async def api_remove_connection(conn_id: str):
    success = registry.remove_connection(conn_id)
    if success:
        return {"status": "ok"}
    return {"status": "error", "error": "Connection not found"}


@app.get("/api/connections")
async def api_list_connections():
    return {"status": "ok", "connections": registry.list_connections()}


@app.get("/api/vehicles")
async def api_list_vehicles():
    return {
        "status": "ok",
        "vehicles": registry.list_vehicles(),
        "active": registry.active_vehicle_id,
    }


@app.post("/api/vehicles/active")
async def api_set_active_vehicle(req: ActiveVehicleRequest):
    success = registry.set_active_vehicle(req.vehicle_id)
    if success:
        return {"status": "ok", "active": req.vehicle_id}
    return {"status": "error", "error": f"Vehicle '{req.vehicle_id}' not found"}


# --- Command Endpoints (active vehicle + vehicle-scoped) ---

@app.post("/api/arm")
@app.post("/api/v/{vehicle_id}/arm")
async def api_arm(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.arm(v)
    return {"status": "ok", "command": "arm"}


@app.post("/api/disarm")
@app.post("/api/v/{vehicle_id}/disarm")
async def api_disarm(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.disarm(v)
    return {"status": "ok", "command": "disarm"}


@app.post("/api/takeoff")
@app.post("/api/v/{vehicle_id}/takeoff")
async def api_takeoff(req: TakeoffRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if v.is_ardupilot:
        v.connection.set_mode(v, "GUIDED")
        await asyncio.sleep(0.5)
    v.connection.takeoff(v, req.alt)
    return {"status": "ok", "command": "takeoff", "alt": req.alt}


@app.post("/api/land")
@app.post("/api/v/{vehicle_id}/land")
async def api_land(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.land(v)
    return {"status": "ok", "command": "land"}


@app.post("/api/rtl")
@app.post("/api/v/{vehicle_id}/rtl")
async def api_rtl(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.rtl(v)
    return {"status": "ok", "command": "rtl"}


@app.post("/api/mode")
@app.post("/api/v/{vehicle_id}/mode")
async def api_mode(req: ModeRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.set_mode(v, req.mode)
    return {"status": "ok", "command": "mode", "mode": req.mode}


@app.post("/api/goto")
@app.post("/api/v/{vehicle_id}/goto")
async def api_goto(req: GotoRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if v.is_ardupilot:
        v.connection.set_mode(v, "GUIDED")
        await asyncio.sleep(0.3)
    v.connection.goto(v, req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "goto", "lat": req.lat, "lon": req.lon, "alt": req.alt}


@app.post("/api/roi")
@app.post("/api/v/{vehicle_id}/roi")
async def api_roi(req: RoiRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.set_roi(v, req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "roi", "lat": req.lat, "lon": req.lon}


@app.post("/api/home/set")
@app.post("/api/v/{vehicle_id}/home/set")
async def api_set_home(req: SetHomeRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.set_home(v, req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "set_home", "lat": req.lat, "lon": req.lon, "alt": req.alt}


# --- Mission Endpoints ---

@app.post("/api/mission/upload")
@app.post("/api/v/{vehicle_id}/mission/upload")
async def api_mission_upload(req: MissionUploadRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    waypoints = [
        Waypoint(
            lat=w.lat, lon=w.lon, alt=w.alt,
            item_type=w.item_type, param1=w.param1,
            param2=w.param2, param3=w.param3, param4=w.param4,
        )
        for w in req.waypoints
    ]
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, v.mission_manager.upload, waypoints)
    if success:
        return {"status": "ok", "command": "mission_upload", "count": len(waypoints)}
    return {"status": "error", "error": "Mission upload failed"}


@app.post("/api/mission/start")
@app.post("/api/v/{vehicle_id}/mission/start")
async def api_mission_start(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    success = v.mission_manager.start()
    return {"status": "ok" if success else "error", "command": "mission_start"}


@app.post("/api/mission/pause")
@app.post("/api/v/{vehicle_id}/mission/pause")
async def api_mission_pause(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    success = v.mission_manager.pause()
    return {"status": "ok" if success else "error", "command": "mission_pause"}


@app.post("/api/mission/resume")
@app.post("/api/v/{vehicle_id}/mission/resume")
async def api_mission_resume(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    success = v.mission_manager.resume()
    return {"status": "ok" if success else "error", "command": "mission_resume"}


@app.post("/api/mission/clear")
@app.post("/api/v/{vehicle_id}/mission/clear")
async def api_mission_clear(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    success = v.mission_manager.clear()
    return {"status": "ok" if success else "error", "command": "mission_clear"}


@app.post("/api/mission/set_current")
@app.post("/api/v/{vehicle_id}/mission/set_current")
async def api_mission_set_current(req: MissionSetCurrentRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    seq = v.mission_manager.get_mission_seq_for_index(req.index)
    v.connection.send_mission_cmd(v, "set_current_mission", seq=seq)
    return {"status": "ok", "command": "mission_set_current", "seq": seq, "index": req.index}


@app.get("/api/mission/download")
@app.get("/api/v/{vehicle_id}/mission/download")
async def api_mission_download(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    loop = asyncio.get_event_loop()
    waypoints = await loop.run_in_executor(None, v.mission_manager.download)
    return {"status": "ok", "waypoints": waypoints}


# --- Geofence ---

@app.get("/api/fence/download")
@app.get("/api/v/{vehicle_id}/fence/download")
async def api_fence_download(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    loop = asyncio.get_event_loop()
    fence_items = await loop.run_in_executor(None, v.mission_manager.download_fence)
    return {"status": "ok", "fence_items": fence_items}


@app.post("/api/fence/upload_polygon")
@app.post("/api/v/{vehicle_id}/fence/upload_polygon")
async def api_fence_upload_polygon(req: PolygonFenceRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    if len(req.vertices) < 3:
        return {"status": "error", "error": "Need at least 3 vertices"}
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, v.mission_manager.upload_polygon_fence, req.vertices)
    if success:
        return {"status": "ok", "command": "polygon_fence_upload"}
    return {"status": "error", "error": "Polygon fence upload failed"}


@app.post("/api/fence/upload")
@app.post("/api/v/{vehicle_id}/fence/upload")
async def api_fence_upload(req: FenceUploadRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(
        None, v.mission_manager.upload_fence, req.lat, req.lon, req.radius
    )
    if success:
        return {"status": "ok", "command": "fence_upload"}
    return {"status": "error", "error": "Fence upload failed"}


@app.post("/api/fence/clear")
@app.post("/api/v/{vehicle_id}/fence/clear")
async def api_fence_clear(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    if not v.mission_manager:
        return {"status": "error", "error": "No mission manager"}
    success = v.mission_manager.clear_fence()
    return {"status": "ok" if success else "error", "command": "fence_clear"}


# --- Motor / Servo Test ---

@app.post("/api/motor/test")
@app.post("/api/v/{vehicle_id}/motor/test")
async def api_motor_test(req: MotorTestRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    telemetry = v.get_telemetry()
    if telemetry.get("armed", False):
        return {"status": "error", "error": "Vehicle must be disarmed for motor test"}

    v.connection.motor_test(
        v,
        motor=req.motor,
        throttle=req.throttle,
        duration=req.duration,
        all_motors=req.all_motors,
    )
    motor_desc = "all motors" if req.all_motors else f"motor {req.motor}"
    return {"status": "ok", "command": "motor_test", "motor": motor_desc, "throttle": req.throttle}


@app.post("/api/servo/test")
@app.post("/api/v/{vehicle_id}/servo/test")
async def api_servo_test(req: ServoTestRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.servo_set(v, servo=req.servo, pwm=req.pwm)
    return {"status": "ok", "command": "servo_test", "servo": req.servo, "pwm": req.pwm}


# --- Cameras & Gimbals ---

class GimbalControlRequest(BaseModel):
    pitch: float = 0.0
    yaw: float = 0.0
    pitch_rate: float = 0.0
    yaw_rate: float = 0.0


@app.get("/api/cameras")
@app.get("/api/v/{vehicle_id}/cameras")
async def api_cameras(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.request_camera_info(v)
    await asyncio.sleep(0.5)
    cameras = v.get_cameras()
    gimbals = v.get_gimbals()
    return {"status": "ok", "cameras": cameras, "gimbals": gimbals}


@app.post("/api/gimbal/control")
@app.post("/api/v/{vehicle_id}/gimbal/control")
async def api_gimbal_control(req: GimbalControlRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.set_gimbal_pitch_yaw(v, req.pitch, req.yaw, req.pitch_rate, req.yaw_rate)
    return {"status": "ok", "command": "gimbal_control", "pitch": req.pitch, "yaw": req.yaw}


# --- Parameters ---

@app.get("/api/params")
@app.get("/api/v/{vehicle_id}/params")
async def api_params(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    params, total = v.get_params()
    return {
        "status": "ok",
        "params": params,
        "total": total,
        "received": len(params),
    }


@app.post("/api/params/refresh")
@app.post("/api/v/{vehicle_id}/params/refresh")
async def api_params_refresh(vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.request_params(v)
    return {"status": "ok", "command": "param_request_list"}


@app.post("/api/params/set")
@app.post("/api/v/{vehicle_id}/params/set")
async def api_params_set(req: ParamSetRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.set_param(v, req.param_id, req.value)
    return {"status": "ok", "command": "param_set", "param_id": req.param_id, "value": req.value}


@app.get("/api/params/metadata/{vehicle}")
async def api_params_metadata(vehicle: str):
    """Proxy parameter metadata to avoid CORS issues. Supports ArduPilot and PX4."""
    import httpx

    # Map common vehicle names for ArduPilot
    ardupilot_map = {
        "arducopter": "ArduCopter",
        "arduplane": "ArduPlane",
        "rover": "Rover",
        "ardusub": "ArduSub",
        "antennatracker": "AntennaTracker",
    }

    vehicle_lower = vehicle.lower()

    # Check if this is a PX4 request
    if vehicle_lower == "px4":
        # PX4 parameter metadata from QGroundControl's cached metadata
        url = "https://raw.githubusercontent.com/mavlink/qgroundcontrol/master/src/FirmwarePlugin/PX4/PX4ParameterFactMetaData.xml"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    # Parse XML to JSON-like format
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
                            # Get min/max
                            min_val = param.findtext("min")
                            max_val = param.findtext("max")
                            if min_val or max_val:
                                info["Range"] = {"low": float(min_val) if min_val else None, "high": float(max_val) if max_val else None}
                            # Get unit
                            unit = param.findtext("unit")
                            if unit:
                                info["Units"] = unit
                            # Get values (enums)
                            values = {}
                            for val in param.findall("values/value"):
                                code = val.get("code")
                                if code:
                                    values[code] = val.text or ""
                            if values:
                                info["Values"] = values
                            # Get bitmask
                            bitmask = {}
                            for bit in param.findall("bitmask/bit"):
                                index = bit.get("index")
                                if index:
                                    bitmask[index] = bit.text or ""
                            if bitmask:
                                info["Bitmask"] = bitmask
                            # Reboot required
                            if param.get("reboot_required") == "true":
                                info["RebootRequired"] = True
                            metadata[name] = info
                    return {"status": "ok", "metadata": metadata}
                return {"status": "error", "error": f"Failed to fetch: {resp.status_code}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # ArduPilot metadata
    vehicle_name = ardupilot_map.get(vehicle_lower, vehicle)
    url = f"https://autotest.ardupilot.org/Parameters/{vehicle_name}/apm.pdef.json"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return {"status": "ok", "metadata": resp.json()}
            return {"status": "error", "error": f"Failed to fetch: {resp.status_code}"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


# --- MAVLink Inspector ---

@app.get("/api/mavlink/stats")
async def api_mavlink_stats():
    v = registry.get_active_vehicle()
    if not v:
        return {"status": "error", "error": "No active vehicle"}
    conn = v.connection
    stats = conn.get_message_stats()
    return {
        "status": "ok",
        "messages": stats,
        "target_system": v.target_system,
        "target_component": v.target_component,
    }


@app.post("/api/mavlink/stats/clear")
async def api_mavlink_stats_clear():
    v = registry.get_active_vehicle()
    if not v:
        return {"status": "error", "error": "No active vehicle"}
    v.connection.clear_message_stats()
    return {"status": "ok"}


@app.get("/api/mavlink/components")
async def api_mavlink_components():
    v = registry.get_active_vehicle()
    if not v:
        return {"status": "error", "error": "No active vehicle"}
    conn = v.connection
    components = conn.get_components()
    return {
        "status": "ok",
        "components": components,
        "target_system": v.target_system,
        "target_component": v.target_component,
    }


# --- Calibration ---

@app.post("/api/calibrate")
@app.post("/api/v/{vehicle_id}/calibrate")
async def api_calibrate(req: CalibrationRequest, vehicle_id: str = None):
    v = get_vehicle(vehicle_id)
    v.connection.calibrate(v, req.type)
    return {"status": "ok", "command": "calibrate", "type": req.type}


# --- Settings ---

@app.get("/api/settings")
async def api_settings_get():
    return {"status": "ok", "settings": load_settings()}


@app.put("/api/settings")
async def api_settings_put(req: dict):
    current = load_settings()
    # Deep merge top-level keys
    for key, val in req.items():
        if isinstance(val, dict) and isinstance(current.get(key), dict):
            current[key].update(val)
        else:
            current[key] = val
    save_settings(current)
    return {"status": "ok"}


# --- Weather ---

@app.get("/api/weather/point")
async def api_weather_point(lat: float = Query(...), lon: float = Query(...), forecast_time: Optional[str] = None):
    """Get weather data for a specific point"""
    try:
        time_obj = datetime.fromisoformat(forecast_time) if forecast_time else None
        weather = await weather_client.fetch_weather(lat, lon, time_obj)

        # Calculate impact
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

@app.get("/api/video/stream")
async def video_stream(url: str = Query(...)):
    if not url:
        return {"status": "error", "error": "No URL provided"}

    if not any(url.startswith(s) for s in ("rtsp://", "http://", "https://", "udp://")):
        return {"status": "error", "error": "Unsupported URL scheme"}

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
                    vid = msg.get("vehicle_id")
                    v = registry.get_vehicle_or_active(vid)
                    if v and v.connection.connected:
                        channels = msg.get("channels", [])
                        if channels:
                            v.connection.rc_override(v, channels)
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
