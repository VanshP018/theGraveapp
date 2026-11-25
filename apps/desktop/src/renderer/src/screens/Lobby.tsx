import { useState } from 'react';
import type { Role } from '@tgi/shared';
import { createRoom } from '../lib/api';
import { getSettings, updateSettings } from '../lib/settings';
import { Settings } from '../components/Settings';
import { Aurora } from '../components/Aurora';
import logo from '../assets/grave-logo.png';

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
  const [mode, setMode] = useState<'start' | 'join'>('start');

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'start') {
      if (trimmedName && !busy) void startInterview();
    } else if (trimmedName && roomCode) {
      proceed({ roomCode, displayName: trimmedName, role: 'candidate' });
    }
  };

  return (
    <main className="auth">
      <Aurora />
      <button className="glass-icon-btn auth-settings" onClick={() => setShowSettings(true)} aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </button>

      <form className="glass-card auth-card" onSubmit={submit}>
        <img className="auth-logo" src={logo} alt="GRAVE" draggable={false} />
        <p className="auth-sub">{mode === 'start' ? 'Host a technical interview' : 'Join an interview as a candidate'}</p>

        {notice && <p className="glass-note">{notice}</p>}

        <div className="seg" role="tablist" aria-label="Choose how to continue">
          <span className="seg-thumb" style={{ transform: `translateX(${mode === 'start' ? 0 : 100}%)` }} aria-hidden />
          <button type="button" role="tab" aria-selected={mode === 'start'} className={mode === 'start' ? 'on' : ''} onClick={() => setMode('start')}>
            Interviewer
          </button>
          <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>
            Candidate
          </button>
        </div>

        <label className="glass-field">
          <span>Your name</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoFocus />
        </label>

        {mode === 'join' && (
          <label className="glass-field">
            <span>Room code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="a1b2c3d4" autoCapitalize="off" spellCheck={false} />
          </label>
        )}

        <button
          type="submit"
          className="glass-cta"
          disabled={mode === 'start' ? !trimmedName || busy : !trimmedName || !roomCode}
        >
          {mode === 'start' ? (busy ? 'Starting…' : 'Start interview') : 'Join interview'}
        </button>

        {error && <p className="glass-error" role="alert">{error}</p>}
      </form>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </main>
  );
}
