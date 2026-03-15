import React, { useEffect, useRef, useCallback } from 'react';
import { Video, Maximize2, X } from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../../store/droneStore';
import { isIOS } from '../hooks/usePlatform';

/**
 * Sends messages to the native iOS video player via the JS bridge.
 * Falls back to no-op on non-iOS platforms.
 */
function sendVideoCommand(action, data = {}) {
  if (window.webkit?.messageHandlers?.pyxios) {
    window.webkit.messageHandlers.pyxios.postMessage({ action, ...data });
  }
}

/**
 * Pushes telemetry to the native HUD overlay at ~1Hz.
 */
function useHUDSync() {
  const telemetry = useDroneStore((s) => {
    const id = s.activeDroneId;
    return id ? s.drones[id]?.telemetry : INITIAL_TELEMETRY;
  }) || INITIAL_TELEMETRY;

  const lastSent = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastSent.current < 900) return;
      lastSent.current = now;

      sendVideoCommand('hudUpdate', {
        data: {
          armed: telemetry.armed,
          mode: telemetry.mode,
          battery: telemetry.remaining,
          altitude: telemetry.alt,
          groundSpeed: telemetry.groundspeed,
          heading: telemetry.heading,
        },
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [telemetry]);
}

/**
 * Video control component for mobile — controls native AVPlayer on iOS.
 * Shows play/stop/fullscreen buttons and syncs telemetry to the native HUD.
 */
export default function VideoControl() {
  const videoUrl = useDroneStore((s) => s.videoUrl);
  const videoPlayerState = useDroneStore((s) => s.videoPlayerState);
  const setVideoPlayerState = useDroneStore((s) => s.setVideoPlayerState);

  useHUDSync();

  const handlePlay = useCallback(() => {
    if (!videoUrl) return;
    sendVideoCommand('videoPlay', { url: videoUrl });
    setVideoPlayerState('pip');
  }, [videoUrl, setVideoPlayerState]);

  const handleStop = useCallback(() => {
    sendVideoCommand('videoStop');
    setVideoPlayerState('hidden');
  }, [setVideoPlayerState]);

  const handleFullscreen = useCallback(() => {
    sendVideoCommand('videoFullscreen');
    setVideoPlayerState('fullscreen');
  }, [setVideoPlayerState]);

  const isActive = videoPlayerState !== 'hidden';
  const ios = isIOS();

  return (
    <div className="space-y-3">
      {/* Status */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          {!ios ? 'Native video requires iOS' : !videoUrl ? 'Set RTSP URL in Video section' : isActive ? 'Playing' : 'Ready'}
        </span>
        {isActive && (
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
            {videoPlayerState === 'fullscreen' ? 'FULLSCREEN' : 'PiP'}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {!isActive ? (
          <button
            onClick={handlePlay}
            disabled={!videoUrl || !ios}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-700/30 bg-gray-900/60 text-[12px] font-semibold text-gray-300 active:scale-[0.98] disabled:opacity-40"
          >
            <Video size={14} />
            Start Video
          </button>
        ) : (
          <>
            <button
              onClick={handleFullscreen}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-[12px] font-semibold text-cyan-400 active:scale-[0.98]"
            >
              <Maximize2 size={14} />
              Fullscreen
            </button>
            <button
              onClick={handleStop}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-700/30 bg-gray-900/60 text-[12px] font-semibold text-gray-400 active:scale-[0.98]"
            >
              <X size={14} />
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
