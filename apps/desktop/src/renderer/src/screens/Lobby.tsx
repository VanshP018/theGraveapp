import { useState } from 'react';
import type { Role } from '@tgi/shared';
import { createRoom } from '../lib/api';

export interface LobbyResult {
  roomCode: string;
  displayName: string;
  role: Role;
}

export function Lobby({ onContinue }: { onContinue: (r: LobbyResult) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startInterview = async () => {
    setBusy(true);
    setError(null);
    try {
      const { roomCode } = await createRoom();
      onContinue({ roomCode, displayName: name.trim(), role: 'interviewer' });
    } catch {
      setError('Could not reach the server. Is the API running?');
    } finally {
      setBusy(false);
    }
  };

  const nameOk = name.trim().length > 0;

  return (
    <main className="center">
      <h1>theGraveinter</h1>
      <label>
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
      </label>

      <button disabled={!nameOk || busy} onClick={startInterview}>
        Start an interview
      </button>

      <div className="divider">or join one</div>

      <label>
        Room code
        <input value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="a1b2c3d4" />
      </label>
      <button
        disabled={!nameOk || !code}
        onClick={() => onContinue({ roomCode: code, displayName: name.trim(), role: 'candidate' })}
      >
        Join as candidate
      </button>

      {error && <p className="error">{error}</p>}
    </main>
  );
}
