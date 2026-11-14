'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  CheckCheck,
  Eye,
  LockKeyhole,
  MessageCircle,
  Send,
  Trash2
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { formatTime } from '@/lib/utils';
import { Badge, Button, EmptyState, Modal, SectionTitle } from '@/components/ui';

type ConfirmAction =
  | { type: 'archive' }
  | { type: 'history' }
  | { type: 'message'; id: string }
  | null;

export function ChatScreen() {
  const duo = useDuo();
  const [draft, setDraft] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const chatMessages = useMemo(
    () => duo.messages.filter((message) => message.destination === 'CHAT'),
    [duo.messages]
  );

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
    <>
      <SectionTitle
        eyebrow="Private conversation"
        title="Chat"
        description="Real-time messages, seen receipts and a separate Game Inbox."
        action={
          <Button
            variant="primary"
            className="study-button"
            onClick={() => duo.navigate('STUDY')}
          >
            <BookOpen size={18} />
            OPEN STUDY MODE
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={duo.otherOnline ? 'good' : 'neutral'}>
          {duo.otherOnline ? 'Other participant online' : 'Other participant offline'}
        </Badge>
        <Badge tone={archived ? 'warn' : deleted ? 'bad' : 'accent'}>
          {duo.conversationStatus === 'NONE' ? 'New conversation' : duo.conversationStatus}
        </Badge>
        {duo.user?.role === 'GUEST' && !duo.user.chatUnlocked && (
          <Badge tone="warn">
            <LockKeyhole size={11} className="mr-1 inline" /> Locked
          </Badge>
        )}
      </div>

      {archived && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-950/20 p-4 text-sm text-amber-100">
          <span>This conversation is archived. Messages are preserved.</span>
          <Button onClick={() => duo.navigate('RESTORE')}>Restore with RESTORE</Button>
        </div>
      )}

      {deleted && (
        <div className="mb-3 rounded-2xl border border-rose-400/20 bg-rose-950/20 p-4 text-sm text-rose-100">
          The previous conversation was permanently deleted by Host. RESTORE cannot recover it.
        </div>
      )}

      <div className="chat-layout">
        <div className="panel chat-panel">
          <div className="chat-scroll" ref={scrollRef}>
            {chatMessages.map((message) => {
              const mine = message.senderId === duo.user?.id;
              return (
                <div key={message.id} className={`message-row ${mine ? 'mine' : ''}`}>
                  <div className={`bubble ${mine ? 'bubble-sent' : 'bubble-received'}`}>
                    {!mine && (
                      <p className="mb-1 text-[11px] font-semibold text-fuchsia-200">
                        {message.sender?.username || 'Participant'}
                      </p>
                    )}
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
                title={deleted ? 'Conversation deleted' : 'Your conversation starts here'}
                description={
                  deleted
                    ? 'New messages will begin a fresh conversation.'
                    : 'Send the first message. It will stay private between the two accounts.'
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
              placeholder={
                duo.user?.role === 'GUEST' && !duo.user.chatUnlocked
                  ? 'Unlock Chat to send a message…'
                  : 'Write a private message…'
              }
            />
            <Button variant="primary" onClick={send} aria-label="Send message">
              <Send size={17} />
            </Button>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="panel-soft p-4">
            <p className="eyebrow">Conversation controls</p>
            <p className="muted mt-2 text-xs leading-5">
              Hide keeps every message. Archive keeps messages but removes the conversation from
              active Chat. Delete is permanent and only Host can do it.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button className="justify-start" onClick={() => duo.navigate('STUDY')}>
                <BookOpen size={15} /> Hide Chat / Study Mode
              </Button>
              {duo.user?.role === 'HOST' && (
                <>
                  <Button
                    className="justify-start"
                    onClick={() => setConfirmAction({ type: 'archive' })}
                    disabled={archived}
                  >
                    <Archive size={15} /> Archive conversation
                  </Button>
                  <Button
                    variant="danger"
                    className="justify-start"
                    onClick={() => setConfirmAction({ type: 'history' })}
                  >
                    <Trash2 size={15} /> Delete entire history
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="panel-soft p-4">
            <p className="eyebrow">Privacy</p>
            <p className="muted mt-2 text-xs leading-5">
              Butterfly notifications show only the animation. No message text or sender name is
              placed in a notification payload.
            </p>
          </div>
        </aside>
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
    </>
  );
}
