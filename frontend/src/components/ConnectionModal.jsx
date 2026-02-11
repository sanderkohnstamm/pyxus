import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Trash2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const TYPE_PRESETS = {
  udp: 'udpin:0.0.0.0:14550',
  tcp: 'tcp:127.0.0.1:5760',
  serial: '/dev/ttyUSB0',
};

export default function ConnectionModal({ open, onClose, onConnect, connecting }) {
  const connectionHistory = useDroneStore((s) => s.connectionHistory);
  const removeFromConnectionHistory = useDroneStore((s) => s.removeFromConnectionHistory);

  const [connType, setConnType] = useState('udp');
  const [connString, setConnString] = useState(TYPE_PRESETS.udp);
  const [droneName, setDroneName] = useState('');
  const modalRef = useRef(null);

  // Load saved settings on first open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();
        if (!cancelled && data.status === 'ok' && data.settings?.connection) {
          const c = data.settings.connection;
          if (c.type) setConnType(c.type);
          if (c.string) setConnString(c.string);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const portalRoot = document.getElementById('root') || document.body;

  const handleTypeChange = (type) => {
    setConnType(type);
    setConnString(TYPE_PRESETS[type] || '');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onConnect(connString, droneName, connType);
  };

  const handleHistoryClick = (entry) => {
    onConnect(entry.connectionString, entry.name, entry.type);
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-start justify-start p-4 pt-12 pointer-events-none"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 pointer-events-auto"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="bg-gray-900/90 backdrop-blur-md border border-gray-700/50 rounded-xl shadow-2xl w-[320px] flex flex-col pointer-events-auto ml-2 relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-[12px] font-bold text-gray-200 tracking-wide">Connect Drone</span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Previous connections */}
        {connectionHistory.length > 0 && (
          <div className="px-3 pt-3 pb-1">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={10} className="text-gray-500" />
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Previous</span>
            </div>
            <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto">
              {connectionHistory.map((entry) => (
                <div
                  key={entry.connectionString}
                  className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-800/30 hover:bg-gray-800/60 border border-gray-800/30 hover:border-gray-700/40 cursor-pointer transition-all"
                  onClick={() => handleHistoryClick(entry)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-gray-300 truncate">{entry.name}</div>
                    <div className="text-[10px] text-gray-500 font-mono truncate">{entry.connectionString}</div>
                  </div>
                  <span className="text-[9px] text-gray-600 shrink-0">{formatTime(entry.lastUsed)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromConnectionHistory(entry.connectionString);
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-all"
                    title="Remove"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider if history exists */}
        {connectionHistory.length > 0 && (
          <div className="mx-3 my-2 border-t border-gray-800/50" />
        )}

        {/* New connection form */}
        <form onSubmit={handleSubmit} className="px-3 pb-3 pt-1 flex flex-col gap-2">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">New Connection</span>

          <select
            value={connType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="bg-gray-800/40 text-gray-400 border border-gray-700/40 rounded-lg px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 transition-colors"
          >
            <option value="udp">UDP</option>
            <option value="tcp">TCP</option>
            <option value="serial">Serial</option>
          </select>

          <input
            type="text"
            value={connString}
            onChange={(e) => setConnString(e.target.value)}
            placeholder="Connection string..."
            className="bg-gray-800/40 text-gray-300 border border-gray-700/40 rounded-lg px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 transition-colors placeholder:text-gray-600"
          />

          <input
            type="text"
            value={droneName}
            onChange={(e) => setDroneName(e.target.value)}
            placeholder="Name (optional)..."
            className="bg-gray-800/40 text-gray-300 border border-gray-700/40 rounded-lg px-2.5 py-1.5 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 transition-colors placeholder:text-gray-600"
          />

          <button
            type="submit"
            disabled={connecting || !connString.trim()}
            className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400/80 border border-cyan-500/20 transition-all disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>,
    portalRoot,
  );
}
