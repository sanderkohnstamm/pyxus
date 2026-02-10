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

          const store = useDroneStore.getState();

          // Auto-register drone if we haven't seen it
          if (!store.drones[droneId]) {
            store.registerDrone(droneId, data.drone_name || droneId, '');
          }

          // Route statustext messages
          if (data.statustext && data.statustext.length > 0) {
            // Only show statustext from the active drone in the global log
            if (droneId === store.activeDroneId) {
              addMavMessages(data.statustext);
            }

            // Route calibration messages
            const { calibrationStatus, addCalibrationMessage, setCalibrationStep } = store;
            if (calibrationStatus.active && droneId === store.activeDroneId) {
              data.statustext.forEach(msg => {
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

          // Update per-drone telemetry
          store.updateDroneTelemetry(droneId, data);
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
  }, [setWsConnected, addMavMessages]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
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
