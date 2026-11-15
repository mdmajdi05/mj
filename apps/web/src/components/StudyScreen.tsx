'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, PhoneOff, Send, Sparkles, X } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { studyGreeting, studyReply, studySuggestions } from '@/lib/study';
import { formatDuration, formatTime } from '@/lib/utils';
import { Badge, Button, EmptyState } from '@/components/ui';

type StudyMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
};

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `study-${Date.now()}-${messageCounter}`;
}

export function StudyScreen() {
  const duo = useDuo();
  const [messages, setMessages] = useState<StudyMessage[]>([
    { id: 'study-greeting', role: 'assistant', text: studyGreeting, at: new Date().toISOString() }
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
    setMessages((current) => [
      ...current,
      { id: nextId(), role: 'user', text, at: new Date().toISOString() }
    ]);
    setDraft('');
    setTyping(true);
    const delay = duo.prefs.reducedMotion ? 150 : 650 + Math.min(1100, text.length * 14);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const answer = studyReply(text);
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'assistant', text: answer, at: new Date().toISOString() }
      ]);
      setTyping(false);
    }, delay);
  }

  return (
    <div className="chat-shell">
      <div className="chat-head">
        <div className="chat-person">
          <span className="chat-avatar">✦</span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-semibold">
              Study Assistant
              <Badge tone="accent">
                <Sparkles size={11} className="mr-1 inline" /> Study
              </Badge>
            </p>
            <p className="muted text-[11px]">{typing ? 'typing…' : 'Ask anything about studying'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-sky-300" />
          <button
            className="icon-btn"
            aria-label="Close"
            title="Close"
            onClick={duo.closePrivateChat}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="panel chat-panel chat-panel-flat">
        <div className="chat-scroll">
          {messages.map((message) =>
            message.role === 'assistant' ? (
              <div key={message.id} className="study-ai-row chat-ai-row">
                <span className="assistant-avatar small">✦</span>
                <div className="study-ai-bubble">
                  <p className="whitespace-pre-line text-sm leading-7">{message.text}</p>
                  <p className="mt-1 text-[10px] text-white/45">{formatTime(message.at)}</p>
                </div>
              </div>
            ) : (
              <div key={message.id} className="message-row mine">
                <div className="bubble bubble-sent">
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
                  <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-white/55">
                    <span>{formatTime(message.at)}</span>
                  </div>
                </div>
              </div>
            )
          )}

          {typing && (
            <div className="study-ai-row chat-ai-row">
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
                <button key={suggestion} className="study-chip" onClick={() => ask(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {!messages.length && (
            <EmptyState icon={<BookOpen size={26} />} title="Start a study session" />
          )}

          <div ref={bottomRef} />
        </div>

        {callActive && (
          <div className="chat-study-cta study-done-bar">
            <div className="min-w-0">
              <p className="text-sm font-medium">Audio is running</p>
              <p className="muted text-[11px] leading-5">
                {formatDuration(duo.callSeconds)} · {duo.micOn ? 'your mic is on' : 'your mic is muted'}
              </p>
            </div>
            <Button
              variant={duo.user?.role === 'GUEST' ? 'primary' : 'danger'}
              className="study-button"
              onClick={duo.user?.role === 'GUEST' ? duo.guestDone : duo.hangup}
            >
              {duo.user?.role === 'GUEST' ? 'DONE' : <><PhoneOff size={17} /> End call</>}
            </Button>
          </div>
        )}

        <div className="chat-composer">
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
          <Button variant="primary" onClick={() => ask(draft)} aria-label="Send">
            <Send size={17} />
          </Button>
        </div>
      </div>
    </div>
  );
}
