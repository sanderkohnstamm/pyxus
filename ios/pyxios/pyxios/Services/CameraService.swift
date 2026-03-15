//
//  CameraService.swift
//  pyxios
//
//  MAVLink Camera Protocol v2 service: discovery, stream info, capture control.
//

import Foundation

/// Camera capability flags from CAMERA_INFORMATION.flags
struct CameraCapabilities: OptionSet, Sendable {
    let rawValue: UInt32
    static let captureImage       = CameraCapabilities(rawValue: 1 << 0)
    static let captureVideo       = CameraCapabilities(rawValue: 1 << 1)
    static let hasModes           = CameraCapabilities(rawValue: 1 << 2)
    static let hasVideoStream     = CameraCapabilities(rawValue: 1 << 4)
    static let hasTrackingPoint   = CameraCapabilities(rawValue: 1 << 5)
    static let hasTrackingRect    = CameraCapabilities(rawValue: 1 << 6)
}

/// Discovered camera info
struct CameraInfo: Sendable {
    var vendor: String = ""
    var model: String = ""
    var capabilities: CameraCapabilities = []
    var resolutionH: UInt16 = 0
    var resolutionV: UInt16 = 0
    var definitionURI: String = ""
}

/// Video stream info from VIDEO_STREAM_INFORMATION
struct VideoStreamInfo: Identifiable, Sendable {
    let id: UInt8
    var name: String = ""
    var uri: String = ""
    var framerate: Float = 0
    var resolutionH: UInt16 = 0
    var resolutionV: UInt16 = 0
    var bitrate: UInt32 = 0
    var encoding: UInt8 = 0

    var resolution: String {
        "\(resolutionH)x\(resolutionV)"
    }

    var encodingName: String {
        switch encoding {
        case 1: return "H.264"
        case 2: return "H.265"
        case 3: return "MJPEG"
        default: return "Unknown"
        }
    }
}

/// Capture status
struct CaptureStatus: Sendable {
    var isCapturingImage = false
    var isRecordingVideo = false
    var imageInterval: Float = 0
    var recordingTimeMs: UInt32 = 0
    var availableCapacityMB: Float = 0
    var imageCount: Int32 = 0
}

@Observable
final class CameraService {

    // MARK: - Published State

    var cameraInfo: CameraInfo?
    var cameraMode: CameraMode?
    var streams: [VideoStreamInfo] = []
    var captureStatus = CaptureStatus()
    var imagesCaptured: Int32 = 0
    var lastImageIndex: Int32 = -1
    var isDiscovered = false
    var statusMessage: String = ""

    // MARK: - Private

    private var drone: MAVLinkDrone?
    private var discoveryTimer: Timer?

    func update(drone: MAVLinkDrone?) {
        self.drone = drone
    }

    func reset() {
        discoveryTimer?.invalidate()
        discoveryTimer = nil
        cameraInfo = nil
        cameraMode = nil
        streams = []
        captureStatus = CaptureStatus()
        imagesCaptured = 0
        lastImageIndex = -1
        isDiscovered = false
        statusMessage = ""
    }

    // MARK: - Discovery

    /// Request camera information. Call after connection is established.
    func requestCameraInfo() {
        // MAV_CMD_REQUEST_MESSAGE with param1=259 (CAMERA_INFORMATION)
        drone?.sendCommandLong(command: 512, param1: 259)
        statusMessage = "Requesting camera info..."
    }

    /// Request video stream information.
    func requestVideoStreams() {
        // MAV_CMD_REQUEST_MESSAGE with param1=269 (VIDEO_STREAM_INFORMATION), param2=0 (all streams)
        drone?.sendCommandLong(command: 512, param1: 269, param2: 0)
    }

    /// Request camera capture status.
    func requestCaptureStatus() {
        // MAV_CMD_REQUEST_MESSAGE with param1=262 (CAMERA_CAPTURE_STATUS)
        drone?.sendCommandLong(command: 512, param1: 262)
    }

    /// Request camera settings (mode).
    func requestCameraSettings() {
        // MAV_CMD_REQUEST_MESSAGE with param1=260 (CAMERA_SETTINGS)
        drone?.sendCommandLong(command: 512, param1: 260)
    }

    /// Start discovery sequence: request info, then streams and settings.
    func startDiscovery() {
        requestCameraInfo()
        // Follow up with stream and settings requests
        discoveryTimer?.invalidate()
        discoveryTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
            self?.requestVideoStreams()
            self?.requestCameraSettings()
            self?.requestCaptureStatus()
        }
    }

    // MARK: - Camera Control

    func setCameraMode(_ mode: CameraMode) {
        // MAV_CMD_SET_CAMERA_MODE (530), param2=mode_id
        drone?.sendCommandLong(command: 530, param2: Float(mode.rawValue))
        statusMessage = "Setting mode: \(mode == .image ? "Photo" : mode == .video ? "Video" : "Survey")"
    }

    func startImageCapture(interval: Float = 0, count: Int = 1) {
        // MAV_CMD_IMAGE_START_CAPTURE (2000), param1=0 (reserved), param2=interval, param3=count
        drone?.sendCommandLong(command: 2000, param2: interval, param3: Float(count))
        statusMessage = count == 1 ? "Capturing photo..." : "Starting timelapse..."
    }

    func stopImageCapture() {
        // MAV_CMD_IMAGE_STOP_CAPTURE (2001)
        drone?.sendCommandLong(command: 2001)
        statusMessage = "Stopping capture"
    }

    func startVideoCapture() {
        // MAV_CMD_VIDEO_START_CAPTURE (2500), param2=status interval (1Hz)
        drone?.sendCommandLong(command: 2500, param2: 1)
        statusMessage = "Recording started"
    }

    func stopVideoCapture() {
        // MAV_CMD_VIDEO_STOP_CAPTURE (2501)
        drone?.sendCommandLong(command: 2501)
        statusMessage = "Recording stopped"
    }

    func startStreaming(streamId: UInt8 = 0) {
        // MAV_CMD_VIDEO_START_STREAMING (2502), param1=stream_id
        drone?.sendCommandLong(command: 2502, param1: Float(streamId))
    }

    func stopStreaming(streamId: UInt8 = 0) {
        // MAV_CMD_VIDEO_STOP_STREAMING (2503), param1=stream_id
        drone?.sendCommandLong(command: 2503, param1: Float(streamId))
    }

    func setZoom(level: Float) {
        // MAV_CMD_SET_CAMERA_ZOOM (531), param1=1 (ZOOM_TYPE_CONTINUOUS), param2=level
        drone?.sendCommandLong(command: 531, param1: 1, param2: level)
    }

    func setFocus(level: Float) {
        // MAV_CMD_SET_CAMERA_FOCUS (532), param1=1 (FOCUS_TYPE_CONTINUOUS), param2=level
        drone?.sendCommandLong(command: 532, param1: 1, param2: level)
    }

    // MARK: - Message Handlers

    func handleCameraInformation(_ payload: Data) {
        let msg = MsgCameraInformation(from: payload)
        var info = CameraInfo()
        info.vendor = String(bytes: msg.vendor_name.prefix(while: { $0 != 0 }), encoding: .utf8) ?? ""
        info.model = String(bytes: msg.model_name.prefix(while: { $0 != 0 }), encoding: .utf8) ?? ""
        info.capabilities = CameraCapabilities(rawValue: msg.flags)
        info.resolutionH = msg.resolution_h
        info.resolutionV = msg.resolution_v
        info.definitionURI = msg.cam_definition_uri
        cameraInfo = info
        isDiscovered = true
        statusMessage = "Camera: \(info.model.isEmpty ? info.vendor : info.model)"

        // If camera has video stream, request stream info
        if info.capabilities.contains(.hasVideoStream) {
            requestVideoStreams()
        }
        requestCameraSettings()
    }

    func handleCameraSettings(_ payload: Data) {
        let msg = MsgCameraSettings(from: payload)
        cameraMode = CameraMode(rawValue: UInt32(msg.mode_id))
    }

    func handleVideoStreamInformation(_ payload: Data) {
        let msg = MsgVideoStreamInformation(from: payload)
        let stream = VideoStreamInfo(
            id: msg.stream_id,
            name: msg.name,
            uri: msg.uri,
            framerate: msg.framerate,
            resolutionH: msg.resolution_h,
            resolutionV: msg.resolution_v,
            bitrate: msg.bitrate,
            encoding: msg.encoding
        )

        // Replace or append
        if let idx = streams.firstIndex(where: { $0.id == stream.id }) {
            streams[idx] = stream
        } else {
            streams.append(stream)
        }

        // Auto-connect to first RTSP stream if video source is set to MAVLink
        print("[CameraService] Stream discovered: uri='\(stream.uri)', source=\(AppSettings.shared.videoSource)")
        if streams.count == 1, !stream.uri.isEmpty,
           AppSettings.shared.videoSource == .mavlink {
            let videoManager = VideoPlayerManager.shared
            if !videoManager.isPlaying {
                print("[CameraService] Auto-playing MAVLink stream: \(stream.uri)")
                videoManager.play(urlString: stream.uri)
                statusMessage = "Streaming: \(stream.resolution) \(stream.encodingName)"
            }
        }
    }

    func handleCameraCaptureStatus(_ payload: Data) {
        let msg = MsgCameraCaptureStatus(from: payload)
        captureStatus.isCapturingImage = msg.image_status != 0
        captureStatus.isRecordingVideo = msg.video_status != 0
        captureStatus.imageInterval = msg.image_interval
        captureStatus.recordingTimeMs = msg.recording_time_ms
        captureStatus.availableCapacityMB = msg.available_capacity
        captureStatus.imageCount = msg.image_count
        imagesCaptured = msg.image_count
    }

    func handleCameraImageCaptured(_ payload: Data) {
        let msg = MsgCameraImageCaptured(from: payload)
        lastImageIndex = msg.image_index
        imagesCaptured = msg.image_index + 1
        if msg.capture_result == 1 {
            statusMessage = "Photo #\(msg.image_index + 1)"
        } else {
            statusMessage = "Capture failed"
        }
    }
}
