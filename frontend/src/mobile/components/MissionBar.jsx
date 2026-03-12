import React, { useCallback } from 'react';
import { Save, FolderOpen, Plus, Trash2, Copy } from 'lucide-react';
import useDroneStore from '../../store/droneStore';

export default function MissionBar() {
  const savedMissions = useDroneStore((s) => s.savedMissions);
  const activeMissionId = useDroneStore((s) => s.activeMissionId);
  const saveMission = useDroneStore((s) => s.saveMission);
  const loadMission = useDroneStore((s) => s.loadMission);
  const deleteMission = useDroneStore((s) => s.deleteMission);
  const newMission = useDroneStore((s) => s.newMission);
  const addAlert = useDroneStore((s) => s.addAlert);

  const handleSave = useCallback(() => {
    saveMission();
    addAlert('Mission saved', 'success');
  }, [saveMission, addAlert]);

  const handleNew = useCallback(() => {
    newMission();
    addAlert('New mission created', 'info');
  }, [newMission, addAlert]);

  const btn = 'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-700/30 bg-gray-900/60 text-[11px] font-medium text-gray-300 active:scale-95 transition-transform shrink-0';

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
      <button onClick={handleNew} className={btn}>
        <Plus size={12} /> New
      </button>
      <button onClick={handleSave} className={btn}>
        <Save size={12} /> Save
      </button>

      {/* Saved mission chips */}
      {savedMissions.map((m) => (
        <button
          key={m.id}
          onClick={() => loadMission(m.id)}
          className={`${btn} ${
            activeMissionId === m.id ? 'border-cyan-500/40 text-cyan-400' : ''
          }`}
        >
          <FolderOpen size={12} />
          <span className="max-w-[80px] truncate">{m.name || 'Unnamed'}</span>
        </button>
      ))}
    </div>
  );
}
