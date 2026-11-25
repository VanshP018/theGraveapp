import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@tgi/shared';

interface Props {
  messages: ChatMessage[];
  selfName: string;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}

const MAX_LENGTH = 2000;

export function Chat({ messages, selfName, onSend, onClose }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setText(''); // clear only on success so a failed message is not lost
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Message not sent');
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="chat">
      <div className="chat-head">
        <strong>Chat</strong>
        <button onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      <div className="chat-list">
        {messages.length === 0 && <p className="muted">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.sender === selfName;
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              <div className="meta">
                {mine ? 'You' : m.sender} ·{' '}
                {new Date(m.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="body">{m.text}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="error">{error}</p>}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message"
        />
        <button className="primary" disabled={sending || !text.trim()}>Send</button>
      </form>
    </aside>
  );
}
