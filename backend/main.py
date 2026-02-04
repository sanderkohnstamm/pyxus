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


class GotoRequest(BaseModel):
    lat: float
    lon: float
    alt: float = 50.0


class RoiRequest(BaseModel):
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
    drone.motor_test(
        motor=req.motor,
        throttle=req.throttle,
        duration=req.duration,
        all_motors=req.all_motors,
    )
    return {"status": "ok", "command": "motor_test", "motor": req.motor, "throttle": req.throttle}


@app.post("/api/servo/test")
async def api_servo_test(req: ServoTestRequest):
    if not drone.connected:
        return {"status": "error", "error": "Not connected"}
    drone.servo_set(servo=req.servo, pwm=req.pwm)
    return {"status": "ok", "command": "servo_test", "servo": req.servo, "pwm": req.pwm}


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
