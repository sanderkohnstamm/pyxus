import asyncio
import json
import os
import shutil
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

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
    seq: int


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


# --- Globals ---

drone = DroneConnection()
mission_mgr = MissionManager(drone)


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
        message = json.dumps(data)
        disconnected = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)


ws_manager = ConnectionManager()


# --- Telemetry broadcast task ---

async def telemetry_broadcast():
    """Broadcast telemetry to all connected WebSocket clients at ~10Hz."""
    while True:
        if drone.connected and ws_manager.active_connections:
            telemetry = drone.get_telemetry()
            telemetry["type"] = "telemetry"
            telemetry["mission_status"] = mission_mgr.status
            # Include pending STATUSTEXT messages
            status_msgs = drone.drain_statustext()
            if status_msgs:
                telemetry["statustext"] = status_msgs
            await ws_manager.broadcast(telemetry)
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
    drone.disconnect()


# --- FastAPI App ---

app = FastAPI(title="Pyxus Drone Control", lifespan=lifespan)


# --- REST Endpoints ---

@app.get("/api/status")
async def api_status():
    if drone.connected:
        telemetry = drone.get_telemetry()
        return {
            "status": "connected",
            "autopilot": telemetry.get("autopilot", "unknown"),
        }
    return {"status": "disconnected"}


@app.post("/api/connect")
async def api_connect(req: ConnectRequest):
    success = drone.connect(req.connection_string)
    if success:
        return {"status": "connected", "autopilot": drone.get_telemetry()["autopilot"]}
    return {"status": "failed", "error": "Could not connect. Check connection string and ensure vehicle is running."}


@app.post("/api/disconnect")
async def api_disconnect():
    drone.disconnect()
    return {"status": "disconnected"}


@app.post("/api/arm")
async def api_arm():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.arm()
    return {"status": "ok", "command": "arm"}


@app.post("/api/disarm")
async def api_disarm():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.disarm()
    return {"status": "ok", "command": "disarm"}


@app.post("/api/takeoff")
async def api_takeoff(req: TakeoffRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    # Set GUIDED mode for ArduPilot before takeoff
    if drone.is_ardupilot:
        drone.set_mode("GUIDED")
        await asyncio.sleep(0.5)
    drone.takeoff(req.alt)
    return {"status": "ok", "command": "takeoff", "alt": req.alt}


@app.post("/api/land")
async def api_land():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.land()
    return {"status": "ok", "command": "land"}


@app.post("/api/rtl")
async def api_rtl():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.rtl()
    return {"status": "ok", "command": "rtl"}


@app.post("/api/mode")
async def api_mode(req: ModeRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_mode(req.mode)
    return {"status": "ok", "command": "mode", "mode": req.mode}


@app.post("/api/goto")
async def api_goto(req: GotoRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    if drone.is_ardupilot:
        drone.set_mode("GUIDED")
        await asyncio.sleep(0.3)
    drone.goto(req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "goto", "lat": req.lat, "lon": req.lon, "alt": req.alt}


@app.post("/api/roi")
async def api_roi(req: RoiRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_roi(req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "roi", "lat": req.lat, "lon": req.lon}


@app.post("/api/home/set")
async def api_set_home(req: SetHomeRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_home(req.lat, req.lon, req.alt)
    return {"status": "ok", "command": "set_home", "lat": req.lat, "lon": req.lon, "alt": req.alt}


@app.post("/api/mission/upload")
async def api_mission_upload(req: MissionUploadRequest):
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
    # Run upload in thread to avoid blocking
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, mission_mgr.upload, waypoints)
    if success:
        return {"status": "ok", "command": "mission_upload", "count": len(waypoints)}
    return {"status": "error", "error": "Mission upload failed"}


@app.post("/api/mission/start")
async def api_mission_start():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.start()
    return {"status": "ok" if success else "error", "command": "mission_start"}


@app.post("/api/mission/pause")
async def api_mission_pause():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.pause()
    return {"status": "ok" if success else "error", "command": "mission_pause"}


@app.post("/api/mission/clear")
async def api_mission_clear():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.clear()
    return {"status": "ok" if success else "error", "command": "mission_clear"}


@app.post("/api/mission/set_current")
async def api_mission_set_current(req: MissionSetCurrentRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.send_mission_cmd("set_current_mission", seq=req.seq)
    return {"status": "ok", "command": "mission_set_current", "seq": req.seq}


# --- Mission Download ---

@app.get("/api/mission/download")
async def api_mission_download():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    loop = asyncio.get_event_loop()
    waypoints = await loop.run_in_executor(None, mission_mgr.download)
    return {"status": "ok", "waypoints": waypoints}


# --- Geofence ---

@app.get("/api/fence/download")
async def api_fence_download():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    loop = asyncio.get_event_loop()
    fence_items = await loop.run_in_executor(None, mission_mgr.download_fence)
    return {"status": "ok", "fence_items": fence_items}


@app.post("/api/fence/upload_polygon")
async def api_fence_upload_polygon(req: PolygonFenceRequest):
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
async def api_fence_upload(req: FenceUploadRequest):
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
async def api_fence_clear():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    success = mission_mgr.clear_fence()
    return {"status": "ok" if success else "error", "command": "fence_clear"}


# --- Motor / Servo Test ---

@app.post("/api/motor/test")
async def api_motor_test(req: MotorTestRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}

    # Check if vehicle is armed - motor test requires disarmed state
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
async def api_servo_test(req: ServoTestRequest):
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
async def api_cameras():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    # Request camera info first
    drone.request_camera_info()
    await asyncio.sleep(0.5)  # Brief wait for responses
    cameras = drone.get_cameras()
    gimbals = drone.get_gimbals()
    return {"status": "ok", "cameras": cameras, "gimbals": gimbals}


@app.post("/api/gimbal/control")
async def api_gimbal_control(req: GimbalControlRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_gimbal_pitch_yaw(req.pitch, req.yaw, req.pitch_rate, req.yaw_rate)
    return {"status": "ok", "command": "gimbal_control", "pitch": req.pitch, "yaw": req.yaw}


# --- Parameters ---

@app.get("/api/params")
async def api_params():
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
async def api_params_refresh():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.request_params()
    return {"status": "ok", "command": "param_request_list"}


@app.post("/api/params/set")
async def api_params_set(req: ParamSetRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.set_param(req.param_id, req.value)
    return {"status": "ok", "command": "param_set", "param_id": req.param_id, "value": req.value}


# --- MAVLink Inspector ---

@app.get("/api/mavlink/stats")
async def api_mavlink_stats():
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
async def api_mavlink_stats_clear():
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.clear_message_stats()
    return {"status": "ok"}


@app.get("/api/mavlink/components")
async def api_mavlink_components():
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
    # Deep merge top-level keys
    for key, val in req.items():
        if isinstance(val, dict) and isinstance(current.get(key), dict):
            current[key].update(val)
        else:
            current[key] = val
    save_settings(current)
    return {"status": "ok"}


# --- Calibration ---

@app.post("/api/calibrate")
async def api_calibrate(req: CalibrationRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.calibrate(req.type)
    return {"status": "ok", "command": "calibrate", "type": req.type}


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
                if msg.get("type") == "rc_override" and drone.connected:
                    channels = msg.get("channels", [])
                    if channels:
                        drone.rc_override(channels)
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
