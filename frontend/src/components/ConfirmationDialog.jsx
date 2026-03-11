import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const DOUBLE_CONFIRM_DELAY = 2; // seconds

export default function ConfirmationDialog() {
  const dialog = useDroneStore((s) => s.confirmationDialog);
  const hide = useDroneStore((s) => s.hideConfirmationDialog);
  const [countdown, setCountdown] = useState(0);

  // Reset countdown when dialog opens
  useEffect(() => {
    if (!dialog) { setCountdown(0); return; }
    if (dialog.doubleConfirm) {
      setCountdown(DOUBLE_CONFIRM_DELAY);
      const interval = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(interval); return 0; }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(0);
    }
  }, [dialog]);

  // Escape to cancel
  useEffect(() => {
    if (!dialog) return;
    const handler = (e) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dialog, hide]);

  const handleConfirm = useCallback(() => {
    if (countdown > 0) return;
    dialog?.onConfirm?.();
    hide();
  }, [dialog, hide, countdown]);

  if (!dialog) return null;

  const isDanger = dialog.variant === 'danger';
  const accentColor = isDanger ? 'red' : 'amber';

  const portalRoot = document.getElementById('root') || document.body;

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={hide}
      />

      {/* Modal */}
      <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700/50 rounded-xl shadow-2xl w-[320px] flex flex-col pointer-events-auto relative">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDanger ? 'border-red-800/30' : 'border-amber-800/30'}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className={isDanger ? 'text-red-400' : 'text-amber-400'} />
            <span className="text-[12px] font-bold text-gray-200 tracking-wide">{dialog.title}</span>
          </div>
          <button
            onClick={hide}
            className="p-1 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Message */}
        <div className="px-4 py-4">
          <p className="text-[11px] text-gray-400 leading-relaxed">{dialog.message}</p>
        </div>

        {/* Footer buttons */}
        <div className="flex gap-2 px-3 pb-3 pt-1">
          <button
            onClick={hide}
            className="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 rounded-lg text-[11px] font-medium text-gray-400 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={countdown > 0}
            className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all disabled:cursor-not-allowed ${
              isDanger
                ? 'bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 text-red-400 disabled:opacity-50'
                : 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-400 disabled:opacity-50'
            }`}
          >
            {countdown > 0 ? `Confirm (${countdown}s)` : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
