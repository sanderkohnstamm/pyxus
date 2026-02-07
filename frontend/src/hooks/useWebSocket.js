import { useEffect, useRef, useCallback, useState } from 'react';
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
  const [droneChangeDetected, setDroneChangeDetected] = useState(null);
  const updateTelemetry = useDroneStore((s) => s.updateTelemetry);
  const addMavMessages = useDroneStore((s) => s.addMavMessages);
  const setWsConnected = useDroneStore((s) => s.setWsConnected);
  const connectionStatus = useDroneStore((s) => s.connectionStatus);

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
          // Extract statustext before passing to telemetry
          if (data.statustext && data.statustext.length > 0) {
            addMavMessages(data.statustext);

            // Route calibration messages
            const { calibrationStatus, addCalibrationMessage, setCalibrationStep } = useDroneStore.getState();
            if (calibrationStatus.active) {
              data.statustext.forEach(msg => {
                if (isCalibrationMessage(msg.text)) {
                  addCalibrationMessage(msg);

                  // Detect accel calibration steps
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

          // Check for drone identity change
          const { droneIdentity, checkDroneChange, setDroneIdentity } = useDroneStore.getState();
          const newIdentity = {
            sysid: data.system_id || null,
            autopilot: data.autopilot,
            platformType: data.platform_type,
          };

          if (checkDroneChange(newIdentity)) {
            setDroneChangeDetected({
              old: droneIdentity,
              new: newIdentity,
            });
          }

          // Update identity if not set
          if (droneIdentity.sysid === null && newIdentity.autopilot && newIdentity.autopilot !== 'unknown') {
            setDroneIdentity(newIdentity);
          }

          updateTelemetry(data);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
      // Auto-reconnect
      reconnectTimer.current = setTimeout(connect, WS_RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [updateTelemetry, addMavMessages, setWsConnected]);

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
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const dismissDroneChange = useCallback(() => {
    setDroneChangeDetected(null);
  }, []);

  const acceptDroneChange = useCallback(() => {
    const { setDroneIdentity, resetState, setConnectionStatus } = useDroneStore.getState();
    if (droneChangeDetected) {
      // Reset state and accept the new drone
      resetState();
      setDroneIdentity(droneChangeDetected.new);
      setConnectionStatus('connected');
    }
    setDroneChangeDetected(null);
  }, [droneChangeDetected]);

  return { sendMessage, wsRef, droneChangeDetected, dismissDroneChange, acceptDroneChange };
}
