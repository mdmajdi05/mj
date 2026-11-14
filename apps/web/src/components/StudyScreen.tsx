'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, PhoneOff, Send, Sparkles } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { studyGreeting, studyReply, studySuggestions } from '@/lib/study';
import { formatDuration } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';

type StudyMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `study-${Date.now()}-${messageCounter}`;
}

export function StudyScreen() {
  const duo = useDuo();
  const [messages, setMessages] = useState<StudyMessage[]>([
    { id: 'study-greeting', role: 'assistant', text: studyGreeting }
  ]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callActive =
    duo.callState === 'ACTIVE' ||
    duo.callState === 'CONNECTING' ||
    duo.callState === 'RECONNECTING';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function ask(value: string) {
    const text = value.trim();
    if (!text) return;
    setMessages((current) => [...current, { id: nextId(), role: 'user', text }]);
    setDraft('');
    setTyping(true);
    const delay = duo.prefs.reducedMotion ? 150 : 650 + Math.min(1100, text.length * 14);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const answer = studyReply(text);
      setMessages((current) => [...current, { id: nextId(), role: 'assistant', text: answer }]);
      setTyping(false);
    }, delay);
  }

  return (
    <div className="study-shell study-chat-shell mx-auto max-w-3xl">
      <div className="study-chat-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="assistant-avatar">✦</span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 truncate text-base font-semibold">
              Study Assistant
              <Badge tone="accent">
                <Sparkles size={11} className="mr-1 inline" /> Study Mode
              </Badge>
            </h1>
            <p className="muted text-[11px]">
              {typing ? 'typing…' : 'Ask anything about studying'}
            </p>
          </div>
        </div>
        <BookOpen size={22} className="shrink-0 text-sky-300" />
      </div>

      <div className="study-chat-scroll">
        {messages.map((message) =>
          message.role === 'assistant' ? (
            <div key={message.id} className="study-ai-row">
              <span className="assistant-avatar small">✦</span>
              <div className="study-ai-bubble">
                <p className="whitespace-pre-line text-sm leading-7">{message.text}</p>
              </div>
            </div>
          ) : (
            <div key={message.id} className="message-row mine">
              <div className="bubble bubble-sent">
                <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
              </div>
            </div>
          )
        )}

        {typing && (
          <div className="study-ai-row">
            <span className="assistant-avatar small">✦</span>
            <div className="study-ai-bubble">
              <span className="typing-dots" aria-label="Study Assistant is typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}

        {messages.length <= 1 && !typing && (
          <div className="study-suggestions">
            {studySuggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="study-chip"
                onClick={() => ask(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-composer study-composer">
        <textarea
          className="field min-h-[48px] resize-none"
          rows={1}
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask(draft);
            }
          }}
          placeholder="Ask about focus, revision, notes, exams…"
        />
        <Button variant="primary" onClick={() => ask(draft)} aria-label="Send study question">
          <Send size={17} />
        </Button>
      </div>

      <p className="muted mt-3 text-center text-[11px] leading-5">
        Study replies are generated locally. This conversation is separate and never stored in
        private Chat.
      </p>

      {callActive ? (
        <div className="chat-study-footer study-done-bar">
          <div>
            <p className="text-sm font-medium">Private call is running</p>
            <p className="muted text-xs leading-5">
              {formatDuration(duo.callSeconds)} · {duo.micOn ? 'your mic is on' : 'your mic is muted'}.
              Tap Done to end the call.
            </p>
          </div>
          <Button variant="danger" className="study-button" onClick={duo.hangup}>
            <PhoneOff size={17} /> DONE · END CALL
          </Button>
        </div>
      ) : (
        <p className="muted mt-3 text-center text-[11px] leading-5">
          Chat is hidden. Tap the profile icon → <b>Enter Secret Code</b> to return to the same
          conversation.
        </p>
      )}
    </div>
  );
}
