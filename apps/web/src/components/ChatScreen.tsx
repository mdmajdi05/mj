'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  Eye,
  ImagePlus,
  ListChecks,
  MessageCircle,
  MoreVertical,
  Send,
  Trash2,
  X
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { API } from '@/lib/api';
import { formatDateTime, formatFileSize, formatLastSeen, formatTime } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { Button, EmptyState, Modal } from '@/components/ui';
import { CallOrb, CallPanel } from '@/components/CallControls';

type ConfirmAction =
  | { type: 'archive' }
  | { type: 'history' }
  | { type: 'message'; id: string }
  | { type: 'bulk' }
  | { type: 'mine' }
  | null;

const mediaUrl = (id: string) => `${API}/api/chat/media/${id}`;

export function ChatScreen() {
  const duo = useDuo();
  const [draft, setDraft] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    const handler = (event: Event) => {
      if (toolsRef.current && !toolsRef.current.contains(event.target as Node)) {
        setToolsOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [toolsOpen]);

  const isHost = duo.user?.role === 'HOST';

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
    return isHost ? 'Guest' : 'Host';
  }, [activeContact, chatMessages, duo.user?.id, isHost]);

  const otherInitial = otherName.charAt(0).toUpperCase();
  const peerLastSeen = activeContact?.lastSeenAt ?? duo.peerLastSeenAt;
  const peerOnline = activeContact ? activeContact.online : duo.otherOnline;

  useEffect(() => {
    // Coming back after a refresh or network drop: restore the audio session
    // quietly. Nothing is audible until the offer is explicitly unmuted.
    void duo.resumeSessionIfNeeded();
    const retry = window.setTimeout(() => void duo.resumeSessionIfNeeded(), 1500);
    return () => window.clearTimeout(retry);
  }, [duo.resumeSessionIfNeeded]);

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
    setSelectMode(true);
    setSelectedIds(new Set());
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function openPeer(id: string) {
    setMobileConversationOpen(true);
    exitSelectMode();
    void duo.selectPeer(id);
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await duo.sendMedia(file);
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
  const selectedCount = selectedIds.size;

  return (
    <div
      className={`chat-shell ${selectMode ? 'chat-select-mode' : ''} ${
        isHost
          ? `chat-shell-host ${mobileConversationOpen ? 'host-open' : 'host-list'}`
          : ''
      }`}
    >
      {isHost && (
        <aside className="chat-contact-list" aria-label="Conversations">
          <div className="chat-contact-head">
            <p className="text-sm font-semibold">Chats</p>
            <span className="muted text-[11px]">{duo.contacts.length}</span>
          </div>
          <div className="chat-contact-scroll">
            {duo.contacts.map((contact) => {
              const name = contact.displayName || contact.username;
              return (
                <button
                  key={contact.id}
                  type="button"
                  className={`chat-contact ${contact.id === duo.activePeerId ? 'is-active' : ''}`}
                  onClick={() => openPeer(contact.id)}
                >
                  <span className="chat-avatar chat-avatar-sm">{name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      {contact.unread > 0 && (
                        <span className="chat-contact-badge">{contact.unread}</span>
                      )}
                    </span>
                    <span className="muted block truncate text-[11px]">
                      {contact.online
                        ? 'online'
                        : contact.lastSeenAt
                          ? formatLastSeen(contact.lastSeenAt)
                          : contact.lastMessageAt
                            ? formatDateTime(contact.lastMessageAt)
                            : 'new conversation'}
                    </span>
                  </span>
                </button>
              );
            })}
            {!duo.contacts.length && (
              <p className="muted px-3 py-3 text-xs">No accounts yet.</p>
            )}
          </div>
        </aside>
      )}

      <div className="chat-conversation">
        <div className="chat-head">
          <div className="flex min-w-0 items-center gap-2">
            {isHost && (
              <button
                type="button"
                className="icon-btn host-back"
                aria-label="Back to chats"
                onClick={() => setMobileConversationOpen(false)}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="chat-person">
              <span className="chat-avatar">{otherInitial}</span>
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-semibold">{otherName}</p>
                <p className="muted flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      peerTypingOrOnline(duo.peerTyping, peerOnline)
                    }`}
                  />
                  {duo.peerTyping
                    ? 'typing…'
                    : peerOnline
                      ? 'online'
                      : formatLastSeen(peerLastSeen)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {selectMode ? (
              <Button className="!px-3 !py-1.5 text-xs" onClick={exitSelectMode}>
                Cancel
              </Button>
            ) : (
              <>
                <CallOrb />
                <button
                  className="icon-btn"
                  aria-label="Close chat"
                  title="Close chat"
                  onClick={duo.closePrivateChat}
                >
                  <X size={18} />
                </button>
                <div className="relative" ref={toolsRef}>
                  <button
                    className="icon-btn"
                    aria-label="Conversation options"
                    onClick={() => setToolsOpen((value) => !value)}
                  >
                    <MoreVertical size={17} />
                  </button>
                  {toolsOpen && (
                    <div className="panel dropdown-panel right-0 w-60 p-2">
                      <button
                        className="nav-item flex w-full items-center gap-2 text-left"
                        onClick={() => {
                          setToolsOpen(false);
                          enterSelectMode();
                        }}
                        disabled={!chatMessages.length}
                      >
                        <ListChecks size={15} /> Select messages
                      </button>
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

        <CallPanel />

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
              const media = message.attachmentId ? (
                <MessageMedia message={message} selectMode={selectMode} />
              ) : null;
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
                    {media}
                    {message.content && (
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {message.content}
                      </p>
                    )}
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
                    {media}
                    {message.content && (
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {message.content}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-white/45">
                      {formatTime(message.createdAt)}
                    </p>
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

          <div className="chat-study-cta">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <BookOpen size={15} /> Study Mode
              </p>
              <p className="muted text-[11px] leading-5">
                Open the Study Assistant whenever you need a focused plan.
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
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(event) => void onPickFile(event)}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Send photo or video"
              title="Send photo or video"
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus size={19} />
            </button>
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

function peerTypingOrOnline(typing: boolean, online: boolean) {
  return typing || online ? 'bg-emerald-400' : 'bg-slate-500';
}

function MessageMedia({ message, selectMode }: { message: Message; selectMode: boolean }) {
  if (!message.attachmentId) return null;
  const url = mediaUrl(message.attachmentId);
  if (message.attachmentKind === 'VIDEO') {
    return (
      <div className="chat-media">
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="chat-media-video"
          onClick={(event) => event.stopPropagation()}
        />
        {message.attachmentSize ? (
          <span className="chat-media-meta">Video · {formatFileSize(message.attachmentSize)}</span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="chat-media">
      <img
        src={url}
        alt={message.attachmentName || 'Photo'}
        loading="lazy"
        className="chat-media-image"
        onClick={(event) => {
          event.stopPropagation();
          if (selectMode) return;
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
      />
      {message.attachmentSize ? (
        <span className="chat-media-meta">Photo · {formatFileSize(message.attachmentSize)}</span>
      ) : null}
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
