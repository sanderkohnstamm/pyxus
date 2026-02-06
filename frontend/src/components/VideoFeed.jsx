import React, { useCallback, useEffect, useState } from 'react';
import { Video, Play, X, Link, Camera, Crosshair, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const EXAMPLE_URLS = [
  { label: 'RTSP', value: 'rtsp://192.168.1.1:8554/stream' },
  { label: 'HTTP MJPEG', value: 'http://192.168.1.1:8080/video' },
  { label: 'UDP', value: 'udp://0.0.0.0:5600' },
];

function GimbalControl() {
  const addAlert = useDroneStore((s) => s.addAlert);
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const [pitch, setPitch] = useState(0);
  const [yaw, setYaw] = useState(0);
  const isConnected = connectionStatus === 'connected';

  const sendGimbalCommand = useCallback(async (p, y) => {
    if (!isConnected) return;
    try {
      await fetch('/api/gimbal/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch: p, yaw: y }),
      });
    } catch (err) {
      addAlert('Gimbal control failed: ' + err.message, 'error');
    }
  }, [isConnected, addAlert]);

  const handleCenter = () => {
    setPitch(0);
    setYaw(0);
    sendGimbalCommand(0, 0);
  };

  const handlePitchChange = (val) => {
    setPitch(val);
    sendGimbalCommand(val, yaw);
  };

  const handleYawChange = (val) => {
    setYaw(val);
    sendGimbalCommand(pitch, val);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500 uppercase">Gimbal Control</span>
        <button
          onClick={handleCenter}
          className="text-[9px] px-2 py-0.5 bg-gray-800/60 border border-gray-700/30 rounded text-gray-500 hover:text-gray-300 hover:border-gray-600/50 transition-colors"
        >
          Center
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] text-gray-600 mb-1 block">Pitch: {pitch}°</label>
          <input
            type="range"
            min={-90}
            max={30}
            value={pitch}
            onChange={(e) => handlePitchChange(parseInt(e.target.value))}
            disabled={!isConnected}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
          />
        </div>
        <div>
          <label className="text-[9px] text-gray-600 mb-1 block">Yaw: {yaw}°</label>
          <input
            type="range"
            min={-180}
            max={180}
            value={yaw}
            onChange={(e) => handleYawChange(parseInt(e.target.value))}
            disabled={!isConnected}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
          />
        </div>
      </div>
    </div>
  );
}

function CameraList() {
  const cameras = useDroneStore((s) => s.cameras);
  const gimbals = useDroneStore((s) => s.gimbals);
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const setCameras = useDroneStore((s) => s.setCameras);
  const setGimbals = useDroneStore((s) => s.setGimbals);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(false);
  const isConnected = connectionStatus === 'connected';

  const refreshDevices = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const res = await fetch('/api/cameras');
      const data = await res.json();
      if (data.status === 'ok') {
        setCameras(data.cameras || []);
        setGimbals(data.gimbals || []);
      }
    } catch {}
    setLoading(false);
  }, [isConnected, setCameras, setGimbals]);

  useEffect(() => {
    if (isConnected) {
      refreshDevices();
    }
  }, [isConnected]); // eslint-disable-line

  const hasDevices = cameras.length > 0 || gimbals.length > 0;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Camera size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
            Cameras & Gimbals
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refreshDevices}
            disabled={!isConnected || loading}
            className="p-1 rounded hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2">
          {!isConnected ? (
            <div className="text-[10px] text-gray-600 italic text-center py-2">
              Connect to detect cameras
            </div>
          ) : !hasDevices ? (
            <div className="text-[10px] text-gray-600 italic text-center py-2">
              No cameras or gimbals detected
            </div>
          ) : (
            <>
              {cameras.map((cam, i) => (
                <div key={cam.component_id || i} className="bg-gray-900/40 rounded-md p-2 border border-gray-800/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Camera size={10} className="text-cyan-500" />
                    <span className="text-[10px] font-semibold text-gray-300">
                      {cam.vendor} {cam.model || `Camera ${cam.component_id}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 text-[9px] text-gray-500">
                    {cam.resolution_h > 0 && (
                      <span>Resolution: {cam.resolution_h}x{cam.resolution_v}</span>
                    )}
                    {cam.focal_length > 0 && (
                      <span>Focal: {cam.focal_length}mm</span>
                    )}
                    <span>Component: {cam.component_id}</span>
                  </div>
                </div>
              ))}

              {gimbals.map((gim, i) => (
                <div key={gim.component_id || i} className="bg-gray-900/40 rounded-md p-2 border border-gray-800/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Crosshair size={10} className="text-amber-500" />
                    <span className="text-[10px] font-semibold text-gray-300">
                      {gim.vendor} {gim.model || `Gimbal ${gim.component_id}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 text-[9px] text-gray-500">
                    {gim.tilt_max !== 0 && (
                      <span>Tilt: {Math.round(gim.tilt_min * 180/Math.PI)}° to {Math.round(gim.tilt_max * 180/Math.PI)}°</span>
                    )}
                    {gim.pan_max !== 0 && (
                      <span>Pan: {Math.round(gim.pan_min * 180/Math.PI)}° to {Math.round(gim.pan_max * 180/Math.PI)}°</span>
                    )}
                    <span>Component: {gim.component_id}</span>
                  </div>
                </div>
              ))}

              {gimbals.length > 0 && <GimbalControl />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function VideoFeed() {
  const videoUrl = useDroneStore((s) => s.videoUrl);
  const videoActive = useDroneStore((s) => s.videoActive);
  const setVideoUrl = useDroneStore((s) => s.setVideoUrl);
  const setVideoActive = useDroneStore((s) => s.setVideoActive);
  const addAlert = useDroneStore((s) => s.addAlert);

  const streamUrl = videoActive && videoUrl
    ? `/api/video/stream?url=${encodeURIComponent(videoUrl)}`
    : null;

  const handleStart = useCallback(() => {
    if (!videoUrl.trim()) {
      addAlert('Enter a video stream URL', 'warning');
      return;
    }
    setVideoActive(true);
  }, [videoUrl, setVideoActive, addAlert]);

  const handleStop = useCallback(() => {
    setVideoActive(false);
  }, [setVideoActive]);

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex items-center gap-1.5 mb-3">
        <Video size={13} className="text-gray-500" />
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Video Feed</span>
      </div>

      {/* Camera/Gimbal list */}
      <CameraList />

      {/* URL input */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 my-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Link size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Stream URL</span>
        </div>
        <input
          type="text"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="rtsp://... or http://..."
          disabled={videoActive}
          className="w-full bg-gray-800/80 text-gray-200 border border-gray-700/50 rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-40 transition-colors mb-2"
        />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {EXAMPLE_URLS.map((ex) => (
            <button
              key={ex.label}
              onClick={() => setVideoUrl(ex.value)}
              disabled={videoActive}
              className="text-[9px] px-2 py-0.5 bg-gray-800/60 border border-gray-700/30 rounded text-gray-500 hover:text-gray-300 hover:border-gray-600/50 transition-colors disabled:opacity-30"
            >
              {ex.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleStart}
            disabled={videoActive || !videoUrl.trim()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 rounded-md text-xs font-semibold text-emerald-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Play size={12} /> Start
          </button>
          <button
            onClick={handleStop}
            disabled={!videoActive}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-md text-xs font-semibold text-red-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X size={12} /> Stop
          </button>
        </div>
      </div>

      {/* Video display */}
      <div className="flex-1 bg-gray-900/60 rounded-lg border border-gray-800/50 overflow-hidden flex items-center justify-center min-h-[200px]">
        {streamUrl ? (
          <img
            src={streamUrl}
            alt="Video feed"
            className="w-full h-full object-contain"
            onError={() => {
              addAlert('Video stream failed or ended', 'error');
              setVideoActive(false);
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-600">
            <Video size={32} className="opacity-30" />
            <span className="text-xs italic">No video stream active</span>
            <span className="text-[10px] opacity-60">Enter a URL and click Start</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-2 text-[10px] text-gray-600 italic">
        Supports RTSP, HTTP MJPEG, and UDP streams. Requires ffmpeg on the server.
      </div>
    </div>
  );
}
