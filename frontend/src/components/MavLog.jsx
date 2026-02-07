import React, { useEffect, useRef } from 'react';
import { Terminal, X } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const SEVERITY_LABELS = ['EMERG', 'ALERT', 'CRIT', 'ERROR', 'WARN', 'NOTICE', 'INFO', 'DEBUG'];
const SEVERITY_COLORS = {
  0: 'text-red-400',      // EMERGENCY
  1: 'text-red-400',      // ALERT
  2: 'text-red-300',      // CRITICAL
  3: 'text-red-300',      // ERROR
  4: 'text-amber-300',    // WARNING
  5: 'text-sky-300',      // NOTICE
  6: 'text-gray-400',     // INFO
  7: 'text-gray-600',     // DEBUG
};

const MAX_AGE_MS = 60000;

export default function MavLog() {
  const mavMessages = useDroneStore((s) => s.mavMessages);
  const mavLogVisible = useDroneStore((s) => s.mavLogVisible);
  const toggleMavLog = useDroneStore((s) => s.toggleMavLog);
  const clearMavMessages = useDroneStore((s) => s.clearMavMessages);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current && mavLogVisible) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mavMessages.length, mavLogVisible]);

  const now = Date.now();

  return (
    <div className="relative">
      <button
        onClick={toggleMavLog}
        className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
          mavLogVisible
            ? 'bg-gray-900/15 text-cyan-400 border-cyan-500/20'
            : 'bg-gray-900/10 text-gray-500 hover:text-gray-300 border-gray-700/15'
        }`}
      >
        <Terminal size={12} className="inline -mt-0.5" />
        {mavMessages.length > 0 && (
          <span className="ml-1.5 text-[10px] tabular-nums">{mavMessages.length}</span>
        )}
      </button>

      {mavLogVisible && (
        <div className="absolute bottom-full left-0 mb-2 w-[420px] max-h-[280px] bg-gray-900/15 backdrop-blur-md rounded-lg border border-gray-700/15 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/15 shrink-0">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">MAVLink Log</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={clearMavMessages}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={toggleMavLog}
                className="text-gray-600 hover:text-gray-400 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-2 py-1 font-mono text-[10px] leading-[16px]">
            {mavMessages.length === 0 ? (
              <div className="text-gray-700 italic text-center py-4">No messages</div>
            ) : (
              mavMessages.map((msg) => {
                const age = now - msg.ts;
                const opacity = age > MAX_AGE_MS ? 'opacity-30' : age > MAX_AGE_MS * 0.7 ? 'opacity-50' : '';
                const sevLabel = SEVERITY_LABELS[msg.severity] || 'UNK';
                const sevColor = SEVERITY_COLORS[msg.severity] || 'text-gray-500';
                const time = new Date(msg.ts).toLocaleTimeString('en-GB', { hour12: false });

                return (
                  <div key={msg.id} className={`flex gap-2 py-px ${opacity}`}>
                    <span className="text-gray-700 shrink-0">{time}</span>
                    <span className={`shrink-0 w-[42px] text-right ${sevColor}`}>{sevLabel}</span>
                    <span className="text-gray-300 break-all">{msg.text}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
