import React from 'react';
import { Settings, Palette, Sun, Moon } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const COLOR_SCHEMES = [
  { id: 'cyan', name: 'Cyan', class: 'bg-cyan-500' },
  { id: 'emerald', name: 'Emerald', class: 'bg-emerald-500' },
  { id: 'violet', name: 'Violet', class: 'bg-violet-500' },
  { id: 'rose', name: 'Rose', class: 'bg-rose-500' },
  { id: 'amber', name: 'Amber', class: 'bg-amber-500' },
  { id: 'sky', name: 'Sky', class: 'bg-sky-500' },
  { id: 'pink', name: 'Pink', class: 'bg-pink-500' },
  { id: 'indigo', name: 'Indigo', class: 'bg-indigo-500' },
];

export default function SettingsPanel() {
  const theme = useDroneStore((s) => s.theme);
  const setTheme = useDroneStore((s) => s.setTheme);
  const colorScheme = useDroneStore((s) => s.colorScheme);
  const setColorScheme = useDroneStore((s) => s.setColorScheme);

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
        <Settings size={16} className="text-gray-400" />
        <span className="text-sm font-semibold text-gray-200">Settings</span>
      </div>

      {/* Theme Mode */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Theme Mode</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTheme('dark')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${
              theme === 'dark'
                ? 'bg-gray-700/50 border-cyan-500/50 text-cyan-300'
                : 'bg-gray-800/30 border-gray-700/50 text-gray-500 hover:text-gray-300'
            }`}
          >
            <Moon size={14} />
            <span className="text-xs font-medium">Dark</span>
          </button>
          <button
            onClick={() => setTheme('light')}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border transition-all ${
              theme === 'light'
                ? 'bg-gray-700/50 border-cyan-500/50 text-cyan-300'
                : 'bg-gray-800/30 border-gray-700/50 text-gray-500 hover:text-gray-300'
            }`}
          >
            <Sun size={14} />
            <span className="text-xs font-medium">Light</span>
          </button>
        </div>
      </div>

      {/* Accent Color */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Accent Color</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {COLOR_SCHEMES.map((scheme) => (
            <button
              key={scheme.id}
              onClick={() => setColorScheme(scheme.id)}
              className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${
                colorScheme === scheme.id
                  ? 'bg-gray-700/50 border-gray-500'
                  : 'bg-gray-800/30 border-gray-700/50 hover:border-gray-600'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full ${scheme.class} ${
                  colorScheme === scheme.id ? 'ring-2 ring-white/30 ring-offset-2 ring-offset-gray-900' : ''
                }`}
              />
              <span className="text-[9px] text-gray-400">{scheme.name}</span>
              {colorScheme === scheme.id && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-gray-900 rounded-full" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Preview</span>
        <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent-500" />
            <span className="text-xs text-accent-400">
              Primary accent color
            </span>
          </div>
          <button className="w-full px-3 py-1.5 rounded text-xs font-medium transition-all bg-accent-500/20 text-accent-300 border border-accent-500/50">
            Sample Button
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="text-[10px] text-gray-600 italic">
        Settings are saved automatically and persist across sessions.
      </div>
    </div>
  );
}
