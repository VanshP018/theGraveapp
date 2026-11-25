import { useEffect, useState } from 'react';

interface Props {
  onPick: (id: string) => void;
  onCancel: () => void;
}

export function ScreenPicker({ onPick, onCancel }: Props) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [tab, setTab] = useState<'screen' | 'window'>('screen');
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const status = await window.tgi.screen.status();
      if (!alive) return;
      if (status !== 'granted') setBlocked(true);
      setSources(await window.tgi.screen.sources());
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const shown = sources.filter((s) => s.kind === tab);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Share your screen</h3>

        {blocked && (
          <div className="notice">
            Screen Recording permission is off. Turn it on for this app in System Settings, then restart the app.
            <button onClick={() => void window.tgi.screen.openSettings()}>Open settings</button>
          </div>
        )}

        <div className="row">
          <button className={tab === 'screen' ? 'primary' : ''} onClick={() => setTab('screen')}>Entire screen</button>
          <button className={tab === 'window' ? 'primary' : ''} onClick={() => setTab('window')}>Window</button>
        </div>

        <div className="sources">
          {loading && <p className="muted">Loading…</p>}
          {!loading && shown.length === 0 && <p className="muted">Nothing to share here.</p>}
          {shown.map((s) => (
            <button key={s.id} className="source" onClick={() => onPick(s.id)}>
              <img src={s.thumbnail} alt="" />
              <span>{s.name}</span>
            </button>
          ))}
        </div>

        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
