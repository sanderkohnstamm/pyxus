import React from 'react';

export function GlassPanel({ children, className = '', onClick, ...props }) {
  return (
    <div
      className={`backdrop-blur-xl bg-gray-950/75 border border-white/[0.08] rounded-2xl shadow-2xl ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlassButton({ children, className = '', color = 'gray', onClick, disabled, title, ...props }) {
  const colorMap = {
    gray: 'bg-gray-500/15 border-gray-500/30 text-gray-300 hover:bg-gray-500/25',
    emerald: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25',
    amber: 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25',
    red: 'bg-red-500/15 border-red-500/30 text-red-300 hover:bg-red-500/25',
  };

  return (
    <button
      className={`backdrop-blur-sm ${colorMap[color] || colorMap.gray} border rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlassChip({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-800/40 border border-white/[0.06] text-[10px] font-medium ${className}`}>
      {children}
    </span>
  );
}
