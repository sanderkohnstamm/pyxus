import { useEffect, useRef, useCallback } from 'react';
import useDroneStore from '../store/droneStore';
import { wsUrl } from '../utils/api';

const WS_RECONNECT_DELAY = 2000;

// Calibration-related keywords in STATUSTEXT
const CALIBRATION_KEYWORDS = [
  'calibrat', 'accel', 'gyro', 'compass', 'mag', 'level', 'baro', 'pressure',
  'place vehicle', 'hold still', 'rotate', 'level position', 'on its',
  'left side', 'right side', 'nose down', 'nose up', 'back', 'belly',
  'complete', 'success', 'failed', 'done', 'finished', 'next'
];

function isCalibrationMessage(text) {
  const lower = text.toLowerCase();
  return CALIBRATION_KEYWORDS.some(kw => lower.includes(kw));
}

export default function useWebSocket() {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const setWsConnected = useDroneStore((s) => s.setWsConnected);
  const addMavMessages = useDroneStore((s) => s.addMavMessages);

  // Telemetry buffering: only the latest message per drone is kept.
  // Flushed once per animation frame so that when the tab is backgrounded
  // and messages queue up, we skip all intermediate positions and jump
  // straight to the latest state instead of "fast-forwarding" through them.
  const pendingTelemetry = useRef({});    // droneId -> latest data
  const pendingStatustext = useRef({});   // droneId -> accumulated statustext arrays
  const rafId = useRef(null);

  const flushTelemetry = useCallback(() => {
    const pending = pendingTelemetry.current;
    const pendingSt = pendingStatustext.current;
    const droneIds = Object.keys(pending);
    if (droneIds.length === 0) {
      rafId.current = null;
      return;
    }

    const store = useDroneStore.getState();

    for (const droneId of droneIds) {
      const data = pending[droneId];

      // Auto-register drone if we haven't seen it
      if (!store.drones[droneId]) {
        store.registerDrone(droneId, data.drone_name || droneId, '');
      }

      // Route accumulated statustext messages
      const stMsgs = pendingSt[droneId];
      if (stMsgs && stMsgs.length > 0) {
        if (droneId === store.activeDroneId) {
          addMavMessages(stMsgs);
        }

        // Route calibration messages
        const { calibrationStatus, addCalibrationMessage, setCalibrationStep } = store;
        if (calibrationStatus.active && droneId === store.activeDroneId) {
          stMsgs.forEach(msg => {
            if (isCalibrationMessage(msg.text)) {
              addCalibrationMessage(msg);

              if (calibrationStatus.type === 'accel') {
                const text = msg.text.toLowerCase();
                if (text.includes('level')) setCalibrationStep(0);
                else if (text.includes('left')) setCalibrationStep(1);
                else if (text.includes('right')) setCalibrationStep(2);
                else if (text.includes('nose down')) setCalibrationStep(3);
                else if (text.includes('nose up')) setCalibrationStep(4);
                else if (text.includes('back') || text.includes('belly')) setCalibrationStep(5);
              }
            }
          });
        }
      }

      // Update per-drone telemetry (only latest state)
      store.updateDroneTelemetry(droneId, data);
    }

    // Clear buffers
    pendingTelemetry.current = {};
    pendingStatustext.current = {};
    rafId.current = null;
  }, [addMavMessages]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(wsUrl('/ws'));

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'telemetry') {
          const droneId = data.drone_id;
          if (!droneId) return;

          // Buffer: keep only the latest telemetry per drone
          pendingTelemetry.current[droneId] = data;

          // Accumulate statustext (these should not be dropped)
          if (data.statustext && data.statustext.length > 0) {
            if (!pendingStatustext.current[droneId]) {
              pendingStatustext.current[droneId] = [];
            }
            pendingStatustext.current[droneId].push(...data.statustext);
          }

          // Schedule flush on next animation frame (coalesces multiple messages)
          if (rafId.current === null) {
            rafId.current = requestAnimationFrame(flushTelemetry);
          }
        } else if (data.type === 'link_event') {
          // Link events are safety-critical — handle immediately, no buffering
          const store = useDroneStore.getState();
          const lost = data.event === 'link_lost';
          store.setDroneLinkStatus(data.drone_id, lost, data.last_telemetry);
          const name = data.drone_name || data.drone_id;
          if (lost) {
            store.addAlert(`LINK LOST: ${name}`, 'error');
            store.addGcsLog(`Link lost: ${name}`, 'error');
          } else {
            store.addAlert(`Link recovered: ${name}`, 'success');
            store.addGcsLog(`Link recovered: ${name}`, 'success');
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [setWsConnected, flushTelemetry]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Inject drone_id for RC override messages
      if (data.type === 'rc_override') {
        const { activeDroneId } = useDroneStore.getState();
        if (activeDroneId) {
          data.drone_id = activeDroneId;
        }
      }
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { sendMessage, wsRef };
}
