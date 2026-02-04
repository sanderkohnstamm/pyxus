import React, { useCallback } from 'react';
import { Video, Play, X, Link } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const EXAMPLE_URLS = [
  { label: 'RTSP', value: 'rtsp://192.168.1.1:8554/stream' },
  { label: 'HTTP MJPEG', value: 'http://192.168.1.1:8080/video' },
  { label: 'UDP', value: 'udp://0.0.0.0:5600' },
];

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

      {/* URL input */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mb-3">
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
