# MAVLink Camera Protocol v2

Reference: https://mavlink.io/en/services/camera.html

## Overview

The Camera Protocol v2 enables camera discovery, configuration, photo/video capture, streaming, zoom/focus, storage management, and tracking. Cameras send heartbeats with `MAV_TYPE_CAMERA` and use component IDs `MAV_COMP_ID_CAMERA` through `MAV_COMP_ID_CAMERA6`.

## Camera Discovery Flow

1. Detect camera heartbeat (or autopilot heartbeat for attached cameras)
2. Send `MAV_CMD_REQUEST_MESSAGE(param1=259)` to get `CAMERA_INFORMATION`
3. Read capability flags from `CAMERA_INFORMATION.flags`
4. Request additional info based on capabilities (streams, storage, settings)

## Key Messages

| ID  | Message                        | Purpose                                      |
|-----|--------------------------------|----------------------------------------------|
| 259 | CAMERA_INFORMATION             | Capabilities, firmware, definition URI        |
| 260 | CAMERA_SETTINGS                | Current camera mode                           |
| 261 | STORAGE_INFORMATION            | Capacity, type, read/write speeds             |
| 262 | CAMERA_CAPTURE_STATUS          | Active capture type, interval, image count    |
| 263 | CAMERA_IMAGE_CAPTURED          | Broadcast per captured image (geo-tag index)  |
| 269 | VIDEO_STREAM_INFORMATION       | Stream config: transport, encoding, res, fps  |
| 270 | VIDEO_STREAM_STATUS            | Updated stream status/config                  |

## Key Commands

| Command                              | Purpose                         |
|--------------------------------------|---------------------------------|
| MAV_CMD_SET_CAMERA_MODE              | Switch image/video/survey mode  |
| MAV_CMD_IMAGE_START_CAPTURE (2000)   | Start photo sequence            |
| MAV_CMD_IMAGE_STOP_CAPTURE (2001)    | Stop photo sequence             |
| MAV_CMD_VIDEO_START_CAPTURE (2500)   | Start recording                 |
| MAV_CMD_VIDEO_STOP_CAPTURE (2501)    | Stop recording                  |
| MAV_CMD_VIDEO_START_STREAMING (2502) | Start pushing video stream      |
| MAV_CMD_VIDEO_STOP_STREAMING (2503)  | Stop pushing video stream       |
| MAV_CMD_SET_CAMERA_ZOOM (531)        | Zoom control                    |
| MAV_CMD_SET_CAMERA_FOCUS (532)       | Focus control                   |
| MAV_CMD_CAMERA_TRACK_POINT (2004)    | Track point in image            |
| MAV_CMD_CAMERA_TRACK_RECTANGLE (2005)| Track rectangle region          |
| MAV_CMD_CAMERA_STOP_TRACKING (2010)  | Stop active tracking            |

## Capability Flags (CAMERA_CAP_FLAGS)

- `CAPTURE_IMAGE` — Still image capture supported
- `CAPTURE_VIDEO` — Video recording supported
- `HAS_MODES` — Requires mode selection before capture
- `HAS_VIDEO_STREAM` — Video streaming available
- `HAS_TRACKING_POINT` — Point tracking supported
- `HAS_TRACKING_RECTANGLE` — Rectangle tracking supported

## Camera Modes (CAMERA_MODE)

- `CAMERA_MODE_IMAGE` — Still image capture
- `CAMERA_MODE_VIDEO` — Video recording
- `CAMERA_MODE_SURVEY` — Survey/mapping

## Video Streaming

1. Check `CAMERA_CAP_FLAGS_HAS_VIDEO_STREAM` in camera info
2. Request `VIDEO_STREAM_INFORMATION` (msg 269) for all streams
3. Get RTSP URI from `VIDEO_STREAM_INFORMATION.uri`
4. Send `MAV_CMD_VIDEO_START_STREAMING(stream_id)` to activate
5. Connect to RTSP URI with AVPlayer

Stream types: RTSP (connection-based, GCS connects), MPEG-TS (push-based).

## Image Capture Workflow

1. Verify idle via `CAMERA_CAPTURE_STATUS`
2. Send `MAV_CMD_IMAGE_START_CAPTURE(interval, count)` — count=0 for single shot
3. Camera broadcasts `CAMERA_IMAGE_CAPTURED` per image
4. Track via `image_index` field; detect gaps by comparing counts

## Storage Management

- Request `STORAGE_INFORMATION` for capacity/type
- Format via `MAV_CMD_STORAGE_FORMAT(storage_id)`

## Pyxus Implementation Plan

### Phase 1: Video Stream Discovery (Priority)
- On camera heartbeat detection, request `CAMERA_INFORMATION`
- If `HAS_VIDEO_STREAM`, request `VIDEO_STREAM_INFORMATION`
- Auto-connect to RTSP stream URI in VideoPlayerManager
- Display stream metadata (resolution, fps) in HUD

### Phase 2: Capture Controls
- Add photo capture button (single shot + timelapse interval)
- Add video record start/stop toggle
- Show capture status (recording indicator, image count)
- Camera mode switching (image/video)

### Phase 3: Camera Settings
- Zoom/focus controls (slider or pinch gesture)
- Storage info display (capacity, free space)
- Format storage option in tools

### Phase 4: Advanced Features
- Object tracking (tap-to-track on video feed)
- Thermal range overlay (if thermal camera)
- Camera definition file parsing for custom settings UI

### Already Implemented in MAVLink Layer
All camera command enums and message structs are defined in:
- `MAVLinkEnums.swift` — Command IDs (521-534, 2000-2505)
- `MAVLinkMessages.swift` — Message structs (259-270, capture/status/info)
- `MAVLinkCRCExtras.swift` — CRC bytes for all camera messages

What's needed: CameraService (route messages, manage state), DroneManager methods, UI controls.
