import { useEffect, useState } from 'react';
import logo from '../assets/grave-logo.png';
import { Aurora } from '../components/Aurora';

const SHOW_MS = 2800;
const FADE_MS = 600;

/** Launch splash: liquid-glass card over a slow aurora. Click or press any key to skip. */
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), SHOW_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, FADE_MS);
    return () => clearTimeout(t);
  }, [leaving, onDone]);

  useEffect(() => {
    const skip = () => setLeaving(true);
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, []);

  return (
    <div
      className={`splash${leaving ? ' leaving' : ''}`}
      role="status"
      aria-label="theGrave is loading"
      onClick={() => setLeaving(true)}
    >
      <Aurora />

      <div className="glass-card">
        <img className="splash-logo" src={logo} alt="GRAVE" draggable={false} />
        <p className="splash-tag">Technical interviews, together.</p>
        <div className="glass-track" aria-hidden>
          <span className="glass-fill" />
        </div>
        <p className="splash-hint">Click anywhere to skip</p>
      </div>
    </div>
  );
}
