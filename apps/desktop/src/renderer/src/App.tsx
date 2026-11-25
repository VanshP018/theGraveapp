import { useState } from 'react';
import { Lobby, type LobbyResult } from './screens/Lobby';
import { PreJoin, type MediaChoice } from './screens/PreJoin';
import { Call } from './screens/Call';
import './styles.css';

type Step =
  | { name: 'lobby' }
  | { name: 'prejoin'; session: LobbyResult }
  | { name: 'call'; session: LobbyResult; media: MediaChoice };

export function App() {
  const [step, setStep] = useState<Step>({ name: 'lobby' });

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
    return <Call session={step.session} media={step.media} onLeave={() => setStep({ name: 'lobby' })} />;
  }
  return <Lobby onContinue={(session) => setStep({ name: 'prejoin', session })} />;
}
