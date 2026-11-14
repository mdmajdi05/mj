'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  CheckCheck,
  Eye,
  LockKeyhole,
  MessageCircle,
  MoreVertical,
  Send,
  Trash2
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { formatTime } from '@/lib/utils';
import { Badge, Button, EmptyState, Modal } from '@/components/ui';
import { CallOrb, CallStatusBar } from '@/components/CallControls';

type ConfirmAction =
  | { type: 'archive' }
  | { type: 'history' }
  | { type: 'message'; id: string }
  | null;

export function ChatScreen() {
  const duo = useDuo();
  const [draft, setDraft] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [studyOpen, setStudyOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const chatMessages = useMemo(
    () => duo.messages.filter((message) => message.destination === 'CHAT'),
    [duo.messages]
  );

  const otherName = useMemo(() => {
    const fromMessage = chatMessages.find((message) => message.senderId !== duo.user?.id)?.sender
      ?.username;
    if (fromMessage) return fromMessage;
    return duo.user?.role === 'HOST' ? 'Guest' : 'Host';
  }, [chatMessages, duo.user?.id, duo.user?.role]);

  const otherInitial = otherName.charAt(0).toUpperCase();

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
  const locked = duo.user?.role === 'GUEST' && !duo.user.chatUnlocked;

  return (
    <div className="chat-shell">
      <div className="chat-head">
        <div className="chat-person">
          <span className="chat-avatar">{otherInitial}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{otherName}</p>
            <p className="muted flex items-center gap-1.5 text-[11px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  duo.otherOnline ? 'bg-emerald-400' : 'bg-slate-500'
                }`}
              />
              {duo.otherOnline ? 'online' : 'offline'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {duo.conversationStatus !== 'ACTIVE' && duo.conversationStatus !== 'NONE' && (
            <Badge tone={archived ? 'warn' : deleted ? 'bad' : 'neutral'}>
              {duo.conversationStatus.toLowerCase()}
            </Badge>
          )}
          {locked && (
            <Badge tone="warn">
              <LockKeyhole size={11} className="mr-1 inline" /> Locked
            </Badge>
          )}
          <CallOrb />
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

      <CallStatusBar />

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
            return (
              <div key={message.id} className={`message-row ${mine ? 'mine' : ''}`}>
                <div className={`bubble ${mine ? 'bubble-sent' : 'bubble-received'}`}>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {message.content}
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-white/55">
                    <span>{formatTime(message.createdAt)}</span>
                    {mine && (
                      <span className="inline-flex items-center gap-1">
                        {message.readAt ? (
                          <>
                            <Eye size={11} /> Seen
                          </>
                        ) : message.deliveredAt ? (
                          <>
                            <CheckCheck size={11} /> Delivered
                          </>
                        ) : (
                          'Sent'
                        )}
                      </span>
                    )}
                  </div>
                  {(mine || duo.user?.role === 'HOST') && (
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
              title={deleted ? 'Conversation deleted' : 'Say something'}
              description={
                deleted
                  ? 'New messages will begin a fresh conversation.'
                  : 'Send the first message. It stays between the two of you.'
              }
            />
          )}
          <div ref={bottomRef} />
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
            placeholder={locked ? 'Unlock Chat to send a message…' : 'Message…'}
          />
          <Button variant="primary" onClick={send} aria-label="Send message">
            <Send size={17} />
          </Button>
        </div>
      </div>

      <div className="chat-study-footer">
        <div>
          <p className="text-sm font-medium">Need to study?</p>
          <p className="muted text-xs leading-5">
            Study Mode hides this chat. The private call can keep running.
          </p>
        </div>
        <Button
          variant="primary"
          className="study-button"
          onClick={() => setStudyOpen(true)}
        >
          <BookOpen size={18} />
          OPEN STUDY MODE
        </Button>
      </div>

      <Modal
        open={studyOpen}
        title="Open Study Mode?"
        onClose={() => setStudyOpen(false)}
      >
        <p className="muted text-sm leading-6">
          This chat disappears from the screen and the Study Assistant opens. Your messages are
          kept and the private call stays connected.
        </p>
        {duo.user?.role === 'HOST' && (
          <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-950/20 p-3 text-xs leading-5 text-amber-100">
            Your microphone will be muted so the other player cannot hear you. You will still hear
            them, and you can unmute from Study Mode.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setStudyOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setStudyOpen(false);
              duo.enterStudyMode();
            }}
          >
            <BookOpen size={16} /> Open Study Mode
          </Button>
        </div>
      </Modal>

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
            ? 'This permanently removes all private Chat messages. It cannot be undone and RESTORE cannot recover them. Audit metadata is kept without message content.'
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
