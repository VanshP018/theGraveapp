import { useEffect, useState } from 'react';
import logo from '../assets/grave-logo.png';

const SHOW_MS = 2000;
const FADE_MS = 450;

/** Launch splash: logo and a hairline progress bar on near-black. Click or press any key to skip. */
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
      <img className="splash-logo" src={logo} alt="GRAVE" draggable={false} />
      <div className="splash-line" aria-hidden>
        <span />
      </div>
    </div>
  );
}
