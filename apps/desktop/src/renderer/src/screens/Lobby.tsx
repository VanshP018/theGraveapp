import { useState } from 'react';
import type { Role } from '@tgi/shared';
import { createRoom } from '../lib/api';
import { getSettings, updateSettings } from '../lib/settings';
import { Settings } from '../components/Settings';

export interface LobbyResult {
  roomCode: string;
  displayName: string;
  role: Role;
}

export function Lobby({ onContinue, notice }: { onContinue: (r: LobbyResult) => void; notice?: string }) {
  const [name, setName] = useState(getSettings().displayName);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const trimmedName = name.trim();
  const roomCode = code.trim().toLowerCase();

  const proceed = (result: LobbyResult) => {
    updateSettings({ displayName: result.displayName });
    onContinue(result);
  };

  const startInterview = async () => {
    setBusy(true);
    setError(null);
    try {
      const { roomCode } = await createRoom();
      proceed({ roomCode, displayName: trimmedName, role: 'interviewer' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the interview');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="center">
      <div className="title-row">
        <h1>theGraveinter</h1>
        <button onClick={() => setShowSettings(true)} aria-label="Settings">⚙ Settings</button>
      </div>

      {notice && <p className="banner">{notice}</p>}

      <label>
        Your name
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
      </label>

      <button disabled={!trimmedName || busy} onClick={startInterview}>
        {busy ? 'Starting…' : 'Start an interview'}
      </button>

      <div className="divider">or join one</div>

      <label>
        Room code
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="a1b2c3d4" />
      </label>
      <button disabled={!trimmedName || !roomCode} onClick={() => proceed({ roomCode, displayName: trimmedName, role: 'candidate' })}>
        Join as candidate
      </button>

      {error && <p className="error">{error}</p>}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </main>
  );
}
