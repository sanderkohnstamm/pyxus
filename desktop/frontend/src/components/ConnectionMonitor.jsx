import { useEffect, useRef, useMemo } from 'react';
import useDroneStore from '../store/droneStore';

function playBeep(frequency = 800, duration = 0.3) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  } catch {}
}

function playLinkLostAlarm() {
  playBeep(1000, 0.15);
  setTimeout(() => playBeep(1000, 0.15), 250);
}

// Derive a stable string key from link-lost states so we only re-render on actual changes
function selectLinkLostKey(s) {
  const parts = [];
  for (const [id, drone] of Object.entries(s.drones)) {
    if (drone.linkLost) parts.push(id);
  }
  return parts.join(',');
}

export default function ConnectionMonitor() {
  const soundEnabled = useDroneStore((s) => s.soundEnabled);
  const linkLostKey = useDroneStore(selectLinkLostKey);
  const alarmRef = useRef(null);
  const prevLinkLostRef = useRef(new Set());

  // Derive the set of lost drone IDs from the stable key
  const lostIds = useMemo(() => {
    return linkLostKey ? new Set(linkLostKey.split(',')) : new Set();
  }, [linkLostKey]);

  useEffect(() => {
    const anyLost = lostIds.size > 0;

    // Detect new link loss transitions for immediate alarm
    for (const id of lostIds) {
      if (!prevLinkLostRef.current.has(id) && soundEnabled) {
        playLinkLostAlarm();
      }
    }
    prevLinkLostRef.current = lostIds;

    // Repeating alarm while any drone has link lost
    if (anyLost && soundEnabled) {
      if (!alarmRef.current) {
        alarmRef.current = setInterval(() => {
          playLinkLostAlarm();
        }, 5000);
      }
    } else {
      if (alarmRef.current) {
        clearInterval(alarmRef.current);
        alarmRef.current = null;
      }
    }

    return () => {
      if (alarmRef.current) {
        clearInterval(alarmRef.current);
        alarmRef.current = null;
      }
    };
  }, [lostIds, soundEnabled]);

  return null;
}
