import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  DisconnectReason,
  MediaDeviceFailure,
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import type { ChatMessage, RunEvent } from '@tgi/shared';
import { fetchLastRun, fetchMessages, joinRoom, runCode, sendMessage, setEditorOpen } from '../lib/api';
import { Chat } from '../components/Chat';
// Monaco is only needed once the editor is opened.
const CodeEditor = lazy(() => import('../components/CodeEditor').then((m) => ({ default: m.CodeEditor })));
import { ScreenPicker } from '../components/ScreenPicker';
import { Settings } from '../components/Settings';
import type { LobbyResult } from './Lobby';
import type { MediaChoice } from './PreJoin';

interface Props {
  session: LobbyResult;
  media: MediaChoice;
  onLeave: () => void;
}

function deviceMessage(e: unknown, what: string): string {
  switch (MediaDeviceFailure.getFailure(e)) {
    case MediaDeviceFailure.PermissionDenied:
      return `Access to your ${what} is blocked. Allow it in your system settings.`;
    case MediaDeviceFailure.NotFound:
      return `No ${what} was found. Check that it is plugged in.`;
    case MediaDeviceFailure.DeviceInUse:
      return `Your ${what} is being used by another app.`;
    default:
      return `Your ${what} stopped working.`;
  }
}

function Tile({ participant, source = Track.Source.Camera }: { participant: Participant; source?: Track.Source }) {
  const isScreen = source === Track.Source.ScreenShare;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    const onSpeaking = () => bump((n) => n + 1);
    participant.on(ParticipantEvent.IsSpeakingChanged, onSpeaking);
    return () => {
      participant.off(ParticipantEvent.IsSpeakingChanged, onSpeaking);
    };
  }, [participant]);

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
    <div className={`tile${participant.isSpeaking && !isScreen ? ' speaking' : ''}`}>
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
  const [status, setStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error'>('connecting');
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
  const [notice, setNotice] = useState<string | null>(null);
  const [disconnectNote, setDisconnectNote] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selfId, setSelfId] = useState<string>();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const addRef = useRef<(m: ChatMessage[]) => void>(() => {});
  const applyRunRef = useRef<(e: RunEvent) => void>(() => {});
  const [, force] = useState(0);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let cancelled = false;
    setStatus('connecting');
    setError(null);
    setDisconnectNote('');

    // Messages can arrive from three places (POST response, data channel, history); dedupe by id.
    const addMessages = (incoming: ChatMessage[]) =>
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
      });
    addRef.current = addMessages;

    // Whether the shared code view is open is room state, so it is identical for everyone.
    const applyRoomState = () => {
      try {
        setCodeOpen(JSON.parse(room.metadata || '{}').editorOpen === true);
      } catch {
        /* metadata we did not write; ignore */
      }
    };

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
      .on(RoomEvent.RoomMetadataChanged, applyRoomState)
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
      .on(RoomEvent.MediaDevicesError, (e: Error) => setNotice(deviceMessage(e, 'camera or microphone')))
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (cancelled) return; // we closed it ourselves (leaving or rejoining)
        setDisconnectNote(
          reason === DisconnectReason.DUPLICATE_IDENTITY
            ? 'You joined this interview from another window, so this one was disconnected.'
            : reason === DisconnectReason.PARTICIPANT_REMOVED
              ? 'You were removed from the interview.'
              : reason === DisconnectReason.ROOM_DELETED
                ? 'The interview was ended.'
                : 'The connection to the call was lost.',
        );
        setStatus('disconnected');
      })
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
        setSelfId(room.localParticipant.identity);
        setStatus('connected');
        applyRoomState();
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
  }, [attempt]);

  const toggleMic = async () => {
    const next = !micOn;
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch (e) {
      setNotice(deviceMessage(e, 'microphone'));
    }
  };
  const toggleCam = async () => {
    const next = !camOn;
    try {
      await roomRef.current?.localParticipant.setCameraEnabled(next);
      setCamOn(next);
    } catch (e) {
      setNotice(deviceMessage(e, 'camera'));
    }
  };

  const toggleCode = async () => {
    const next = !codeOpen;
    setCodeOpen(next); // optimistic; the room-state event confirms it for everyone
    try {
      await setEditorOpen(session.roomCode, tokenRef.current, next);
    } catch (e) {
      setCodeOpen(!next);
      setShareError(e instanceof Error ? e.message : 'Could not change the shared view');
    }
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
        <button className="primary" onClick={() => setAttempt((a) => a + 1)}>Try again</button>
        <button onClick={onLeave}>Back</button>
      </main>
    );
  }

  return (
    <div className="call">
      <header>
        <span>Room <code>{session.roomCode}</code></span>
        <button onClick={() => void navigator.clipboard.writeText(session.roomCode)}>Copy code</button>
        {status === 'connecting' && <span className="muted">Connecting…</span>}
        <button style={{ marginLeft: 'auto' }} onClick={() => setShowSettings(true)}>⚙</button>
      </header>

      {status === 'reconnecting' && <div className="banner warn">Connection lost. Trying to reconnect…</div>}
      {notice && (
        <div className="banner warn">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {shareError && (
        <div className="banner err">
          <span>{shareError}</span>
          <button onClick={() => setShareError(null)}>Dismiss</button>
        </div>
      )}

      <div className="body-row">
      {codeOpen && token ? (
        <section className="stage">
          <div className="main">
            <Suspense fallback={<p className="muted" style={{ padding: 16 }}>Loading editor…</p>}>
            <CodeEditor roomCode={session.roomCode} token={token} displayName={session.displayName} role={session.role} run={run} onRun={handleRun} />
            </Suspense>
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
      {chatOpen && <Chat messages={messages} selfName={session.displayName} selfId={selfId} onSend={send} onClose={toggleChat} />}
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
        <button className={codeOpen ? 'primary' : ''} onClick={toggleCode}>Code</button>
        <button onClick={toggleChat}>Chat{unread > 0 && <span className="unread">{unread}</span>}</button>
        <button className="danger" onClick={() => setConfirmLeave(true)}>Leave</button>
      </footer>
      {picking && <ScreenPicker onPick={startShare} onCancel={() => setPicking(false)} />}
      {showSettings && <Settings inCall onClose={() => setShowSettings(false)} />}

      {confirmLeave && (
        <div className="modal-backdrop" onClick={() => setConfirmLeave(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Leave the interview?</h3>
            <p className="muted">The others stay in the room. You can rejoin with the same code.</p>
            <div className="row">
              <button onClick={() => setConfirmLeave(false)}>Stay</button>
              <button className="danger" onClick={onLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}

      {status === 'disconnected' && (
        <div className="modal-backdrop">
          <div className="modal small">
            <h3>Disconnected</h3>
            <p>{disconnectNote}</p>
            <div className="row">
              <button className="primary" onClick={() => setAttempt((a) => a + 1)}>Rejoin</button>
              <button onClick={onLeave}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
