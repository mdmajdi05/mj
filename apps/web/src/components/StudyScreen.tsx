'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, PhoneOff, Send, Sparkles, X } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import {
  studyAutoOpener,
  studyHistory,
  studyReply,
  studySuggestions
} from '@/lib/study';
import { formatDuration, formatTime } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';
import { CallOrb } from '@/components/CallControls';

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

const atMinutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const seededHistory = (): StudyMessage[] =>
  studyHistory.map((item, index) => ({
    id: `study-history-${index}`,
    role: item.role,
    text: item.text,
    at: atMinutesAgo(item.minutesAgo)
  }));

export function StudyScreen() {
  const duo = useDuo();
  const [messages, setMessages] = useState<StudyMessage[]>(seededHistory);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const callActive =
    duo.callState === 'ACTIVE' ||
    duo.callState === 'CONNECTING' ||
    duo.callState === 'RECONNECTING';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  /** Opening the screen looks like an ongoing session: a target goes out, the assistant replies. */
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const sendTimer = setTimeout(() => {
      setMessages((current) => [
        ...current,
        { id: nextId(), role: 'user', text: studyAutoOpener, at: new Date().toISOString() }
      ]);
      setTyping(true);
      timerRef.current = setTimeout(() => {
        setMessages((current) => [
          ...current,
          {
            id: nextId(),
            role: 'assistant',
            text:
              'Good target. 5 numericals ke liye 25-25 minute ke 2 blocks karo. Pehle solved example dekho, phir bina dekhe solve karo. Timer ke baad batao kitne sahi hue.',
            at: new Date().toISOString()
          }
        ]);
        setTyping(false);
      }, 1400);
    }, 800);
    return () => {
      clearTimeout(sendTimer);
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
            <p className="muted flex items-center gap-1.5 text-[11px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  typing ? 'bg-emerald-400' : 'bg-emerald-400/70'
                }`}
              />
              {typing ? 'typing…' : 'Ask anything about studying'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CallOrb />
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

          <div className="study-suggestions">
            {studySuggestions.slice(0, 4).map((suggestion) => (
              <button key={suggestion} className="study-chip" onClick={() => ask(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <div ref={bottomRef} />
        </div>

        {callActive && (
          <div className="chat-study-cta study-done-bar">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <PhoneOff size={15} className="text-emerald-300" /> Audio is running
              </p>
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
