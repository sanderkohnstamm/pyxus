import React from 'react';
import useWebSocket from '../hooks/useWebSocket';
import useDroneStore from '../store/droneStore';
import BatteryMonitor from '../components/BatteryMonitor';
import ConnectionMonitor from '../components/ConnectionMonitor';
import ConfirmationDialog from '../components/ConfirmationDialog';
import MobileLayout from './MobileLayout';

export default function MobileApp() {
  useWebSocket();
  const theme = useDroneStore((s) => s.theme);
  const colorScheme = useDroneStore((s) => s.colorScheme);
  const alerts = useDroneStore((s) => s.alerts);

  const themeClass = theme === 'light' ? 'light' : '';
  const schemeClass = colorScheme !== 'cyan' ? `scheme-${colorScheme}` : '';

  return (
    <div className={`h-full flex flex-col bg-gray-950 text-gray-100 ${themeClass} ${schemeClass}`}>
      <MobileLayout />

      {/* Alerts overlay — positioned below status strip */}
      <div className="fixed top-[calc(env(safe-area-inset-top)+52px)] left-3 right-3 z-[9999] flex flex-col gap-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl backdrop-blur-xl border ${
              alert.type === 'error'
                ? 'bg-red-950/70 text-red-200 border-red-800/30'
                : alert.type === 'success'
                ? 'bg-emerald-950/70 text-emerald-200 border-emerald-800/30'
                : alert.type === 'warning'
                ? 'bg-amber-950/70 text-amber-200 border-amber-800/30'
                : 'bg-sky-950/70 text-sky-200 border-sky-800/30'
            }`}
          >
            {alert.message}
          </div>
        ))}
      </div>

      {/* Headless monitors */}
      <BatteryMonitor />
      <ConnectionMonitor />
      <ConfirmationDialog />
    </div>
  );
}
