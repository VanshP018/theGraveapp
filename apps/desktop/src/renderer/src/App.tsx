import { lazy, Suspense, useEffect, useState } from 'react';
import { Lobby, type LobbyResult } from './screens/Lobby';
import { PreJoin, type MediaChoice } from './screens/PreJoin';
const loadCall = () => import('./screens/Call');
const Call = lazy(() => loadCall().then((m) => ({ default: m.Call })));
import { Splash } from './screens/Splash';
import './styles.css';

type Step =
  | { name: 'lobby'; notice?: string }
  | { name: 'prejoin'; session: LobbyResult }
  | { name: 'call'; session: LobbyResult; media: MediaChoice }
  | { name: 'ended'; session: LobbyResult };

export function App() {
  const [step, setStep] = useState<Step>({ name: 'lobby' });
  const [splash, setSplash] = useState(true);

  // The call screen (LiveKit, Monaco, Yjs) is the heavy part. Fetch it while the splash plays, off the critical path.
  useEffect(() => {
    const t = setTimeout(() => void loadCall(), 400);
    return () => clearTimeout(t);
  }, []);

  if (splash) return <Splash onDone={() => setSplash(false)} />;

  if (step.name === 'prejoin') {
    return (
      <PreJoin
        session={step.session}
        onBack={() => setStep({ name: 'lobby' })}
        onJoin={(media) => setStep({ name: 'call', session: step.session, media })}
      />
    );
  }
  if (step.name === 'call') {
    return (
      <Suspense fallback={<main className="center"><p className="muted">Joining…</p></main>}>
        <Call
          session={step.session}
          media={step.media}
          onLeave={() => setStep({ name: 'ended', session: step.session })}
        />
      </Suspense>
    );
  }
  if (step.name === 'ended') {
    return (
      <main className="center">
        <h2>You left the interview</h2>
        <p className="muted">Room <code>{step.session.roomCode}</code>. The interview is still open for others.</p>
        <button className="primary" onClick={() => setStep({ name: 'prejoin', session: step.session })}>Rejoin</button>
        <button onClick={() => setStep({ name: 'lobby' })}>Back to home</button>
      </main>
    );
  }
  return <Lobby notice={step.notice} onContinue={(session) => setStep({ name: 'prejoin', session })} />;
}
