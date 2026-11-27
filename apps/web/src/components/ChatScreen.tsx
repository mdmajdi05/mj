'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Eye,
  ListChecks,
  MessageCircle,
  MoreVertical,
  Pencil,
  Reply,
  Trash2,
  X
} from 'lucide-react';
import { useDuo } from '@/hooks/useDuoApp';
import { formatDateTime, formatFileSize, formatLastSeen, formatTime } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { Button, EmptyState, Modal } from '@/components/ui';
import { CallOrb, CallPanel } from '@/components/CallControls';
import { ChatComposer } from '@/components/ChatComposer';
import type { PendingAttachment } from '@/components/ChatComposer';
import { holdMediaInteraction } from '@/lib/mediaGuard';
import { prepareImageForUpload } from '@/lib/imageProcessing';
import { prepareVideoForUpload } from '@/lib/videoProcessing';
import {
  AudioBubble,
  DocumentBubble,
  MediaGrid,
  MediaLightbox,
  attachmentLabel
} from '@/components/ChatMedia';

type ConfirmAction =
  | { type: 'archive' }
  | { type: 'message'; ids: string[]; scope: 'ME' | 'EVERYONE' }
  | { type: 'bulk'; scope: 'ME' | 'EVERYONE' }
  | { type: 'mine' }
  | null;

type DeleteChatScope = 'ME' | 'BOTH_SIDES';

/** Same profile mark used by the Study Assistant header. */
const ASSISTANT_AVATAR = '✦';

type DisplayItem = {
  key: string;
  messages: Message[];
  media: boolean;
  /** Set only on the first item of a new calendar day. */
  dayLabel?: string;
};

type ActionMenu = {
  ids: string[];
  message: Message;
  editable: boolean;
  x: number;
  y: number;
} | null;

const EDIT_WINDOW = 5 * 60 * 1000;
const isMediaOnly = (message: Message) =>
  (message.attachmentKind === 'IMAGE' || message.attachmentKind === 'VIDEO') && !message.content;

/** Local calendar day key, so a divider never depends on the server timezone. */
function messageDayKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** WhatsApp-style label: Today, Yesterday, then a readable date. */
function messageDayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
  });
}

export function ChatScreen() {
  const duo = useDuo();
  const [draft, setDraft] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [deleteChatOpen, setDeleteChatOpen] = useState(false);
  const [deleteChatPeerId, setDeleteChatPeerId] = useState('');
  const [deleteChatScope, setDeleteChatScope] = useState<DeleteChatScope>('ME');
  const [deleteChatSenderScope, setDeleteChatSenderScope] = useState<'MINE' | 'THEIRS' | 'ALL'>(
    'ALL'
  );
  const [deleteChatFrom, setDeleteChatFrom] = useState('');
  const [deleteChatTo, setDeleteChatTo] = useState('');
  const [removeChatTarget, setRemoveChatTarget] = useState<{ id: string; name: string } | null>(
    null
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [actionMenu, setActionMenu] = useState<ActionMenu>(null);
  const [lightbox, setLightbox] = useState<{ items: Message[]; index: number } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [flashId, setFlashId] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const lastLengthRef = useRef(0);
  const loadedOnceRef = useRef(false);
  const olderScrollRef = useRef<{ height: number; top: number } | null>(null);
  const wasLoadingOlderRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [actionMenu]);

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

  const peerLastSeen = activeContact?.lastSeenAt ?? duo.peerLastSeenAt;
  const peerOnline = activeContact ? activeContact.online : duo.otherOnline;

  /** Consecutive photos/videos from the same account form one smart grid. */
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    let bucket: Message[] = [];
    let lastDay = '';
    const push = (item: DisplayItem) => {
      const key = messageDayKey(item.messages[0].createdAt);
      if (key && key !== lastDay) {
        item.dayLabel = messageDayLabel(item.messages[0].createdAt);
        lastDay = key;
      }
      items.push(item);
    };
    const flush = () => {
      if (!bucket.length) return;
      push({ key: bucket[0].id, messages: bucket, media: true });
      bucket = [];
    };
    for (const message of chatMessages) {
      if (isMediaOnly(message)) {
        const sameDay =
          bucket.length > 0 &&
          messageDayKey(bucket[0].createdAt) === messageDayKey(message.createdAt);
        if (bucket.length && sameDay && bucket[bucket.length - 1].senderId === message.senderId) {
          bucket.push(message);
        } else {
          flush();
          bucket = [message];
        }
      } else {
        flush();
        push({ key: message.id, messages: [message], media: false });
      }
    }
    flush();
    return items;
  }, [chatMessages]);

  useEffect(() => {
    // Coming back after a refresh or network drop: restore the audio session
    // quietly. Nothing is audible until the offer is explicitly unmuted.
    void duo.resumeSessionIfNeeded();
    const retry = window.setTimeout(() => void duo.resumeSessionIfNeeded(), 1500);
    return () => window.clearTimeout(retry);
  }, [duo.resumeSessionIfNeeded]);

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    if (behavior === 'auto' && scrollRef.current) {
      // CSS scroll-behavior is smooth, so jump directly to avoid animating
      // through the whole history when the newest page first arrives.
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
    setNewCount(0);
    setAtBottom(true);
    atBottomRef.current = true;
  }

  useEffect(() => {
    const length = chatMessages.length;
    const previous = lastLengthRef.current;
    lastLengthRef.current = length;
    if (!length) {
      loadedOnceRef.current = false;
      return;
    }
    if (!loadedOnceRef.current) {
      loadedOnceRef.current = true;
      scrollToBottom('auto');
      return;
    }
    // Older history was prepended: keep the reader exactly where they were.
    if (olderScrollRef.current) return;
    if (length > previous) {
      if (atBottomRef.current) scrollToBottom('smooth');
      else setNewCount((count) => count + (length - previous));
    }
  }, [chatMessages.length]);

  useEffect(() => {
    const wasLoading = wasLoadingOlderRef.current;
    wasLoadingOlderRef.current = duo.loadingOlder;
    if (!wasLoading || duo.loadingOlder) return;
    const element = scrollRef.current;
    const snapshot = olderScrollRef.current;
    olderScrollRef.current = null;
    if (!element || !snapshot) return;
    // Preserve the viewport after the older page is inserted above it.
    const behavior = element.style.scrollBehavior;
    element.style.scrollBehavior = 'auto';
    element.scrollTop = snapshot.top + (element.scrollHeight - snapshot.height);
    element.style.scrollBehavior = behavior;
  }, [duo.loadingOlder]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !duo.hasMoreMessages || duo.loadingOlder || olderScrollRef.current) return;
    // If the first page does not fill the viewport there is no scrollbar to
    // reach the top with, so fetch earlier pages until the screen is full.
    if (element.scrollHeight > element.clientHeight + 40) return;
    void duo.loadOlderMessages().catch(() => undefined);
  }, [chatMessages.length, duo.hasMoreMessages, duo.loadingOlder]);

  useEffect(() => {
    if (duo.peerTyping && atBottomRef.current) scrollToBottom('smooth');
  }, [duo.peerTyping]);

  useEffect(() => {
    if (!selectMode) return;
    setSelectedIds((current) => {
      const live = new Set(chatMessages.map((message) => message.id));
      const next = new Set([...current].filter((id) => live.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [chatMessages, selectMode]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const pendingRef = useRef<PendingAttachment[]>([]);
  pendingRef.current = pending;
  const uploadAbortRef = useRef(new Map<string, AbortController>());
  const uploadRunRef = useRef(0);
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      uploadAbortRef.current.forEach((controller) => controller.abort());
      uploadAbortRef.current.clear();
    };
  }, []);

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const near = distance < 120;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setNewCount(0);

    // WhatsApp-style history loading: reaching the top fetches the page before
    // the oldest cached message without moving the reader's viewport.
    const nearTop = element.scrollTop < 120;
    const canScroll = element.scrollHeight > element.clientHeight + 40;
    if (nearTop && canScroll && duo.hasMoreMessages && !duo.loadingOlder && !olderScrollRef.current) {
      olderScrollRef.current = { height: element.scrollHeight, top: element.scrollTop };
      void duo.loadOlderMessages().catch(() => undefined);
    }
  }

  function send() {
    if (editing) {
      if (!draft.trim()) return;
      duo.notifyTyping(false);
      void duo
        .editMessage(editing.id, draft)
        .then(() => {
          setDraft('');
          setEditing(null);
        })
        .catch((cause) =>
          duo.setError(cause instanceof Error ? cause.message : 'Message could not be edited')
        );
      return;
    }
    if (pending.length) {
      void sendPending();
      return;
    }
    if (!draft.trim()) return;
    duo.notifyTyping(false);
    if (duo.sendMessage(draft, 'CHAT', null, replyTarget?.id ?? null)) {
      setDraft('');
      setReplyTarget(null);
      scrollToBottom();
    }
  }

  function makePending(file: File): PendingAttachment {
    const mime = file.type || '';
    const kind: PendingAttachment['kind'] = mime.startsWith('image/')
      ? 'IMAGE'
      : mime.startsWith('video/')
        ? 'VIDEO'
        : mime.startsWith('audio/')
          ? 'AUDIO'
          : 'FILE';
    return {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      kind,
      status: 'ready',
      progress: 0
    };
  }

  /** Adds files to the preview tray; nothing is uploaded until Send. */
  function queueFiles(files: File[], autoSend = false) {
    const items = files.map(makePending);
    setPending((current) => [...current, ...items]);
    if (autoSend) void uploadAttachments(items, draft.trim());
  }

  function updatePending(id: string, patch: Partial<PendingAttachment>) {
    setPending((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function discardPending(id: string) {
    uploadAbortRef.current.get(id)?.abort();
    uploadAbortRef.current.delete(id);
    setPending((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }

  function cancelPending() {
    uploadRunRef.current += 1;
    uploadAbortRef.current.forEach((controller) => controller.abort());
    uploadAbortRef.current.clear();
    setPending((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setUploading(false);
  }

  async function uploadAttachments(items: PendingAttachment[], caption: string) {
    if (!items.length) return;
    const run = ++uploadRunRef.current;
    setUploading(true);
    let captionSent = false;
    let sentAny = false;
    const replyId = replyTarget?.id ?? null;

    for (const item of items) {
      if (run !== uploadRunRef.current) break;
      // Keep the privacy guard quiet for long uploads as well.
      holdMediaInteraction(10 * 60 * 1000);
      updatePending(item.id, { status: 'uploading', progress: 0, error: undefined });

      // Photos are resized/re-encoded before upload. Oversized videos are
      // compressed in the browser first (compression uses the first 90% of
      // the progress bar, the actual upload the last 10%). Documents are sent
      // as-is.
      const uploadFile =
        item.kind === 'VIDEO'
          ? await prepareVideoForUpload(item.file, (fraction) =>
              updatePending(item.id, { progress: Math.round(fraction * 90) })
            )
          : await prepareImageForUpload(item.file);
      if (run !== uploadRunRef.current) break;
      const controller = new AbortController();
      uploadAbortRef.current.set(item.id, controller);

      const sent = await duo.sendMedia(
        uploadFile,
        replyId,
        (progress) =>
          updatePending(item.id, {
            progress: 90 + Math.round(progress * 10)
          }),
        !captionSent ? caption : '',
        controller.signal
      );
      uploadAbortRef.current.delete(item.id);
      if (run !== uploadRunRef.current) break;

      if (sent) {
        sentAny = true;
        if (!captionSent && caption) captionSent = true;
        discardPending(item.id);
        scrollToBottom();
      } else if (!controller.signal.aborted) {
        updatePending(item.id, {
          status: 'error',
          error: 'Upload failed. Tap retry.',
          progress: 0
        });
      }
    }

    if (run === uploadRunRef.current) setUploading(false);
    if (sentAny) {
      if (captionSent) setDraft('');
      setReplyTarget(null);
    }
  }

  function sendPending() {
    if (uploading) return;
    const batch = pending.filter((item) => item.status !== 'uploading');
    if (!batch.length) return;
    void uploadAttachments(batch, draft.trim());
  }

  function retryPending(id: string) {
    if (uploading) return;
    const item = pending.find((entry) => entry.id === id);
    if (item) void uploadAttachments([item], '');
  }

  function onMediaSelect(files: File[]) {
    queueFiles(files);
  }

  function onQuickSend(files: File[]) {
    queueFiles(files, true);
  }

  function onVoiceSend(blob: Blob) {
    const file =
      blob instanceof File
        ? blob
        : new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
    void duo.sendMedia(file, replyTarget?.id ?? null).then((sent) => {
      if (!sent) return;
      setReplyTarget(null);
      scrollToBottom();
    });
  }

  function startReply(message: Message) {
    setEditing(null);
    setReplyTarget(message);
    setActionMenu(null);
    setToolsOpen(false);
    window.setTimeout(
      () => document.querySelector<HTMLTextAreaElement>('.composer-field textarea')?.focus(),
      0
    );
  }

  function startEdit(message: Message) {
    if (message.senderId !== duo.user?.id) return;
    if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW) {
      duo.setError('Messages can only be edited within 5 minutes.');
      return;
    }
    setReplyTarget(null);
    setEditing(message);
    setDraft(message.content);
    setActionMenu(null);
    window.setTimeout(() => {
      const field = document.querySelector<HTMLTextAreaElement>('.composer-field textarea');
      field?.focus();
      field?.setSelectionRange(message.content.length, message.content.length);
    }, 0);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  function scrollToMessage(id: string) {
    const item = displayItems.find((entry) => entry.messages.some((message) => message.id === id));
    if (!item) {
      duo.setNotice('The quoted message is not available.');
      return;
    }
    const element = document.getElementById(`msg-${item.key}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(id);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashId(''), 1600);
  }

  function openActionMenu(
    message: Message,
    ids: string[],
    editable: boolean,
    x: number,
    y: number
  ) {
    setActionMenu({
      message,
      ids,
      editable,
      x: Math.min(x, window.innerWidth - 190),
      y: Math.min(y, window.innerHeight - 170)
    });
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
    setReplyTarget(null);
    setEditing(null);
    setDraft('');
    void duo.selectPeer(id);
  }

  async function runConfirm() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === 'archive') await duo.archiveChat();
      if (confirmAction.type === 'message') {
        await duo.deleteMessages(confirmAction.ids, { scope: confirmAction.scope });
      }
      if (confirmAction.type === 'bulk') {
        await duo.deleteMessages([...selectedIds], { scope: confirmAction.scope });
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

  function openDeleteChat(peerId?: string) {
    setDeleteChatPeerId(peerId || duo.activePeerId || '');
    setDeleteChatScope('ME');
    setDeleteChatSenderScope('ALL');
    setDeleteChatFrom('');
    setDeleteChatTo('');
    setDeleteChatOpen(true);
  }

  async function removeChat(scope: 'ME' | 'BOTH_SIDES') {
    if (!removeChatTarget) return;
    setBusy(true);
    try {
      const count = await duo.deleteConversation({
        scope,
        senderScope: 'ALL',
        peerId: removeChatTarget.id,
        hideFromList: true
      });
      setRemoveChatTarget(null);
      duo.setNotice(
        `${removeChatTarget.name} removed from your chat list. ${count} message${count === 1 ? '' : 's'} moved to the Recycle Bin.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Could not remove chat');
    } finally {
      setBusy(false);
    }
  }

  async function runDeleteChat() {
    setBusy(true);
    try {
      const count = await duo.deleteConversation({
        scope: deleteChatScope,
        senderScope: deleteChatScope === 'BOTH_SIDES' ? deleteChatSenderScope : 'ALL',
        peerId: deleteChatPeerId || undefined,
        from: deleteChatFrom || undefined,
        to: deleteChatTo || undefined
      });
      setDeleteChatOpen(false);
      duo.setNotice(
        `Soft deleted ${count} message${count === 1 ? '' : 's'}. Recover or permanently delete them from the Recycle Bin.`
      );
    } catch (cause) {
      duo.setError(cause instanceof Error ? cause.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const deleted = duo.conversationStatus === 'DELETED';
  const archived = duo.conversationStatus === 'ARCHIVED';
  const selectedCount = selectedIds.size;
  const confirmCount =
    confirmAction?.type === 'message' ? confirmAction.ids.length : selectedCount;

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
                <div
                  key={contact.id}
                  role="button"
                  tabIndex={0}
                  className={`chat-contact ${contact.id === duo.activePeerId ? 'is-active' : ''}`}
                  onClick={() => openPeer(contact.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openPeer(contact.id);
                    }
                  }}
                >
                  <span className="chat-avatar chat-avatar-sm">{name.charAt(0).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <span className="ai-tag" title="AI account">
                          AI
                        </span>
                      </span>
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
                  {isHost && (
                    <button
                      type="button"
                      className="chat-contact-remove"
                      aria-label={`Remove ${name} from chat list`}
                      title="Remove from chat list"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRemoveChatTarget({ id: contact.id, name });
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
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
              <span className="chat-avatar">{ASSISTANT_AVATAR}</span>
              <div className="min-w-0 text-left">
                <p className="chat-name-line text-sm font-semibold">
                  <span className="truncate">{otherName}</span>
                  <span className="ai-tag" title="AI account">
                    AI
                  </span>
                </p>
                <p className="muted flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      duo.peerTyping || peerOnline ? 'bg-emerald-400' : 'bg-slate-500'
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
                        onClick={enterSelectMode}
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
                              openDeleteChat();
                            }}
                          >
                            <Trash2 size={15} /> Delete chat...
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
            The previous conversation was deleted. The Host can recover it from the Admin dashboard.
          </div>
        )}

        <div className="panel chat-panel chat-panel-flat">
          <div className="chat-scroll-wrap">
            <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
            {duo.loadingOlder && (
              <div className="chat-history-loader" aria-live="polite">
                <span className="chat-history-spinner" aria-hidden />
                <span>Loading earlier messages…</span>
              </div>
            )}
            {displayItems.map((item) => {
              const first = item.messages[0];
              const mine = first.senderId === duo.user?.id;
              const selected = item.messages.some((message) => selectedIds.has(message.id));
              const flash = item.messages.some((message) => message.id === flashId);
              return (
                <Fragment key={item.key}>
                  {item.dayLabel && (
                    <div className="chat-day-divider" role="separator">
                      <span>{item.dayLabel}</span>
                    </div>
                  )}
                  <MessageRow
                    item={item}
                    mine={mine}
                    otherName={otherName}
                    userId={duo.user?.id || ''}
                    selected={selected}
                    selectMode={selectMode}
                    flash={flash}
                    onSelect={() => item.messages.forEach((message) => toggleSelected(message.id))}
                    onReply={() => startReply(first)}
                    onEdit={item.messages.length === 1 ? () => startEdit(first) : undefined}
                    onDelete={() =>
                      setConfirmAction({
                        type: 'message',
                        ids: item.messages.map((message) => message.id),
                        scope: 'ME'
                      })
                    }
                    onMenu={(x, y) =>
                      openActionMenu(
                        first,
                        item.messages.map((message) => message.id),
                        item.messages.length === 1,
                        x,
                        y
                      )
                    }
                    onQuote={scrollToMessage}
                    onOpenMedia={(messages, index) => {
                      if (selectMode) {
                        messages.forEach((message) => toggleSelected(message.id));
                        return;
                      }
                      setLightbox({ items: messages, index });
                    }}
                  />
                </Fragment>
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
                <span className="assistant-avatar small">{ASSISTANT_AVATAR}</span>
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
            {(!atBottom || newCount > 0) && (
              <button
                type="button"
                className={`chat-jump ${newCount > 0 ? 'has-count' : ''}`}
                onClick={() => scrollToBottom()}
                aria-label={newCount > 0 ? `Scroll to ${newCount} new messages` : 'Scroll to latest'}
              >
                <ChevronDown size={18} />
                {newCount > 0 && (
                  <span>
                    {newCount} New Message{newCount === 1 ? '' : 's'}
                  </span>
                )}
              </button>
            )}
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
                onClick={() => setConfirmAction({ type: 'bulk', scope: 'ME' })}
              >
                <Trash2 size={14} /> Delete for me
              </Button>
              {isHost && (
                <Button
                  variant="danger"
                  className="!px-3 !py-1.5 text-xs"
                  disabled={selectedCount === 0}
                  onClick={() => setConfirmAction({ type: 'bulk', scope: 'EVERYONE' })}
                >
                  <Trash2 size={14} /> Delete for everyone
                </Button>
              )}
            </div>
          )}

          <div className="chat-study-cta">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <BookOpen size={15} /> Study Mode
              </p>
              <p className="muted hidden text-[11px] leading-5 sm:block">
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

          {!selectMode && (
            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSend={send}
              onTyping={(typing) => duo.notifyTyping(typing)}
              onMediaSelect={onMediaSelect}
              onQuickSend={onQuickSend}
              onVoiceSend={onVoiceSend}
              pending={pending}
              uploading={uploading}
              onSendPending={sendPending}
              onCancelPending={cancelPending}
              onRemovePending={discardPending}
              onRetryPending={retryPending}
              replyTo={replyTarget}
              replyAuthor={
                replyTarget
                  ? replyTarget.senderId === duo.user?.id
                    ? 'your message'
                    : otherName
                  : undefined
              }
              onCancelReply={() => setReplyTarget(null)}
              editing={editing}
              onCancelEdit={cancelEdit}
            />
          )}
        </div>
      </div>

      {actionMenu && (
        <>
          <div className="message-menu-backdrop" onClick={() => setActionMenu(null)} />
          <div
            className="message-action-menu"
            style={{ left: actionMenu.x, top: actionMenu.y }}
            role="menu"
          >
            <button type="button" role="menuitem" onClick={() => startReply(actionMenu.message)}>
              <Reply size={15} /> Reply
            </button>
            {actionMenu.editable &&
              actionMenu.message.senderId === duo.user?.id &&
              Date.now() - new Date(actionMenu.message.createdAt).getTime() <= EDIT_WINDOW && (
                <button type="button" role="menuitem" onClick={() => startEdit(actionMenu.message)}>
                  <Pencil size={15} /> Edit
                </button>
              )}
            {isHost ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setConfirmAction({ type: 'message', ids: actionMenu.ids, scope: 'ME' });
                    setActionMenu(null);
                  }}
                >
                  <Trash2 size={15} /> Delete for me
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setConfirmAction({ type: 'message', ids: actionMenu.ids, scope: 'EVERYONE' });
                    setActionMenu(null);
                  }}
                >
                  <Trash2 size={15} /> Delete for everyone
                </button>
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  setConfirmAction({ type: 'message', ids: actionMenu.ids, scope: 'ME' });
                  setActionMenu(null);
                }}
              >
                <Trash2 size={15} /> Delete
              </button>
            )}
          </div>
        </>
      )}

      {lightbox && (
        <MediaLightbox
          items={lightbox.items}
          index={lightbox.index}
          onIndex={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
          onClose={() => setLightbox(null)}
        />
      )}

      <Modal
        open={confirmAction !== null}
        title={
          confirmAction?.type === 'archive'
            ? 'Archive this conversation?'
            : confirmAction?.type === 'bulk'
              ? `Delete ${selectedCount} message${selectedCount === 1 ? '' : 's'}?`
              : confirmAction?.type === 'mine'
                ? 'Clear all chat for you?'
                : `Delete ${confirmCount} message${confirmCount === 1 ? '' : 's'}?`
        }
        onClose={() => setConfirmAction(null)}
      >
        <p className="muted text-sm leading-6">
          {confirmAction?.type === 'archive'
            ? 'Messages and timestamps are preserved. The conversation is removed from active Chat and can be reopened with RESTORE.'
            : (confirmAction?.type === 'bulk' || confirmAction?.type === 'message') &&
                confirmAction.scope === 'EVERYONE'
              ? 'Delete for everyone hides this message for both Host and Guest. Both copies go to the Recycle Bin and the Host can restore them from the Admin dashboard.'
              : confirmAction?.type === 'bulk' || confirmAction?.type === 'message'
                ? 'This is a soft delete from your side only. The other participant keeps their copy. The Host can recover deleted messages from the Admin dashboard.'
                : 'Your view is cleared, but the other participant keeps the conversation. New messages still arrive normally.'}
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
              : confirmAction?.type === 'bulk'
                ? confirmAction.scope === 'EVERYONE'
                  ? 'Delete selected for everyone'
                  : 'Delete selected for me'
                : confirmAction?.type === 'message' && confirmAction.scope === 'EVERYONE'
                  ? 'Delete for everyone'
                  : confirmAction?.type === 'mine'
                    ? 'Clear my chat'
                    : confirmAction?.type === 'archive'
                      ? 'Archive'
                      : 'Delete for me'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteChatOpen}
        title="Delete chat"
        onClose={() => setDeleteChatOpen(false)}
      >
        <p className="muted text-sm leading-6">
          Soft delete this chat. Deleted messages go to the Recycle Bin and can be recovered or
          permanently deleted by the Host.
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
              deleteChatScope === 'ME'
                ? 'border-fuchsia-400/40 bg-fuchsia-500/10'
                : 'border-white/10 bg-black/15'
            }`}
            onClick={() => setDeleteChatScope('ME')}
          >
            <span className="mt-0.5 h-4 w-4 rounded-full border border-white/40">
              {deleteChatScope === 'ME' && (
                <span className="block h-full w-full rounded-full bg-fuchsia-400" />
              )}
            </span>
            <span>
              <span className="block text-sm font-medium">Delete for me</span>
              <span className="muted block text-xs">Only your view is hidden. The other side keeps their copy.</span>
            </span>
          </button>
          <button
            type="button"
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left ${
              deleteChatScope === 'BOTH_SIDES'
                ? 'border-fuchsia-400/40 bg-fuchsia-500/10'
                : 'border-white/10 bg-black/15'
            }`}
            onClick={() => setDeleteChatScope('BOTH_SIDES')}
          >
            <span className="mt-0.5 h-4 w-4 rounded-full border border-white/40">
              {deleteChatScope === 'BOTH_SIDES' && (
                <span className="block h-full w-full rounded-full bg-fuchsia-400" />
              )}
            </span>
            <span>
              <span className="block text-sm font-medium">Delete all chat for both sides</span>
              <span className="muted block text-xs">Both Host and Guest copies are soft deleted to Recycle Bin.</span>
            </span>
          </button>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-black/15 p-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="field-label">From date</span>
            <input
              type="date"
              className="field"
              value={deleteChatFrom}
              onChange={(event) => setDeleteChatFrom(event.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="field-label">To date</span>
            <input
              type="date"
              className="field"
              value={deleteChatTo}
              onChange={(event) => setDeleteChatTo(event.target.value)}
            />
          </label>
          <p className="muted text-[11px] leading-5 sm:col-span-2">
            Leave both dates empty to delete the whole chat. Set one or both dates to delete only
            messages from that period.
          </p>
        </div>

        {deleteChatScope === 'BOTH_SIDES' && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
            <p className="text-sm font-medium">Which messages should be deleted on both sides?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ['MINE', 'Only my messages'],
                  ['THEIRS', 'Only their messages'],
                  ['ALL', 'Both of our messages']
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  className="!px-3 !py-1.5 text-xs"
                  variant={deleteChatSenderScope === value ? 'primary' : 'ghost'}
                  onClick={() => setDeleteChatSenderScope(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setDeleteChatOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => void runDeleteChat()} disabled={busy}>
            {busy ? 'Working…' : 'Delete chat'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={removeChatTarget !== null}
        title={`Remove ${removeChatTarget?.name || 'chat'} from your list?`}
        onClose={() => setRemoveChatTarget(null)}
      >
        <p className="muted text-sm leading-6">
          Choose one action. Both moves soft delete this chat and send the messages to the Recycle
          Bin, where the Host can restore them.
        </p>
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 p-3 text-left transition hover:border-fuchsia-300/40 hover:bg-fuchsia-500/10"
            onClick={() => void removeChat('ME')}
            disabled={busy}
          >
            <span>
              <span className="block text-sm font-medium">Delete all chat for me</span>
              <span className="muted block text-xs">
                Only your copy is hidden. {removeChatTarget?.name || 'They'} keeps theirs.
              </span>
            </span>
            <Trash2 size={16} className="shrink-0 text-rose-200" />
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 p-3 text-left transition hover:border-fuchsia-300/40 hover:bg-fuchsia-500/10"
            onClick={() => void removeChat('BOTH_SIDES')}
            disabled={busy}
          >
            <span>
              <span className="block text-sm font-medium">Delete for everyone</span>
              <span className="muted block text-xs">
                Both copies are hidden and kept in the Recycle Bin.
              </span>
            </span>
            <Trash2 size={16} className="shrink-0 text-rose-200" />
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setRemoveChatTarget(null)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}

function MessageRow({
  item,
  mine,
  otherName,
  userId,
  selected,
  selectMode,
  flash,
  onSelect,
  onReply,
  onEdit,
  onDelete,
  onMenu,
  onQuote,
  onOpenMedia
}: {
  item: DisplayItem;
  mine: boolean;
  otherName: string;
  userId: string;
  selected: boolean;
  selectMode: boolean;
  flash: boolean;
  onSelect: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onMenu: (x: number, y: number) => void;
  onQuote: (id: string) => void;
  onOpenMedia: (messages: Message[], index: number) => void;
}) {
  const message = item.messages[0];
  const last = item.messages[item.messages.length - 1];
  const [offset, setOffset] = useState(0);
  const touchRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (longPressRef.current) clearTimeout(longPressRef.current);
    };
  }, []);

  const hasMedia = Boolean(item.media || message.attachmentId);
  const bubbleClass = [
    mine ? 'bubble bubble-sent chat-bubble' : 'study-ai-bubble chat-bubble',
    hasMedia ? 'chat-bubble-media' : '',
    selected ? 'bubble-selected' : '',
    flash ? 'message-flash' : ''
  ]
    .filter(Boolean)
    .join(' ');

  function clearLongPress() {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }

  const bubble = (
    <div
      className={bubbleClass}
      onClick={selectMode ? onSelect : undefined}
      onDoubleClick={selectMode ? undefined : onReply}
      onContextMenu={(event) => {
        if (selectMode) return;
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchRef.current = { x: touch.clientX, y: touch.clientY, moved: false };
        if (!selectMode) {
          clearLongPress();
          longPressRef.current = setTimeout(() => {
            onMenu(touch.clientX, touch.clientY);
            longPressRef.current = null;
          }, 550);
        }
      }}
      onTouchMove={(event) => {
        const start = touchRef.current;
        if (!start || selectMode) return;
        const touch = event.touches[0];
        const dx = touch.clientX - start.x;
        const dy = Math.abs(touch.clientY - start.y);
        if (Math.abs(dx) > 8 || dy > 8) {
          start.moved = true;
          clearLongPress();
        }
        if (dx > 0 && dy < 40) setOffset(Math.min(dx, 84));
      }}
      onTouchEnd={() => {
        clearLongPress();
        if (offset > 56) onReply();
        setOffset(0);
        touchRef.current = null;
      }}
      role={selectMode ? 'button' : undefined}
      aria-pressed={selectMode ? selected : undefined}
    >
      {selectMode && selected && (
        <span className="selection-check">
          <Check size={11} />
        </span>
      )}

      {message.replyTo || message.replyToId ? (
        <button
          type="button"
          className="quoted-message"
          onClick={(event) => {
            event.stopPropagation();
            if (message.replyTo) onQuote(message.replyTo.id);
          }}
        >
          <span className="quoted-bar" />
          <span className="min-w-0 flex-1 text-left">
            <span className="quoted-author">
              {message.replyTo?.senderId === userId ? 'You' : otherName}
            </span>
            <span className="quoted-text">
              {message.replyTo
                ? message.replyTo.content || attachmentLabel(message.replyTo as Message)
                : 'Original message unavailable'}
            </span>
          </span>
        </button>
      ) : null}

      {item.media ? (
        <MediaGrid messages={item.messages} onOpen={onOpenMedia} />
      ) : message.attachmentId ? (
        message.attachmentKind === 'VIDEO' ? (
          <MediaGrid messages={[message]} onOpen={onOpenMedia} />
        ) : message.attachmentKind === 'AUDIO' ? (
          <AudioBubble message={message} />
        ) : message.attachmentKind === 'IMAGE' ? (
          <MediaGrid messages={[message]} onOpen={onOpenMedia} />
        ) : (
          <DocumentBubble message={message} />
        )
      ) : null}

      {message.content && !item.media && (
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
      )}

      <div className={`chat-bubble-meta ${mine ? 'justify-end' : 'justify-start'}`}>
        <span>{formatTime(last.createdAt)}</span>
        {last.editedAt && <span className="chat-edited">edited</span>}
        {last.attachmentSize && last.attachmentKind !== 'IMAGE' ? (
          <span>{formatFileSize(last.attachmentSize)}</span>
        ) : null}
        {mine && <MessageStatus message={last} otherName={otherName} />}
      </div>
    </div>
  );

  const content = (
    <div
      style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      className={`relative chat-bubble-wrap${hasMedia ? ' has-media' : ''}`}
    >
      {offset > 12 && (
        <span className="swipe-reply-hint" style={{ opacity: Math.min(offset / 60, 1) }}>
          <Reply size={16} />
        </span>
      )}
      {bubble}
    </div>
  );

  return mine ? (
    <div id={`msg-${item.key}`} className="message-row mine" data-message-id={message.id}>
      {content}
    </div>
  ) : (
    <div id={`msg-${item.key}`} className="study-ai-row chat-ai-row" data-message-id={message.id}>
      <span className="assistant-avatar small">{ASSISTANT_AVATAR}</span>
      {content}
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
