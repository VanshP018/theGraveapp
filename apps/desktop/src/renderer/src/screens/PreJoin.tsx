import { useCallback, useEffect, useRef, useState } from 'react';
import { listDevices, type DeviceLists } from '../lib/devices';
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
  const [videoId, setVideoId] = useState<string>();
  const [audioId, setAudioId] = useState<string>();
  const [videoOn, setVideoOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

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
      setError(
        name === 'NotAllowedError'
          ? 'Camera/microphone access was denied. Allow it in your system settings and retry.'
          : 'Could not open your camera or microphone.',
      );
    }
  }, []);

  useEffect(() => {
    void start();
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
      setLevel(data.reduce((s, n) => s + n, 0) / data.length / 255);
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
    onJoin({ videoDeviceId: videoId, audioDeviceId: audioId, videoEnabled: videoOn, audioEnabled: audioOn });
  };

  return (
    <main className="center">
      <h2>Ready to join?</h2>
      <p className="muted">
        Room <code>{session.roomCode}</code> · {session.displayName} ({session.role})
      </p>

      <div className="preview">
        <video ref={videoRef} autoPlay muted playsInline style={{ visibility: videoOn ? 'visible' : 'hidden' }} />
        {!videoOn && <div className="cam-off">Camera off</div>}
      </div>

      <div className="meter"><div style={{ width: `${Math.min(100, level * 300)}%` }} /></div>

      <div className="row">
        <button onClick={() => setAudioOn((v) => !v)}>{audioOn ? 'Mute' : 'Unmute'}</button>
        <button onClick={() => setVideoOn((v) => !v)}>{videoOn ? 'Stop video' : 'Start video'}</button>
      </div>

      <label>
        Camera
        <select value={videoId ?? ''} onChange={(e) => { setVideoId(e.target.value); void start(e.target.value, audioId); }}>
          {devices.cameras.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
        </select>
      </label>
      <label>
        Microphone
        <select value={audioId ?? ''} onChange={(e) => { setAudioId(e.target.value); void start(videoId, e.target.value); }}>
          {devices.mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
        </select>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="row">
        <button onClick={onBack}>Back</button>
        <button className="primary" disabled={!!error} onClick={join}>Join now</button>
      </div>
    </main>
  );
}
