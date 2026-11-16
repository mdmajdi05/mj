'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import {
  studyAutoOpener,
  studyHistory,
  studyReply,
  studySuggestions,
  type Reply
} from '@/lib/study';
import { api } from '@/lib/api';
import type { StudySeedMessage, StudySeedReply } from '@/lib/types';
import { formatTime } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { CallOrb, CallPanel } from '@/components/CallControls';
import { ChatComposer } from '@/components/ChatComposer';

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

/** Converts Host-managed seed messages into renderable chat rows. */
function mapSeed(messages: StudySeedMessage[]): StudyMessage[] {
  const total = messages.length;
  return messages.map((item, index) => ({
    id: `seed-${item.id}`,
    role: item.role === 'USER' ? 'user' : 'assistant',
    text: item.text,
    at: atMinutesAgo(Math.max(1, (total - index) * 2))
  }));
}

function toReplies(replies: StudySeedReply[]): Reply[] {
  return replies.map((reply) => ({
    keywords: reply.keywords
      .split(',')
      .map((keyword) => keyword.trim().toLowerCase())
      .filter(Boolean),
    answer: reply.answer
  }));
}

export function StudyScreen() {
  const duo = useDuo();
  const [seed, setSeed] = useState<StudyMessage[]>(seededHistory);
  const [conversation, setConversation] = useState<StudyMessage[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [serverHasContent, setServerHasContent] = useState(false);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const messages = [...seed, ...conversation];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, typing]);

  useEffect(() => {
    void duo.resumeSessionIfNeeded();
  }, [duo.resumeSessionIfNeeded]);

  const loadStudy = useCallback(async () => {
    try {
      const data = await api<{ messages: StudySeedMessage[]; replies: StudySeedReply[] }>(
        '/chat/study'
      );
      const hasContent = Array.isArray(data.messages) && data.messages.length > 0;
      setServerHasContent(hasContent);
      if (hasContent) setSeed(mapSeed(data.messages));
      setReplies(toReplies(Array.isArray(data.replies) ? data.replies : []));
    } catch {
      // Offline or first boot: keep the local fallback content.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadStudy();
  }, [loadStudy]);

  // Host edits are broadcast over Socket.IO and re-dispatched as a DOM event.
  useEffect(() => {
    const handler = () => void loadStudy();
    window.addEventListener('study:updated', handler);
    return () => window.removeEventListener('study:updated', handler);
  }, [loadStudy]);

  /**
   * Local demo opener only runs when the Host has not configured any seed
   * messages, so admin-managed content is never mixed with sample history.
   */
  useEffect(() => {
    if (!loaded || serverHasContent || startedRef.current) return;
    startedRef.current = true;
    const sendTimer = setTimeout(() => {
      setConversation((current) => [
        ...current,
        { id: nextId(), role: 'user', text: studyAutoOpener, at: new Date().toISOString() }
      ]);
      setTyping(true);
      timerRef.current = setTimeout(() => {
        setConversation((current) => [
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
  }, [loaded, serverHasContent]);

  function ask(value: string) {
    const text = value.trim();
    if (!text) return;
    setConversation((current) => [
      ...current,
      { id: nextId(), role: 'user', text, at: new Date().toISOString() }
    ]);
    setDraft('');
    setTyping(true);
    const delay = duo.prefs.reducedMotion ? 150 : 650 + Math.min(1100, text.length * 14);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const answer = studyReply(text, replies);
      setConversation((current) => [
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

        <CallPanel />

        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={() => ask(draft)}
          onTyping={() => undefined}
          onMediaSelect={() => undefined}
          onQuickSend={() => undefined}
          onVoiceSend={() => undefined}
          allowAttachments={false}
          allowVoice={false}
          placeholder="Ask about focus, revision, notes, exams…"
          maxLength={2000}
        />
      </div>
    </div>
  );
}
