'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Eye,
  MessageCircle,
  MoreVertical,
  PhoneOff,
  Send,
  Trash2,
  X
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { formatTime } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { Button, EmptyState, Modal } from '@/components/ui';

type ConfirmAction =
  | { type: 'archive' }
  | { type: 'history' }
  | { type: 'message'; id: string }
  | null;

export function ChatScreen() {
  const duo = useDuo();
  const [draft, setDraft] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const chatMessages = useMemo(
    () => duo.messages.filter((message) => message.destination === 'CHAT'),
    [duo.messages]
  );

  const activeContact = useMemo(
    () => duo.contacts.find((contact) => contact.id === duo.activePeerId),
    [duo.contacts, duo.activePeerId]
  );

  const otherName = useMemo(() => {
    if (activeContact) return activeContact.displayName || activeContact.username;
    const fromMessage = chatMessages.find((message) => message.senderId !== duo.user?.id)?.sender;
    if (fromMessage) return fromMessage.displayName || fromMessage.username;
    return duo.user?.role === 'HOST' ? 'Guest' : 'Host';
  }, [activeContact, chatMessages, duo.user?.id, duo.user?.role]);

  const otherInitial = otherName.charAt(0).toUpperCase();

  const callActive =
    duo.callState === 'ACTIVE' ||
    duo.callState === 'CONNECTING' ||
    duo.callState === 'RECONNECTING';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages.length]);

  function send() {
    if (!draft.trim()) return;
    if (duo.sendMessage(draft, 'CHAT')) setDraft('');
  }

  async function runConfirm() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === 'archive') await duo.archiveChat();
      if (confirmAction.type === 'history') await duo.deleteHistory();
      if (confirmAction.type === 'message') await duo.deleteMessage(confirmAction.id);
      setConfirmAction(null);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const deleted = duo.conversationStatus === 'DELETED';
  const archived = duo.conversationStatus === 'ARCHIVED';

  return (
    <div className="chat-shell">
      <div className="chat-head">
        <div className="relative">
          <button
            type="button"
            className="chat-person"
            onClick={() => {
              if (duo.user?.role === 'HOST') setPeopleOpen((value) => !value);
            }}
            aria-label={duo.user?.role === 'HOST' ? 'Switch conversation' : otherName}
          >
            <span className="chat-avatar">{otherInitial}</span>
            <div className="min-w-0 text-left">
              <p className="flex items-center gap-1 truncate text-sm font-semibold">
                {otherName}
                {duo.user?.role === 'HOST' && <ChevronDown size={13} />}
              </p>
              <p className="muted flex items-center gap-1.5 text-[11px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    duo.otherOnline ? 'bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
                {duo.otherOnline ? 'online' : 'offline'}
              </p>
            </div>
          </button>

          {peopleOpen && duo.user?.role === 'HOST' && (
            <div className="panel dropdown-panel left-0 top-full mt-2 w-64 p-2">
              <p className="muted px-3 py-1 text-[11px] uppercase tracking-wide">Conversations</p>
              {duo.contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className={`nav-item flex w-full items-center gap-2 text-left ${
                    contact.id === duo.activePeerId ? 'bg-white/10' : ''
                  }`}
                  onClick={() => {
                    setPeopleOpen(false);
                    void duo.selectPeer(contact.id);
                  }}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      contact.online ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {contact.displayName || contact.username}
                  </span>
                  {contact.unread > 0 && (
                    <span className="rounded-full bg-pink-500 px-1.5 text-[10px]">
                      {contact.unread}
                    </span>
                  )}
                </button>
              ))}
              {!duo.contacts.length && (
                <p className="muted px-3 py-2 text-xs">No accounts yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            className="icon-btn"
            aria-label="Close chat"
            title="Close chat"
            onClick={duo.closePrivateChat}
          >
            <X size={18} />
          </button>
          {duo.user?.role === 'HOST' && (
            <div className="relative">
              <button
                className="icon-btn"
                aria-label="Conversation options"
                onClick={() => setToolsOpen((value) => !value)}
              >
                <MoreVertical size={17} />
              </button>
              {toolsOpen && (
                <div className="panel dropdown-panel w-56 p-2">
                  <button
                    className="nav-item flex w-full items-center gap-2 text-left"
                    onClick={() => {
                      setToolsOpen(false);
                      setConfirmAction({ type: 'archive' });
                    }}
                    disabled={archived}
                  >
                    <Archive size={15} /> Archive conversation
                  </button>
                  <button
                    className="nav-item flex w-full items-center gap-2 text-left text-rose-200"
                    onClick={() => {
                      setToolsOpen(false);
                      setConfirmAction({ type: 'history' });
                    }}
                  >
                    <Trash2 size={15} /> Delete entire history
                  </button>
                  {archived && (
                    <button
                      className="nav-item flex w-full items-center gap-2 text-left"
                      onClick={() => {
                        setToolsOpen(false);
                        duo.navigate('RESTORE');
                      }}
                    >
                      <MessageCircle size={15} /> Restore conversation
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {archived && (
        <div className="chat-banner">
          <span>This conversation is archived. Messages are preserved.</span>
          <Button className="!px-2.5 !py-1.5 text-xs" onClick={() => duo.navigate('RESTORE')}>
            Restore
          </Button>
        </div>
      )}

      {deleted && (
        <div className="chat-banner chat-banner-danger">
          The previous conversation was permanently deleted. RESTORE cannot recover it.
        </div>
      )}

      <div className="panel chat-panel chat-panel-flat">
        <div className="chat-scroll" ref={scrollRef}>
          {chatMessages.map((message) => {
            const mine = message.senderId === duo.user?.id;
            return mine ? (
              <div key={message.id} className="message-row mine">
                <div className="bubble bubble-sent">
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {message.content}
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-white/55">
                    <span>{formatTime(message.createdAt)}</span>
                    <MessageStatus message={message} otherName={otherName} />
                  </div>
                  <button
                    className="message-delete"
                    aria-label="Delete message"
                    title="Delete this message"
                    onClick={() => setConfirmAction({ type: 'message', id: message.id })}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <div key={message.id} className="study-ai-row chat-ai-row">
                <span className="assistant-avatar small">{otherInitial}</span>
                <div className="study-ai-bubble relative">
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">
                    {message.content}
                  </p>
                  <p className="mt-1 text-[10px] text-white/45">{formatTime(message.createdAt)}</p>
                  {duo.user?.role === 'HOST' && (
                    <button
                      className="message-delete"
                      aria-label="Delete message"
                      title="Delete this message"
                      onClick={() => setConfirmAction({ type: 'message', id: message.id })}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!chatMessages.length && (
            <EmptyState
              icon={<MessageCircle size={26} />}
              title={deleted ? 'Conversation deleted' : 'Start the conversation'}
              description={
                deleted
                  ? 'New messages will begin a fresh conversation.'
                  : 'Only the two of you can see this conversation.'
              }
            />
          )}
          <div ref={bottomRef} />
        </div>

        {callActive && (
          <div className="chat-study-cta study-done-bar">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <PhoneOff size={15} className="text-emerald-300" /> Call connected
              </p>
              <p className="muted text-[11px] leading-5">
                {duo.micOn ? 'Your mic is on' : 'Your mic is muted'} · chat stays open
              </p>
            </div>
            {duo.user?.role === 'GUEST' ? (
              <Button variant="primary" className="study-button" onClick={duo.guestDone}>
                DONE
              </Button>
            ) : (
              <Button variant="danger" className="study-button" onClick={duo.hangup}>
                <PhoneOff size={17} /> End call
              </Button>
            )}
          </div>
        )}

        <div className="chat-study-cta">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <BookOpen size={15} /> Study Mode
            </p>
            <p className="muted text-[11px] leading-5">
              Open the Study Assistant while the call stays connected.
            </p>
          </div>
          <Button
            variant="primary"
            className="study-button"
            onClick={() => duo.enterStudyMode()}
          >
            <BookOpen size={18} />
            OPEN STUDY MODE
          </Button>
        </div>

        <div className="chat-composer">
          <textarea
            className="field min-h-[48px] resize-none"
            rows={1}
            value={draft}
            maxLength={5000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Message…"
          />
          <Button variant="primary" onClick={send} aria-label="Send message">
            <Send size={17} />
          </Button>
        </div>
      </div>

      <Modal
        open={confirmAction !== null}
        title={
          confirmAction?.type === 'history'
            ? 'Permanently delete conversation?'
            : confirmAction?.type === 'archive'
              ? 'Archive this conversation?'
              : 'Delete this message?'
        }
        onClose={() => setConfirmAction(null)}
      >
        <p className="muted text-sm leading-6">
          {confirmAction?.type === 'history'
            ? 'This permanently removes all Chat messages. It cannot be undone and RESTORE cannot recover them. Audit metadata is kept without message content.'
            : confirmAction?.type === 'archive'
              ? 'Messages and timestamps are preserved. The conversation is removed from active Chat and can be reopened with RESTORE.'
              : 'The selected message will be permanently hidden from the conversation.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button
            variant={confirmAction?.type === 'archive' ? 'primary' : 'danger'}
            onClick={runConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmAction?.type === 'history' ? 'Delete permanently' : 'Confirm'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function MessageStatus({ message, otherName }: { message: Message; otherName: string }) {
  if (message.readAt) {
    return (
      <span
        className="inline-flex items-center gap-1 text-emerald-200/85"
        title={`Seen by ${otherName} — visible only to you`}
      >
        <Eye size={11} /> Seen
      </span>
    );
  }
  if (message.deliveredAt) {
    return (
      <span
        className="inline-flex items-center gap-1"
        title={`Delivered to ${otherName} — visible only to you`}
      >
        <CheckCheck size={11} /> Delivered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" title="Sent — visible only to you">
      <Check size={11} /> Sent
    </span>
  );
}
