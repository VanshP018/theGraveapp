import { useState } from 'react';
import { checkServer } from '../lib/api';
import { DEFAULT_SERVER, normalizeServerUrl, updateSettings, useSettings } from '../lib/settings';

export function Settings({ inCall = false, onClose }: { inCall?: boolean; onClose: () => void }) {
  const s = useSettings();
  const [server, setServer] = useState(s.serverUrl);
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const normalized = normalizeServerUrl(server);
  const changed = normalized !== null && normalized !== s.serverUrl;

  const runTest = async () => {
    if (!normalized) return;
    setTest('testing');
    setTest((await checkServer(normalized)) ? 'ok' : 'fail');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>

        <label>
          Server address
          <input
            value={server}
            disabled={inCall}
            onChange={(e) => { setServer(e.target.value); setTest('idle'); }}
            placeholder={DEFAULT_SERVER}
          />
        </label>
        {inCall && <p className="muted">The server can only be changed before joining a call.</p>}
        {!inCall && server && !normalized && <p className="error">Enter an address like http://192.168.1.20:3001</p>}
        {!inCall && (
          <div className="row">
            <button disabled={!normalized || test === 'testing'} onClick={runTest}>Test connection</button>
            <button className="primary" disabled={!changed} onClick={() => normalized && updateSettings({ serverUrl: normalized })}>
              Save address
            </button>
          </div>
        )}
        {test === 'ok' && <p className="ok">Connected to the server.</p>}
        {test === 'fail' && <p className="error">Could not reach that server.</p>}

        <label>
          Theme
          <select value={s.theme} onChange={(e) => updateSettings({ theme: e.target.value as 'dark' | 'light' })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <label>
          Editor font size ({s.editorFontSize}px)
          <input
            type="range" min={10} max={28} value={s.editorFontSize}
            onChange={(e) => updateSettings({ editorFontSize: Number(e.target.value) })}
          />
        </label>

        <button
          disabled={!s.cameraId && !s.micId}
          onClick={() => updateSettings({ cameraId: undefined, micId: undefined })}
        >
          Forget remembered camera and microphone
        </button>

        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
