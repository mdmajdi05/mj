'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Eye,
  ListChecks,
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
  | { type: 'bulk' }
  | { type: 'mine' }
  | null;

export function ChatScreen() {
  const duo = useDuo();
  const [draft, setDraft] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
  }, [chatMessages.length, duo.peerTyping]);

  useEffect(() => {
    if (!selectMode) return;
    // Drop selections for messages that disappeared (for example after a
    // delete or a peer switch).
    setSelectedIds((current) => {
      const live = new Set(chatMessages.map((message) => message.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [chatMessages, selectMode]);

  function send() {
    if (!draft.trim()) return;
    duo.notifyTyping(false);
    if (duo.sendMessage(draft, 'CHAT')) setDraft('');
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function enterSelectMode() {
    setToolsOpen(false);
    setPeopleOpen(false);
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function runConfirm() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === 'archive') await duo.archiveChat();
      if (confirmAction.type === 'history') await duo.deleteHistory();
      if (confirmAction.type === 'message') await duo.deleteMessage(confirmAction.id);
      if (confirmAction.type === 'bulk') {
        await duo.deleteMessages([...selectedIds]);
        exitSelectMode();
      }
      if (confirmAction.type === 'mine') {
        await duo.deleteAllForMe();
        exitSelectMode();
      }
      setConfirmAction(null);
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const deleted = duo.conversationStatus === 'DELETED';
  const archived = duo.conversationStatus === 'ARCHIVED';
  const isHost = duo.user?.role === 'HOST';
  const selectedCount = selectedIds.size;

  return (
    <div className={`chat-shell ${selectMode ? 'chat-select-mode' : ''}`}>
      <div className="chat-head">
        <div className="relative">
          <button
            type="button"
            className="chat-person"
            onClick={() => {
              if (isHost && !selectMode) setPeopleOpen((value) => !value);
            }}
            aria-label={isHost ? 'Switch conversation' : otherName}
          >
            <span className="chat-avatar">{otherInitial}</span>
            <div className="min-w-0 text-left">
              <p className="flex items-center gap-1 truncate text-sm font-semibold">
                {otherName}
                {isHost && !selectMode && <ChevronDown size={13} />}
              </p>
              <p className="muted flex items-center gap-1.5 text-[11px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    duo.peerTyping || duo.otherOnline ? 'bg-emerald-400' : 'bg-slate-500'
                  }`}
                />
                {duo.peerTyping ? 'typing…' : duo.otherOnline ? 'online' : 'offline'}
              </p>
            </div>
          </button>

          {peopleOpen && isHost && (
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
          {selectMode ? (
            <Button className="!px-3 !py-1.5 text-xs" onClick={exitSelectMode}>
              Cancel
            </Button>
          ) : (
            <>
              <button
                className="icon-btn"
                aria-label="Select messages"
                title="Select messages to delete"
                onClick={enterSelectMode}
                disabled={!chatMessages.length}
              >
                <ListChecks size={17} />
              </button>
              <button
                className="icon-btn"
                aria-label="Close chat"
                title="Close chat"
                onClick={duo.closePrivateChat}
              >
                <X size={18} />
              </button>
              <div className="relative">
                <button
                  className="icon-btn"
                  aria-label="Conversation options"
                  onClick={() => setToolsOpen((value) => !value)}
                >
                  <MoreVertical size={17} />
                </button>
                {toolsOpen && (
                  <div className="panel dropdown-panel w-60 p-2">
                    {isHost ? (
                      <>
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
                      </>
                    ) : (
                      <button
                        className="nav-item flex w-full items-center gap-2 text-left text-rose-200"
                        onClick={() => {
                          setToolsOpen(false);
                          setConfirmAction({ type: 'mine' });
                        }}
                      >
                        <Trash2 size={15} /> Delete all my chat
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
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
            const selected = selectedIds.has(message.id);
            const bubbleClass = selected ? 'bubble-selected' : '';
            return mine ? (
              <div key={message.id} className="message-row mine">
                <div
                  className={`bubble bubble-sent ${bubbleClass}`}
                  onClick={selectMode ? () => toggleSelected(message.id) : undefined}
                  role={selectMode ? 'button' : undefined}
                  aria-pressed={selectMode ? selected : undefined}
                >
                  {selectMode && selected && (
                    <span className="selection-check">
                      <Check size={11} />
                    </span>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {message.content}
                  </p>
                  <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-white/55">
                    <span>{formatTime(message.createdAt)}</span>
                    <MessageStatus message={message} otherName={otherName} />
                  </div>
                  {!selectMode && (
                    <button
                      className="message-delete"
                      aria-label="Delete message"
                      title="Delete this message"
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmAction({ type: 'message', id: message.id });
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div key={message.id} className="study-ai-row chat-ai-row">
                <span className="assistant-avatar small">{otherInitial}</span>
                <div
                  className={`study-ai-bubble relative ${bubbleClass}`}
                  onClick={selectMode ? () => toggleSelected(message.id) : undefined}
                  role={selectMode ? 'button' : undefined}
                  aria-pressed={selectMode ? selected : undefined}
                >
                  {selectMode && selected && (
                    <span className="selection-check">
                      <Check size={11} />
                    </span>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-7">
                    {message.content}
                  </p>
                  <p className="mt-1 text-[10px] text-white/45">{formatTime(message.createdAt)}</p>
                  {!selectMode && (
                    <button
                      className="message-delete"
                      aria-label="Delete message"
                      title="Delete this message"
                      onClick={(event) => {
                        event.stopPropagation();
                        setConfirmAction({ type: 'message', id: message.id });
                      }}
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
          {duo.peerTyping && (
            <div className="typing-row">
              <span className="assistant-avatar small">{otherInitial}</span>
              <div className="typing-bubble">
                <span className="typing-dots" aria-label={`${otherName} is typing`}>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {selectMode && (
          <div className="chat-select-bar">
            <button
              type="button"
              className="muted inline-flex items-center gap-1.5 text-xs hover:text-white"
              onClick={() =>
                setSelectedIds(
                  selectedCount === chatMessages.length
                    ? new Set()
                    : new Set(chatMessages.map((message) => message.id))
                )
              }
            >
              <CheckCircle2 size={14} />
              {selectedCount === chatMessages.length && chatMessages.length > 0
                ? 'Clear all'
                : 'Select all'}
            </button>
            <span className="text-xs font-medium">{selectedCount} selected</span>
            <Button
              variant="danger"
              className="!px-3 !py-1.5 text-xs"
              disabled={selectedCount === 0}
              onClick={() => setConfirmAction({ type: 'bulk' })}
            >
              <Trash2 size={14} /> Delete
            </Button>
          </div>
        )}

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
            onChange={(event) => {
              setDraft(event.target.value);
              duo.notifyTyping(event.target.value.length > 0);
            }}
            onBlur={() => duo.notifyTyping(false)}
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
              : confirmAction?.type === 'bulk'
                ? `Delete ${selectedCount} message${selectedCount === 1 ? '' : 's'}?`
                : confirmAction?.type === 'mine'
                  ? 'Clear all chat for you?'
                  : 'Delete this message?'
        }
        onClose={() => setConfirmAction(null)}
      >
        <p className="muted text-sm leading-6">
          {confirmAction?.type === 'history'
            ? 'This permanently removes all Chat messages for both accounts. It cannot be undone and RESTORE cannot recover them. Audit metadata is kept without message content.'
            : confirmAction?.type === 'archive'
              ? 'Messages and timestamps are preserved. The conversation is removed from active Chat and can be reopened with RESTORE.'
              : confirmAction?.type === 'bulk'
                ? 'The selected messages will be hidden from your view only. The other participant keeps their copy until they delete it.'
                : confirmAction?.type === 'mine'
                  ? 'Your view is cleared, but the Host keeps the full conversation until the Host deletes it. New messages still arrive normally.'
                  : 'This message will be hidden from your view only. The other participant keeps their copy.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button
            variant={confirmAction?.type === 'archive' ? 'primary' : 'danger'}
            onClick={runConfirm}
            disabled={busy}
          >
            {busy
              ? 'Working…'
              : confirmAction?.type === 'history'
                ? 'Delete permanently'
                : confirmAction?.type === 'bulk'
                  ? 'Delete selected'
                  : confirmAction?.type === 'mine'
                    ? 'Clear my chat'
                    : 'Confirm'}
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
