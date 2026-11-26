import { useCallback, useEffect, useRef, useState } from 'react';
import { listDevices, type DeviceLists } from '../lib/devices';
import { getSettings, updateSettings } from '../lib/settings';
import type { LobbyResult } from './Lobby';

export interface MediaChoice {
  videoDeviceId?: string;
  audioDeviceId?: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
}

interface Props {
  session: LobbyResult;
  onJoin: (choice: MediaChoice) => void;
  onBack: () => void;
}

export function PreJoin({ session, onJoin, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceLists>({ cameras: [], mics: [], speakers: [] });
  const [videoId, setVideoId] = useState<string | undefined>(getSettings().cameraId);
  const [audioId, setAudioId] = useState<string | undefined>(getSettings().micId);
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const meterRef = useRef<HTMLDivElement>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async (v?: string, a?: string) => {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: v ? { deviceId: { exact: v } } : true,
        audio: a ? { deviceId: { exact: a } } : true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setDevices(await listDevices()); // labels only populate after permission is granted
      setError(null);
    } catch (e) {
      const name = (e as DOMException).name;
      // A remembered device may have been unplugged; fall back to the system defaults once.
      if ((name === 'OverconstrainedError' || name === 'NotFoundError') && (v || a)) {
        setVideoId(undefined);
        setAudioId(undefined);
        updateSettings({ cameraId: undefined, micId: undefined });
        return start();
      }
      setError(
        name === 'NotAllowedError'
          ? 'Camera/microphone access was denied. Allow it in your system settings and retry.'
          : name === 'NotReadableError'
            ? 'Your camera or microphone is being used by another app. Close it and retry.'
            : 'Could not open your camera or microphone.',
      );
    }
  }, []);

  useEffect(() => {
    void start(getSettings().cameraId, getSettings().micId);
    return stop;
  }, [start]);

  // Simple mic level meter so the user can confirm their mic works.
  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const level = data.reduce((s, n) => s + n, 0) / data.length / 255;
      if (meterRef.current) meterRef.current.style.width = `${Math.min(100, level * 300)}%`; // direct DOM write: no re-render at 60fps
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [devices.mics.length, audioId]);

  const join = () => {
    stop(); // release devices so LiveKit can open them
    updateSettings({ cameraId: videoId, micId: audioId });
    onJoin({ videoDeviceId: videoId, audioDeviceId: audioId, videoEnabled: videoOn, audioEnabled: audioOn });
  };

  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    void navigator.clipboard?.writeText(session.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <main className="auth">
      <section className="join-card" aria-labelledby="join-title">
        <div className="join-preview">
          <div className="preview">
            <video ref={videoRef} autoPlay muted playsInline style={{ visibility: videoOn ? 'visible' : 'hidden' }} />
            {!videoOn && (
              <div className="cam-off">
                <span className="avatar">{(session.displayName.trim()[0] ?? '?').toUpperCase()}</span>
                <span>Camera is off</span>
              </div>
            )}
            <div className="preview-controls">
              <button
                type="button"
                className={`round-btn${audioOn ? '' : ' off'}`}
                onClick={() => setAudioOn((v) => !v)}
                aria-pressed={!audioOn}
                aria-label={audioOn ? 'Mute microphone' : 'Unmute microphone'}
                title={audioOn ? 'Mute' : 'Unmute'}
              >
                {audioOn ? <MicIcon /> : <MicOffIcon />}
              </button>
              <button
                type="button"
                className={`round-btn${videoOn ? '' : ' off'}`}
                onClick={() => setVideoOn((v) => !v)}
                aria-pressed={!videoOn}
                aria-label={videoOn ? 'Turn camera off' : 'Turn camera on'}
                title={videoOn ? 'Stop video' : 'Start video'}
              >
                {videoOn ? <CamIcon /> : <CamOffIcon />}
              </button>
            </div>
          </div>
          <div className="meter-row" aria-label="Microphone level">
            <MicIcon size={14} />
            <div className="meter"><div ref={meterRef} /></div>
          </div>
        </div>

        <div className="join-side">
          <header>
            <h2 id="join-title">Ready to join?</h2>
            <p className="join-meta">
              <span className="pill">{session.role === 'interviewer' ? 'Interviewer' : 'Candidate'}</span>
              <span>{session.displayName}</span>
            </p>
            <button type="button" className="code-chip" onClick={copyCode} title="Copy room code">
              <span className="code-label">Room</span>
              <code>{session.roomCode}</code>
              <span className="code-copy">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </header>

          <label className="glass-field">
            <span>Camera</span>
            <select value={videoId ?? ''} onChange={(e) => { setVideoId(e.target.value); void start(e.target.value, audioId); }}>
              {devices.cameras.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
            </select>
          </label>
          <label className="glass-field">
            <span>Microphone</span>
            <select value={audioId ?? ''} onChange={(e) => { setAudioId(e.target.value); void start(videoId, e.target.value); }}>
              {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
            </select>
          </label>

          {error && (
            <div className="glass-error" role="alert">
              <p>{error}</p>
              <button type="button" className="glass-ghost small" onClick={() => void start(videoId, audioId)}>Retry</button>
            </div>
          )}

          <div className="join-actions">
            <button type="button" className="glass-ghost" onClick={onBack}>Back</button>
            <button type="button" className="glass-cta" disabled={!!error} onClick={join}>Join now</button>
          </div>
        </div>
      </section>
    </main>
  );
}

type IconProps = { size?: number };
const svg = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });
const MicIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
const MicOffIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M3 3l18 18M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></svg>
);
const CamIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><rect x="3" y="6" width="13" height="12" rx="3" /><path d="M16 10.5l5-3v9l-5-3" /></svg>
);
const CamOffIcon = ({ size = 20 }: IconProps) => (
  <svg {...svg(size)}><path d="M3 3l18 18M7 6h6a3 3 0 0 1 3 3v3.5M16 10.5l5-3v9l-3.5-2.1M3 8v7a3 3 0 0 0 3 3h7" /></svg>
);
