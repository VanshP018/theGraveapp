import { useEffect, useRef, useState } from 'react';
import {
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import type { ChatMessage, RunEvent } from '@tgi/shared';
import { fetchLastRun, fetchMessages, joinRoom, runCode, sendMessage } from '../lib/api';
import { Chat } from '../components/Chat';
import { CodeEditor } from '../components/CodeEditor';
import { ScreenPicker } from '../components/ScreenPicker';
import type { LobbyResult } from './Lobby';
import type { MediaChoice } from './PreJoin';

interface Props {
  session: LobbyResult;
  media: MediaChoice;
  onLeave: () => void;
}

function Tile({ participant, source = Track.Source.Camera }: { participant: Participant; source?: Track.Source }) {
  const isScreen = source === Track.Source.ScreenShare;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const attach = () => {
      const cam = participant.getTrackPublication(source)?.track;
      const mic = isScreen ? undefined : participant.getTrackPublication(Track.Source.Microphone)?.track;
      if (videoRef.current) {
        if (cam) cam.attach(videoRef.current);
        else videoRef.current.srcObject = null;
      }
      // Never play our own mic back to ourselves.
      if (!participant.isLocal && mic && audioRef.current) mic.attach(audioRef.current);
    };
    attach();
    const events = [
      ParticipantEvent.TrackSubscribed,
      ParticipantEvent.TrackUnsubscribed,
      ParticipantEvent.TrackMuted,
      ParticipantEvent.TrackUnmuted,
      ParticipantEvent.LocalTrackPublished,
      ParticipantEvent.LocalTrackUnpublished,
    ] as const;
    events.forEach((e) => participant.on(e, attach));
    return () => events.forEach((e) => participant.off(e, attach));
  }, [participant, source, isScreen]);

  const camOn = isScreen ? participant.isScreenShareEnabled : participant.isCameraEnabled;
  const micOn = participant.isMicrophoneEnabled;

  return (
    <div className="tile">
      <video ref={videoRef} autoPlay playsInline muted={participant.isLocal || isScreen} style={{ visibility: camOn ? 'visible' : 'hidden' }} />
      {!camOn && <div className="cam-off">{participant.name || participant.identity}</div>}
      <audio ref={audioRef} autoPlay />
      <div className="nameplate">
        {participant.name || participant.identity}
        {participant.isLocal ? ' (you)' : ''} {isScreen ? '— screen' : micOn ? '' : '🔇'}
      </div>
      {isScreen && <div className="badge">Sharing</div>}
    </div>
  );
}

export function Call({ session, media, onLeave }: Props) {
  const roomRef = useRef<Room | null>(null);
  const tokenRef = useRef<string>('');
  const chatOpenRef = useRef(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(media.audioEnabled);
  const [camOn, setCamOn] = useState(media.videoEnabled);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [token, setToken] = useState('');
  const [run, setRun] = useState<RunEvent | null>(null);
  const [unread, setUnread] = useState(0);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const addRef = useRef<(m: ChatMessage[]) => void>(() => {});
  const applyRunRef = useRef<(e: RunEvent) => void>(() => {});
  const [, force] = useState(0);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let cancelled = false;

    // Messages can arrive from three places (POST response, data channel, history); dedupe by id.
    const addMessages = (incoming: ChatMessage[]) =>
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
      });
    addRef.current = addMessages;

    // The same run arrives via data channel and the POST response; never let a late 'running' undo a result.
    const applyRun = (e: RunEvent) =>
      setRun((prev) => (prev && prev.id === e.id && prev.status !== 'running' && e.status === 'running' ? prev : e));
    applyRunRef.current = applyRun;

    const refresh = () => {
      setParticipants([room.localParticipant, ...Array.from(room.remoteParticipants.values())]);
      setSharing(room.localParticipant.isScreenShareEnabled);
      force((n) => n + 1);
    };

    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
      .on(RoomEvent.Reconnected, () => setStatus('connected'))
      .on(RoomEvent.DataReceived, (payload: Uint8Array, _p, _k, topic?: string) => {
        try {
          const data = JSON.parse(new TextDecoder().decode(payload));
          if (topic === 'chat') {
            addMessages([data as ChatMessage]);
            if (!chatOpenRef.current) setUnread((n) => n + 1);
          } else if (topic === 'run') {
            applyRun(data as RunEvent);
          }
        } catch {
          /* ignore malformed packets */
        }
      })
      .on(RoomEvent.Disconnected, () => !cancelled && onLeave())
      .on(RoomEvent.TrackSubscribed, (_t: RemoteTrack, _p: RemoteTrackPublication) => refresh());

    (async () => {
      try {
        const { token, livekitUrl } = await joinRoom(session);
        if (cancelled) return;
        tokenRef.current = token;
        setToken(token);
        await room.connect(livekitUrl, token);
        if (cancelled) return;
        await room.localParticipant.setMicrophoneEnabled(media.audioEnabled, media.audioDeviceId ? { deviceId: media.audioDeviceId } : undefined);
        await room.localParticipant.setCameraEnabled(media.videoEnabled, media.videoDeviceId ? { deviceId: media.videoDeviceId } : undefined);
        setStatus('connected');
        refresh();
        fetchLastRun(session.roomCode, token).then((e) => e && applyRun(e)).catch(() => { /* best-effort */ });
        fetchMessages(session.roomCode, token).then(addMessages).catch(() => { /* history is best-effort */ });
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setError(e instanceof Error ? e.message : 'Could not join the call');
        }
      }
    })();

    return () => {
      cancelled = true;
      void room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = async () => {
    const next = !micOn;
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };
  const toggleCam = async () => {
    const next = !camOn;
    await roomRef.current?.localParticipant.setCameraEnabled(next);
    setCamOn(next);
  };

  const toggleChat = () => {
    const next = !chatOpen;
    chatOpenRef.current = next;
    setChatOpen(next);
    if (next) setUnread(0);
  };
  const send = async (text: string) => {
    const saved = await sendMessage(session.roomCode, tokenRef.current, text);
    addRef.current([saved]);
  };

  const handleRun = async (stdin: string) => {
    applyRunRef.current(await runCode(session.roomCode, tokenRef.current, stdin));
  };

  const startShare = async (sourceId: string) => {
    setPicking(false);
    setShareError(null);
    try {
      await window.tgi.screen.select(sourceId);
      await roomRef.current?.localParticipant.setScreenShareEnabled(true, {
        audio: window.tgi.platform === 'win32', // system audio only works on Windows
        resolution: { width: 1920, height: 1080, frameRate: 15 },
        contentHint: 'detail', // text-heavy content (code): favour sharpness over frame rate
      });
    } catch (e) {
      await window.tgi.screen.select(null);
      setShareError(e instanceof Error ? e.message : 'Could not start screen share');
    }
  };
  const stopShare = async () => {
    await roomRef.current?.localParticipant.setScreenShareEnabled(false);
  };

  const sharer = participants.find((p) => p.isScreenShareEnabled);
  const someoneElseSharing = !!sharer && !sharer.isLocal;

  if (status === 'error') {
    return (
      <main className="center">
        <p className="error">{error}</p>
        <button onClick={onLeave}>Back</button>
      </main>
    );
  }

  return (
    <div className="call">
      <header>
        <span>Room <code>{session.roomCode}</code></span>
        <button onClick={() => void navigator.clipboard.writeText(session.roomCode)}>Copy code</button>
        {status !== 'connected' && <span className="muted">{status}…</span>}
      </header>

      {shareError && <p className="error" style={{ padding: '0 16px' }}>{shareError}</p>}

      <div className="body-row">
      {codeOpen && token ? (
        <section className="stage">
          <div className="main">
            <CodeEditor roomCode={session.roomCode} token={token} displayName={session.displayName} role={session.role} run={run} onRun={handleRun} />
          </div>
          <div className="strip">
            {sharer && <Tile key={`${sharer.identity}-screen`} participant={sharer} source={Track.Source.ScreenShare} />}
            {participants.map((p) => <Tile key={p.identity} participant={p} />)}
          </div>
        </section>
      ) : sharer ? (
        <section className="stage">
          <div className="main"><Tile key={`${sharer.identity}-screen`} participant={sharer} source={Track.Source.ScreenShare} /></div>
          <div className="strip">{participants.map((p) => <Tile key={p.identity} participant={p} />)}</div>
        </section>
      ) : (
        <section className={`grid n${Math.min(participants.length, 4)}`}>
          {participants.map((p) => <Tile key={p.identity} participant={p} />)}
        </section>
      )}
      {chatOpen && <Chat messages={messages} selfName={session.displayName} onSend={send} onClose={toggleChat} />}
      </div>

      <footer>
        <button onClick={toggleMic}>{micOn ? 'Mute' : 'Unmute'}</button>
        <button onClick={toggleCam}>{camOn ? 'Stop video' : 'Start video'}</button>
        {sharing ? (
          <button className="primary" onClick={stopShare}>Stop sharing</button>
        ) : (
          <button disabled={someoneElseSharing} title={someoneElseSharing ? 'Someone else is sharing' : ''} onClick={() => setPicking(true)}>
            Share screen
          </button>
        )}
        <button className={codeOpen ? 'primary' : ''} onClick={() => setCodeOpen((v) => !v)}>Code</button>
        <button onClick={toggleChat}>Chat{unread > 0 && <span className="unread">{unread}</span>}</button>
        <button className="danger" onClick={onLeave}>Leave</button>
      </footer>
      {picking && <ScreenPicker onPick={startShare} onCancel={() => setPicking(false)} />}
    </div>
  );
}
