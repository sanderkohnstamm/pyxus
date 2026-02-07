import React, { useState } from 'react';
import { Video, X, Maximize2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import FullscreenVideo from './FullscreenVideo';
import { apiUrl } from '../utils/api';

export default function VideoOverlay() {
  const videoUrl = useDroneStore((s) => s.videoUrl);
  const videoActive = useDroneStore((s) => s.videoActive);
  const videoOverlayVisible = useDroneStore((s) => s.videoOverlayVisible);
  const toggleVideoOverlay = useDroneStore((s) => s.toggleVideoOverlay);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const streamUrl = videoActive && videoUrl
    ? apiUrl(`/api/video/stream?url=${encodeURIComponent(videoUrl)}`)
    : null;

  if (isFullscreen) {
    return <FullscreenVideo onClose={() => setIsFullscreen(false)} />;
  }

  return (
    <div className="relative">
      <button
        onClick={toggleVideoOverlay}
        className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
          videoOverlayVisible
            ? 'bg-gray-900/60 text-cyan-400 border-cyan-500/30'
            : 'bg-gray-900/50 text-gray-500 hover:text-gray-300 border-gray-700/30'
        }`}
      >
        <Video size={12} className="inline -mt-0.5" />
      </button>

      {videoOverlayVisible && (
        <div className="absolute bottom-full left-0 mb-2 w-[320px] bg-gray-900/70 backdrop-blur-md rounded-lg border border-gray-700/30 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/30 shrink-0">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Video Feed</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsFullscreen(true)}
                className="text-gray-600 hover:text-cyan-400 transition-colors p-0.5"
                title="Fullscreen with HUD"
              >
                <Maximize2 size={12} />
              </button>
              <button
                onClick={toggleVideoOverlay}
                className="text-gray-600 hover:text-gray-400 transition-colors p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="aspect-video bg-black/40 flex items-center justify-center relative group">
            {streamUrl ? (
              <>
                <img
                  src={streamUrl}
                  alt="Video feed"
                  className="w-full h-full object-contain"
                />
                {/* Fullscreen button overlay on hover */}
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <div className="flex flex-col items-center gap-1 text-white">
                    <Maximize2 size={24} />
                    <span className="text-xs">Fullscreen HUD</span>
                  </div>
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-gray-600">
                <Video size={24} className="opacity-30" />
                <span className="text-[10px] italic">No video active</span>
                <span className="text-[9px] opacity-50">Configure in Video tab</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
