import { useState, useRef, useCallback, useEffect } from 'react';
import useDroneStore from '../store/droneStore';
import { droneApi } from '../utils/api';

const CONFIRM_TIMEOUT = 3000;

/**
 * Two-tap emergency stop pattern.
 * First tap arms the confirmation, second tap (within 3s) sends force_disarm.
 * Returns { confirming, trigger }.
 */
export default function useEStopAction() {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const trigger = useCallback(async () => {
    if (!confirming) {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), CONFIRM_TIMEOUT);
      return;
    }

    clearTimeout(timerRef.current);
    setConfirming(false);

    try {
      await fetch(droneApi('/api/force_disarm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {}

    addGcsLog('EMERGENCY STOP — force disarm sent', 'error');
    addAlert('EMERGENCY STOP — force disarm sent', 'error');
  }, [confirming, addAlert, addGcsLog]);

  return { confirming, trigger };
}
