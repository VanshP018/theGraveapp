import { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import type { Role, RunEvent } from '@tgi/shared';
import { LANGUAGES, monaco } from '../lib/monaco';

interface Props {
  roomCode: string;
  token: string;
  displayName: string;
  role: Role;
  /** Latest run in this room, shared by everyone. */
  run: RunEvent | null;
  onRun: (stdin: string) => Promise<void>;
}

const COLORS: Record<Role, string> = { interviewer: '#4f8cff', candidate: '#ffb454' };
const COLLAB_URL = 'ws://localhost:3001/collab';

type Conn = 'connecting' | 'connected' | 'disconnected';

/** y-monaco styles remote cursors with per-client CSS classes; generate them from awareness state. */
function cursorCss(states: Map<number, Record<string, any>>, selfId: number): string {
  let css = '';
  states.forEach((state, clientId) => {
    if (clientId === selfId || !state.user) return;
    const color = String(state.user.color).replace(/[^#\w]/g, '');
    const name = JSON.stringify(String(state.user.name ?? '').replace(/[\u0000-\u001f]/g, ''));
    css += `
.yRemoteSelection-${clientId} { background-color: ${color}55; }
.yRemoteSelectionHead-${clientId} { position: absolute; border-left: 2px solid ${color}; height: 100%; box-sizing: border-box; }
.yRemoteSelectionHead-${clientId}::after { content: ${name}; position: absolute; top: -1.4em; left: -2px; background: ${color}; color: #fff; font-size: 11px; line-height: 1.3; padding: 0 5px; border-radius: 3px 3px 3px 0; white-space: nowrap; pointer-events: none; }`;
  });
  return css;
}

export function CodeEditor({ roomCode, token, displayName, role, run, onRun }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<Y.Map<unknown> | null>(null);
  const [language, setLanguage] = useState('javascript');
  const [conn, setConn] = useState<Conn>('connecting');
  const [stdin, setStdin] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // A 'running' event that never finished (e.g. connection lost mid-run) must not lock the button forever.
  const running = requesting || (run?.status === 'running' && Date.now() - new Date(run.at).getTime() < 30_000);

  const handleRun = async () => {
    setRequesting(true);
    setRunError(null);
    try {
      await onRun(stdin);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Could not run the code');
    } finally {
      setRequesting(false);
    }
  };

  useEffect(() => {
    const doc = new Y.Doc();
    // BroadcastChannel would sync same-machine windows directly and bypass the server; keep the server the only path.
    const provider = new WebsocketProvider(COLLAB_URL, roomCode, doc, { params: { token }, disableBc: true });
    const yText = doc.getText('code');
    const meta = doc.getMap('meta');
    metaRef.current = meta;

    const editor = monaco.editor.create(containerRef.current!, {
      value: '',
      language: 'javascript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      scrollBeyondLastLine: false,
      tabSize: 2,
    });
    const model = editor.getModel()!;
    const binding = new MonacoBinding(yText, model, new Set([editor]), provider.awareness);

    provider.awareness.setLocalStateField('user', { name: displayName, color: COLORS[role] });

    const style = document.createElement('style');
    document.head.appendChild(style);
    const onAwareness = () => {
      style.textContent = cursorCss(provider.awareness.getStates(), doc.clientID);
    };
    provider.awareness.on('change', onAwareness);

    const onMeta = () => {
      const lang = String(meta.get('language') ?? 'javascript');
      setLanguage(lang);
      monaco.editor.setModelLanguage(model, lang);
    };
    meta.observe(onMeta);
    onMeta();

    const onStatus = ({ status }: { status: Conn }) => setConn(status);
    provider.on('status', onStatus);

    return () => {
      provider.awareness.off('change', onAwareness);
      meta.unobserve(onMeta);
      provider.off('status', onStatus);
      binding.destroy();
      editor.dispose();
      model.dispose();
      provider.destroy();
      doc.destroy();
      style.remove();
      metaRef.current = null;
    };
  }, [roomCode, token, displayName, role]);

  return (
    <div className="editor">
      <div className="editor-bar">
        <label className="inline">
          Language
          <select value={language} onChange={(e) => metaRef.current?.set('language', e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <button className="primary" disabled={running || conn !== 'connected'} onClick={handleRun}>
          {running ? 'Running…' : '▶ Run'}
        </button>
        <button onClick={() => setShowInput((v) => !v)}>{showInput ? 'Hide input' : 'Input'}</button>
        <span className={`conn ${conn}`}>{conn === 'connected' ? 'Live' : conn === 'connecting' ? 'Connecting…' : 'Offline, reconnecting…'}</span>
      </div>
      <div ref={containerRef} className="editor-surface" />
      {showInput && (
        <textarea
          className="stdin"
          value={stdin}
          maxLength={10_000}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Program input (stdin)"
        />
      )}
      <OutputPanel run={run} running={running} error={runError} />
    </div>
  );
}

function OutputPanel({ run, running, error }: { run: RunEvent | null; running: boolean; error: string | null }) {
  const result = run?.result;
  let note: string | null = null;
  if (result?.timedOut) note = 'Stopped: the program ran for too long (15s limit).';
  else if (result && result.exitCode === null) note = 'Stopped: the program used too much memory or produced too much output.';
  else if (result?.truncated) note = 'Output was cut off at the size limit.';

  return (
    <div className="output">
      <div className="output-head">
        <strong>Output</strong>
        {run && run.status !== 'running' && (
          <span className="muted">
            {run.by} · {run.language}
            {result ? ` · ${(result.durationMs / 1000).toFixed(1)}s · exit ${result.exitCode ?? '—'}` : ''}
          </span>
        )}
        {running && run && <span className="muted">{run.by} is running the code…</span>}
      </div>
      <pre className="output-body">
        {error && <span className="err">{error}{'\n'}</span>}
        {run?.status === 'error' && <span className="err">{run.error}{'\n'}</span>}
        {result?.stdout}
        {result?.stderr && <span className="err">{result.stderr}</span>}
        {note && <span className="note">{'\n'}{note}</span>}
        {!run && !error && <span className="muted">Press Run to see the output here. Everyone in the room sees it.</span>}
      </pre>
    </div>
  );
}
