# Messaging / Chat System — Technical Audit

**Repository:** `/Users/macbookpro/mj`
**Commit audited:** `8da93e1` (2026-11-17)
**Audit date:** 2026-11-18
**Audit type:** Read-only static analysis (no code changes, no DB changes, no package installs)
**Report status:** Delivered for review. No remediation applied yet.

---

## 1. Executive Summary

The messaging subsystem is a Socket.IO + Prisma/PostgreSQL stack with a single
"Host ↔ Guest" chat model, a separate emergency "Game Chat" (Host inbox), and
media attachments stored on a private volume. The *happy path* (both users
online, chat unlocked, under 500 messages) is functional and reasonably
well-structured. The *unhappy paths* are where the system fails, and they fail
in ways that are invisible to the user.

The headline defect is a single interaction that produces the most user-visible
symptom ("message sent but not received"):

> On any socket disconnect, the client **locks chat and navigates to HOME**
> (`useDuoApp.ts:1391-1404`). While locked, inbound `message:new` events are
> **silently discarded** (`useDuoApp.ts:1412-1415`). On reconnect, the server
> does **not** replay missed messages — it only rewrites `deliveredAt` for
> globally-undelivered rows (`sockets/index.ts:55-73`), and the client-side
> `messages:recovered` listener is never triggered by a reconnect (the event is
> only emitted from the admin "clear" routes, `routes/chat.ts:1301,1362`).

There is no send acknowledgement, no client-generated message ID, no
idempotency key, and no per-conversation sequence number. The composer clears
optimistically before the server confirms anything. A dropped socket at the
moment of `emit` therefore loses the message permanently, with no error shown
and no retry.

Secondary structural defects compound this:

- History is fetched as **the oldest 500 rows** (`orderBy createdAt ASC, take 500`,
  `routes/chat.ts:207-215`) with no cursor. Past 500 messages, the newest
  messages are unreachable on reload and in a fresh session.
- **Delivery** is a presence guess, not a receipt: `delivered = isOnline(other.id)`
  is evaluated *before* the insert and echoed to the sender immediately
  (`sockets/chat.ts:192-219`). Presence is an in-process `Map`, so it is wrong
  after a restart and wrong under any horizontal scaling.
- The Host's recipient is resolved from **mutable preference state**
  (`activePeerId`, falling back to the oldest guest, `peer.ts:14-23`). Sends are
  addressed at send-time, so switching the selected guest silently changes the
  destination of the conversation.
- Most socket listeners are **unguarded async functions**. Combined with the
  absence of a process-level `unhandledRejection` handler (confirmed by grep),
  a single Prisma error in `message:read` or `chat:typing` can terminate the
  API process — which then triggers the disconnect-lock bug for every client at
  once.
- `message:read` is **not scoped to a conversation or participant**
  (`sockets/chat.ts:248-260`): any authenticated socket can mark arbitrary
  message IDs as read and receive the owning `senderId` back.

**Overall health score: ~37/100.** Correctness under failure, delivery
semantics, and observability are the weak axes. See §21.

**Recommended first two actions (highest ratio of risk removed to code
changed):**

1. **P0.7** — wrap every socket listener in a `safeOn()` helper and add
   `process.on('unhandledRejection' | 'uncaughtException')` logging. This stops
   the API from dying on a single bad request.
2. **P0.8** — scope `message:read` to the caller's conversation. This closes the
   authorization hole with a few lines.

Neither is a rewrite. Both are prerequisites before touching the larger
sync/idempotency work.

---

## 2. Scope, Method & Verification Status

### 2.1 In scope

| Area | Files reviewed |
|---|---|
| Socket layer | `apps/server/src/sockets/index.ts`, `sockets/chat.ts`, `sockets/calls.ts`, `sockets/games.ts` |
| REST chat API | `apps/server/src/routes/chat.ts` (1,961 lines) |
| Domain services | `services/peer.ts`, `services/conversations.ts`, `services/notifier.ts`, `services/presence.ts`, `services/media-storage.ts` |
| Client state | `apps/web/src/hooks/useDuoApp.ts` (2,379 lines) |
| Client UI | `apps/web/src/components/ChatScreen.tsx` (1,197 lines) |
| Data model | `prisma/schema.prisma`, all 9 migrations under `prisma/migrations/` |
| Server bootstrap | `apps/server/src/index.ts` |
| Deployment/docs | `docs/*.md`, deploy configuration |

### 2.2 Method

Static reading of the actual source at commit `8da93e1`. Every claim in this
report is traceable to a `file:line` citation. No inference was accepted where
source could be read directly.

### 2.3 Verification status (important)

This environment has **no `node_modules`, no built artefacts, no PostgreSQL
client/server, and no Docker**. Therefore:

| Item | Status |
|---|---|
| Static code behaviour | **VERIFIED** (source read) |
| Schema/migration contents | **VERIFIED** (files read) |
| Actual runtime delivery behaviour | **NOT VERIFIED** |
| Prisma query plans / index usage | **NOT VERIFIED** |
| Socket reconnect timing under real networks | **NOT VERIFIED** |
| Load/throughput characteristics | **NOT VERIFIED** |
| Reproduced bug reports | **NOT VERIFIED** (no runtime available) |

Any statement below about *observed* behaviour is explicitly marked
`NOT VERIFIED`. Statements about *code paths* are verified by citation.

---

## 3. System Architecture Map

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  Next.js web client          │        │  Express + Socket.IO API     │
│                              │        │                              │
│  useDuoApp (single hook)     │◄──────►│  io.use(resolveSession)      │
│   ├─ socket lifecycle        │  WS    │   └─ room: user:<id>         │
│   ├─ messages[] state        │        │                              │
│   ├─ chatUnlockedRef         │        │  sockets/chat.ts             │
│   └─ screen routing          │        │   ├─ message:send            │
│                              │        │   ├─ message:read            │
│  ChatScreen (local draft)    │        │   ├─ typing / hide / open    │
│   └─ optimistic clear        │        │   └─ archive / restore/delete│
└──────────────┬───────────────┘        │                              │
               │ HTTPS                  │  services/                  │
               ▼                        │   ├─ peer.ts (routing)       │
┌──────────────────────────────┐        │   ├─ conversations.ts        │
│  REST /api/chat/*            │◄──────►│   ├─ notifier.ts (fan-out)   │
│  history, media, hide, admin │        │   └─ presence.ts (in-memory) │
└──────────────────────────────┘        └──────────────┬───────────────┘
                                                       │ Prisma
                                                       ▼
                                        ┌──────────────────────────────┐
                                        │  PostgreSQL                  │
                                        │  Conversation / Message /    │
                                        │  MessageHide / ChatMedia /   │
                                        │  Notification / GameMessage  │
                                        └──────────────────────────────┘
```

### 3.1 Key architectural facts

| Fact | Evidence | Consequence |
|---|---|---|
| Single Socket.IO process, no Redis adapter | `index.ts` — `new Server(server, …)` only; no adapter import | Cannot scale horizontally; presence and rooms are per-process |
| Presence is an in-memory map | `services/presence.ts` (29 lines) | Lost on restart; wrong behind a load balancer |
| One global "current peer" per Host | `peer.ts:14-23` | Recipient is mutable state, not part of the message |
| Message send and delivery receipt are coupled | `sockets/chat.ts:192-219` | Receipt can be "delivered" before the recipient's client ever sees it |
| No server-side message replay on connect | `sockets/index.ts:47-83` | Missed messages are unrecoverable except by full history reload |
| History is oldest-N | `routes/chat.ts:207-215` | Newest messages disappear beyond N |
| All reconnect state lives in one hook | `useDuoApp.ts` | Any disconnect wipes chat context |

---

## 4. Data Model & Storage

### 4.1 Core models (relevant fields)

**`Conversation`** (`schema.prisma:65-75`)

```prisma
model Conversation {
  id        String             @id @default(cuid())
  status    ConversationStatus @default(ACTIVE)   // ACTIVE | ARCHIVED | DELETED
  hostId    String?
  guestId   String?
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt
  messages  Message[]
  @@unique([hostId, guestId])
  @@index([status, updatedAt])
}
```

**`Message`** (`schema.prisma:76-101`)

```prisma
model Message {
  id             String            @id @default(cuid())
  conversationId String
  senderId       String
  content        String
  destination    MessageDestination @default(CHAT)  // CHAT | GAME
  createdAt      DateTime          @default(now())
  deliveredAt    DateTime?
  readAt         DateTime?
  deletedAt      DateTime?
  attachmentId   String?
  attachmentKind String?
  attachmentMime String?
  attachmentName String?
  attachmentSize Int?
  replyToId      String?
  editedAt       DateTime?
  hides          MessageHide[]
  @@index([conversationId, createdAt])
  @@index([destination, createdAt])
  @@index([replyToId])
}
```

**`MessageHide`** (`schema.prisma:105-114`) — per-account visibility with
`@@unique([messageId, userId])`. Good design: hiding is per-user, not global.

**`ChatMedia`** (`schema.prisma:117-128`) — `data Bytes?` **and**
`storageKey String? @unique`. Two storage backends coexist; the nullable `data`
is a legacy path.

**`GameMessage`** (`schema.prisma:147-157`) — separate table for the Host
"inbox"/emergency channel, with its own `readAt`.

### 4.2 Missing model capabilities

| Missing | Why it matters |
|---|---|
| `clientMessageId` / idempotency key | No way to dedupe a retry; no way to correlate an optimistic bubble with the server row |
| Per-conversation monotonic `seq` | No reliable ordering, no "give me everything after seq N" sync |
| `status` enum on Message (SENDING/SENT/FAILED) | Status is inferred from timestamps, which conflate "online" with "delivered" |
| `editedAt` used anywhere? | Column exists; edit path not present in the audited send flow (`NOT VERIFIED` for admin paths) |
| `deletedAt` used in send/read paths | Soft delete column is effectively dead: history filters `deletedAt: null`, but only `chat:delete` writes it via a hard `deleteMany` of messages (`sockets/chat.ts:353-366`) |
| Index supporting history-by-cursor | `[conversationId, createdAt]` exists; cursor pagination would still need `(conversationId, createdAt, id)` for stable ties |

### 4.3 Migration state

9 migrations present, from `20261112000000_init` to
`20261123000000_chat_media_disk_storage`. The progression shows media moving
from DB bytes to disk (`storageKey`), but **no migration adds idempotency or
sequencing** — confirming the gap is architectural, not an oversight in one
migration.

---

## 5. Message Send Lifecycle (End-to-End)

### 5.1 Server path — `message:send`

Entry: `sockets/chat.ts:74-232`, registered at `:234-239`.

| Step | Line(s) | Behaviour | Assessment |
|---|---|---|---|
| 1. Rate limit | 75-81 | In-memory array, 30 msgs / 10 s **per socket** | Resets on reconnect; trivially bypassed with a new socket |
| 2. Payload validation | 83-85 | `typeof content === 'string'`, trim, max 5000 | Silent `return` for non-string — no error to client |
| 3. Attachment ownership | 87-120 | `chatMedia.findUnique`, `media.ownerId !== user.id` → error | Correct |
| 4. Empty guard | 122 | `if (!content && !attachment) return` | Silent drop |
| 5. Destination | 124-127 | Anything except `GAME` becomes `CHAT` | Fine, but no validation error |
| 6. Peer resolution | 129-133 | `peerFor(user.id)` | **Mutates recipient semantics** — see §14 |
| 7. Chat unlock | 135-138 | Host bypasses; guest reads `chatUnlocked` | Correct-ish, one extra query per send |
| 8. Game branch | 140-161 | `gameMessage.create` + `emitToUser(other)` + notification | Sender gets no echo by design |
| 9. Conversation resolution | 163-173 | `getConversationForNewMessage` | **Non-atomic find-or-create** — see RC-9 |
| 10. Reply validation | 175-190 | Scoped to conversation + `deletedAt: null` | Correct |
| 11. Delivery guess | 192 | `const delivered = isOnline(other.id)` | **Presence ≠ delivery** — RC-6 |
| 12. Insert | 193-215 | `message.create` with `deliveredAt: delivered ? new Date() : null` | Receipt baked in at insert |
| 13. Fan-out | 217-218 | `emitToUser(sender)`, `emitToUser(other)` | Sender echo is the only confirmation |
| 14. Receipt echo | 219 | `if (delivered) emit delivered` | Fires before recipient processes `message:new` |
| 15. Notification | 221-231 | Preference check → `notifyUser` (persist + push) | Extra queries per message |

**Critical observation:** the sender's only success signal is receiving its own
`message:new` echo (step 13). If that echo is lost — socket died between
`emit` and receipt — the client has **no** retry, **no** timeout, **no**
correlation ID. The message may or may not be in the DB.

### 5.2 Client path

`useDuoApp.ts:1850-1874`:

```ts
const sendMessage = useCallback((content, destination = 'CHAT', attachment, replyToId) => {
  const value = content.trim();
  if (!value && !attachment) return false;
  if (destination === 'CHAT' && !chatUnlockedRef.current) destination = 'GAME';
  const socket = socketRef.current;
  if (!socket?.connected) {
    showError('Live connection is not ready. Your message was not sent.');
    return false;
  }
  socket.emit('message:send', { content: value, destination, attachment: ..., replyToId: ... });
  return true;
}, [navigate, showError]);
```

| Property | Value |
|---|---|
| Acknowledgement | **None** — `emit` with no ack callback |
| Client ID | **None** |
| Timeout | **None** |
| Retry queue | **None** |
| Offline queue | **None** — hard refusal when socket down |
| Return value | `true` immediately after `emit` |

`ChatScreen.tsx` then clears the draft on the strength of that `true`
(lines 243, 258, 374, 442, 499). The user's text is gone from the UI **before**
the server has acknowledged anything.

### 5.3 Lifecycle state diagram (as implemented)

```
        ┌─────────┐  emit   ┌──────────────┐  prisma   ┌─────────┐
draft ─►│ emit()  │────────►│ socket queue │──────────►│ insert  │
        └─────────┘         └──────────────┘           └────┬────┘
             │                                                │
             │ draft cleared here                             │ emit echo
             ▼                                                ▼
        ┌─────────┐                                     ┌──────────┐
        │  (gone) │◄──── socket drops anywhere ─────────│ messages[]│
        └─────────┘                                     └──────────┘
```

There is no state transition from "sent" to "failed". Failure is
indistinguishable from success in the UI.

---

## 6. Socket Event Catalog

### 6.1 Client → Server

| Event | Payload | Handler | Guarded? | Notes |
|---|---|---|---|---|
| `message:send` | `{content, destination, attachment, replyToId}` | `chat.ts:234` | ✅ `.catch()` at call site | Only chat listener with error wrapper |
| `game:message:send` | same | `chat.ts:241` | ✅ `.catch()` | |
| `message:read` | `string` id | `chat.ts:248` | ❌ raw `async` | **Unscoped IDOR + crash vector** |
| `chat:typing` | `{typing}` | `chat.ts:262` | ❌ | Crash vector |
| `chat:hide` | — | `chat.ts:272` | ❌ | Writes `screenPreference` |
| `chat:open` | — | `chat.ts:277` | ❌ | Unlock check |
| `chat:archive` | — | `chat.ts:286` | ❌ | Host only |
| `chat:restore` | — | `chat.ts:318` | ❌ | Any authenticated user |
| `chat:delete` | — | `chat.ts:343` | ❌ | Host only; hard-deletes all messages |
| `screen:set` | `{screen}` | `chat.ts:376` | ❌ | Allow-list enforced |
| `permission:notify` | — | `chat.ts:391` | ❌ | Guest only |
| `permission:changed` | — | `chat.ts:409` | ❌ | |
| `permission:status` | — | `chat.ts:421` | ❌ | |
| `call:*` | — | `sockets/calls.ts` | `NOT VERIFIED` | Out of chat scope |

### 6.2 Server → Client (chat-relevant)

| Event | Emitted from | Client handler | Notes |
|---|---|---|---|
| `message:new` | `chat.ts:217-218` | `useDuoApp.ts:1412` | Dropped if `!chatUnlockedRef.current` |
| `message:delivered` | `chat.ts:219`, `index.ts:68` | `:1451` | Presence-based; also replayed unscoped on connect |
| `message:read` | `chat.ts:256,258` | `:1461` | Sent to both parties |
| `message:error` | `chat.ts:72` | `:1409` | Only explicit failure channel |
| `message:updated` | admin/edit paths | `:1441` | |
| `message:deleted` | delete path | `:1469` | |
| `message:hidden` | `routes/chat.ts:451` | `:1473` | |
| `messages:recovered` | **only** `routes/chat.ts:1301,1362` | `:1447` | **Never emitted on reconnect** |
| `chat:typing` | `chat.ts:265` | `:1484` | |
| `chat:state` | multiple | `:NOT VERIFIED` | |
| `chat:deleted` | `chat.ts:372-373` | `NOT VERIFIED` | Broadcast to every user |
| `presence:list` | `index.ts:26,53` | `NOT VERIFIED` | Full list on every change |
| `presence:update` | `index.ts:28,93` | `NOT VERIFIED` | Per-user fan-out |
| `notification:*` | `notifier.ts:53,68,85` | `NOT VERIFIED` | |

### 6.3 The dead resync hook

`useDuoApp.ts:1447` subscribes to `messages:recovered` and calls
`loadMessages()`. That is exactly the hook a reconnect would need. But grep
shows the event is emitted **only** from the two admin "clear conversation"
routes. There is no `io.on('connection')` emission, no `socket.emit` on
`connect`. The resync capability exists in the client and was never wired to
the reconnect path.

**This single omission is the primary cause of the reported symptom.**

---

## 7. REST API Surface (chat-relevant)

| Method | Path | Purpose | Notes |
|---|---|---|---|
| `GET` | `/api/chat/messages?destination=` | History | `orderBy ASC, take 500` → oldest 500 (`chat.ts:207-215`) |
| `POST` | `/api/chat/messages/hide` | Per-user hide | Max 500 ids; scoped to conversation ✅ |
| `POST` | `/api/chat/messages/hide-all` | Hide all | Scoped ✅ |
| `POST` | `/api/chat/media` | Upload | Disk storage (`storageKey`) |
| `GET` | `/api/chat/media/:id` | Download | Ownership check `NOT VERIFIED` in detail |
| `POST` | `/api/chat/inbox/:id/read` | Mark game message read | |
| `POST` | `/api/chat/screen` | Persist screen | Called on disconnect with `HOME` |
| admin | clear/hide endpoints | Emits `messages:recovered` | The only emitters |

### 7.1 History query — detailed

```ts
// apps/server/src/routes/chat.ts:207-215
const rows = await prisma.message.findMany({
  where: {
    conversationId: conversation.id,
    destination,
    deletedAt: null,
    hides: { none: { userId: req.user!.id } }
  },
  orderBy: { createdAt: 'asc' },
  take: 500,
  ...
});
```

Consequences:

1. **Oldest 500.** Once a conversation exceeds 500 messages, every reload
   returns the beginning of history and the most recent messages are missing.
2. **No cursor / no `before` / no `after`.** The client cannot page.
3. **No `hasMore` flag.** The client cannot even know it is truncated.
4. **The newest messages are the ones that matter**, and they are exactly the
   ones dropped.
5. GAME destination uses the same shape, so the Host inbox has the same cliff.

Combined with the absence of reconnect replay, the only recovery path a user
has is "reload", which returns the *wrong 500 messages* after enough activity.
This is a self-reinforcing failure: the longer the conversation, the worse the
perceived reliability.

---

## 8. Client State Machine & Reconnect Behaviour

### 8.1 Disconnect handler (the core defect)

```ts
// apps/web/src/hooks/useDuoApp.ts:1391-1404
socket.on('disconnect', () => {
  if (callIdRef.current) { setCallState('RECONNECTING'); setCallMuted(true); }
  lockChatSession();          // chatUnlockedRef = false
  setScreen('HOME');          // navigate away from CHAT
  void api('/chat/screen', {  // persist HOME server-side
    method: 'POST',
    body: JSON.stringify({ screen: 'HOME' })
  }).catch(() => undefined);
});
```

Effects, in order:

| # | Effect | Consequence |
|---|---|---|
| 1 | `lockChatSession()` | `chatUnlockedRef.current = false` |
| 2 | `setScreen('HOME')` | Chat unmounted; local draft state destroyed |
| 3 | `POST /chat/screen {HOME}` | Server records the user as "not in chat" |
| 4 | `message:new` arrives during reconnect | **Dropped** by guard at `:1415` |
| 5 | Reconnect succeeds | `connect` handler only emits `call:rejoin` (`:1385-1389`) |
| 6 | No history reload | `messages[]` remains stale/empty |
| 7 | No unread reconciliation | Badge may drift from server truth |

So a 2-second WiFi blip is presented to the user as "the app navigated home
and the conversation reset". This is the mechanism behind the common complaint
"message aaya hi nahi" — the message may be in PostgreSQL the whole time.

### 8.2 Inbound message guard

```ts
// apps/web/src/hooks/useDuoApp.ts:1412-1415
socket.on('message:new', (message: Message) => {
  if (!chatUnlockedRef.current) return;   // <-- silent discard
  ...
});
```

The guard is a *privacy* measure (do not keep private content in memory
without the promo code). It is defensible as a design goal, but it is
implemented as a **drop**, not a **defer**. The correct privacy-preserving
behaviour is to record a "pending sync" marker and fetch on unlock — not to
lose the event.

### 8.3 Reconnect path

```ts
socket.on('connect', () => {
  socket.emit('call:rejoin', callIdRef.current ? { callId: callIdRef.current } : {});
});
```

No `loadMessages()`, no `sync?since=`, no `chatUnlocked` re-assertion, no
`message:read` flush. Calls are recovered; messages are not.

### 8.4 State ownership problem

`messages[]`, `unread`, `draft`, and `chatUnlockedRef` all live in one
2,379-line hook. There is no store, no query cache, no persistence. Every
unmount/remount cycle is a full reset. This is why there is no place to put a
"pending outbox" even if one were added.

---

## 9. Offline / Disconnect Scenarios (A–F)

Legend: ✅ correct, ⚠️ degraded, ❌ broken.

### Scenario A — Recipient offline at send time

1. Sender online, recipient offline.
2. `delivered = isOnline(other)` → `false`.
3. Row inserted with `deliveredAt = null`.
4. Sender gets `message:new` echo → bubble renders as "Sent".
5. Recipient later connects. `sockets/index.ts:57-70` finds the row
   (`senderId != me`, `deliveredAt: null`), sets `deliveredAt`, emits
   `message:delivered` to the sender.
6. Recipient's client does **not** receive `message:new` and does **not**
   reload history.

**Result:** sender sees "Delivered"; recipient sees nothing until manual reload.
⚠️ **Misleading but eventually recoverable via reload.**

### Scenario B — Sender offline at send time

`socket.connected === false` → hard error "Live connection is not ready."
Draft is **not** cleared (returns `false`), so text survives. ✅ Acceptable,
but no outbox: the user must retry manually.

### Scenario C — Socket drops immediately after `emit`

1. Client `emit`s; draft cleared; `sendMessage` returns `true`.
2. Socket dies before the frame reaches the server (or server dies before insert).
3. No ack, no timeout, no retry.
4. On reconnect: no `messages:recovered`, no history reload.
5. Bubble disappears entirely (it was never in `messages[]`, only the draft was cleared).

**Result:** ❌ **Silent permanent loss.** This is the reported bug.

### Scenario D — Recipient's socket drops right after server emits

1. Server inserts, emits to `user:<recipient>` room.
2. Recipient's socket is mid-disconnect; room membership gone or frame lost.
3. `deliveredAt` was already set to `new Date()` (because `isOnline` was true).
4. Sender sees "Delivered". Recipient never sees the message and never syncs.

**Result:** ❌ **False "Delivered", permanent invisible loss** until a full
reload (which may itself return the wrong 500).

### Scenario E — API process restart

1. All sockets disconnect → every client runs the lock+HOME handler (§8.1).
2. In-memory presence map is empty.
3. Clients reconnect; `connect` emits only `call:rejoin`.
4. Undelivered rows are stamped and receipts fanned out to senders.
5. No client reloads history.

**Result:** ❌ Every open conversation visually resets; messages sent during the
restart window are only recoverable by manual reload.

### Scenario F — Long conversation (>500 messages)

1. Reload → `GET /api/chat/messages` returns oldest 500.
2. Newest messages absent; no `hasMore`; no cursor.
3. New live messages append after the *old* 500 in memory, producing a
   discontinuous timeline.

**Result:** ❌ History corruption in the UI; unrecoverable without DB access.

---

## 10. Failure Matrix (25 Scenarios)

Severity: **S1** data loss / security, **S2** wrong state, **S3** degraded UX.

| # | Scenario | Expected | Actual (code path) | Sev |
|---|---|---|---|---|
| 1 | Send while online, both healthy | delivered | works | — |
| 2 | Send, socket drops before ack | retry or fail visibly | silent loss | S1 |
| 3 | Send, API restarts mid-insert | retry/idempotent | unknown outcome, no retry | S1 |
| 4 | Recipient offline, then online | message appears | needs manual reload | S2 |
| 5 | Recipient online but socket dying | appears | marked delivered, never shown | S1 |
| 6 | Guest sends during Host peer switch | stays in same thread | destination may change | S1 |
| 7 | Host switches `activePeerId` mid-conversation | explicit thread choice | silent re-target | S1 |
| 8 | `message:read` for foreign id | reject | accepted, leaks `senderId` | S1 |
| 9 | Duplicate submit (double-tap) | deduped | two rows | S2 |
| 10 | Client retry after timeout (if added) | deduped | n/a today; would duplicate | S2 |
| 11 | >500 messages, reload | newest page | oldest page | S2 |
| 12 | >500, live append | continuous | discontinuity | S2 |
| 13 | Reply to message hidden by recipient | quoted preview? | allowed (hide is per-user) | S3 |
| 14 | Reply to deleted message | error | error ✅ | — |
| 15 | Archive then send | error + restore hint | error ✅ (`CONVERSATION_ARCHIVED`) | — |
| 16 | Two guests, Host idle | define recipient | oldest guest silently | S2 |
| 17 | Concurrent first message both sides | one conversation | possible P2002 on create | S2 |
| 18 | Prisma error in `message:read` | handled | unhandled rejection → process exit risk | S1 |
| 19 | Prisma error in `chat:typing` | handled | same | S1 |
| 20 | Malformed `content` (non-string) | validation error | silent drop | S3 |
| 21 | Oversize content (>5000) | validation error | silent drop | S3 |
| 22 | Rate limit exceeded | error ✅ | error ✅ (per socket only) | S3 |
| 23 | Reconnect after 2s blip | resume chat | locked + HOME | S2 |
| 24 | Two API instances | consistent rooms/presence | broken (no adapter) | S1 |
| 25 | Notification duplicate | deduped | `dedupeKey` ✅ | — |

Aggregate: **8 × S1, 8 × S2, 5 × S3, 4 correct.**

---

## 11. Root Cause Analysis

### RC-1 — No missed-message synchronization on reconnect
`sockets/index.ts:47-83` and `useDuoApp.ts:1385-1389`. The server never replays;
the client never asks. `messages:recovered` exists but is only emitted by admin
clear routes. **Primary cause of "sent but not received".**

### RC-2 — Chat is destroyed on every disconnect
`useDuoApp.ts:1391-1404`. `lockChatSession()` + `setScreen('HOME')` +
persisted `HOME`. Any transport hiccup destroys UI context and drops inbound
events (§8.2).

### RC-3 — Inbound messages are dropped while locked, not deferred
`useDuoApp.ts:1412-1415`. Privacy guard implemented as discard. No pending-sync
marker.

### RC-4 — No send acknowledgement, client ID, or idempotency
`sockets/chat.ts:234-239` + `useDuoApp.ts:1850-1874`. Fire-and-forget `emit`.
No `clientMessageId` column. Retries are impossible and duplicates unavoidable.

### RC-5 — Optimistic draft clear
`ChatScreen.tsx:243,258,374,442,499`. Text removed before server confirmation.

### RC-6 — "Delivered" is a presence guess
`sockets/chat.ts:192` + `:199` + `:219`. `isOnline()` is an in-process `Map`
(`services/presence.ts`). Not a receipt, not durable, not multi-instance safe.

### RC-7 — History is oldest-500, unpaginated
`routes/chat.ts:207-215`. Newest messages unreachable past 500.

### RC-8 — Recipient is mutable routing state
`services/peer.ts:14-23`, consumed at `sockets/chat.ts:129`. `activePeerId`
fallback to oldest guest. Message rows do not store the recipient; only the
conversation does.

### RC-9 — Non-atomic conversation creation
`services/conversations.ts:21-34`. `findUnique` → `create`. Concurrent first
messages can hit the unique constraint (`P2002`) with no retry.

### RC-10 — Unguarded async socket listeners
`chat.ts:248,262,272,277,286,318,343,376,391,409,421` and `index.ts:47`.
No `safeOn()`, no `unhandledRejection` handler anywhere in `apps/server/src`.
Node 26 terminates on unhandled rejection by default.

### RC-11 — Unscoped `message:read`
`chat.ts:248-260`. `updateMany({ where: { id, senderId: { not: user.id } } })` has
no conversation/participant constraint. Any authenticated user can mark
arbitrary messages read and receive the sender's ID.

### RC-12 — Presence broadcast is O(N²)
`index.ts:24-30`. For each online user, `io.emit` a `presence:update` to
everyone, on every connect/disconnect. Plus a full `presence:list`.

---

## 12. Delivery & Read Receipt Semantics

| Signal | Written when | Meaning today | Should mean |
|---|---|---|---|
| `deliveredAt` | At insert if peer online; on connect for undelivered | "peer had a socket at that moment" | "recipient's client persisted the message" |
| `readAt` | Client emits `message:read` on view | "recipient's client saw it" | same, but must be scoped |
| `message:delivered` | Immediately after insert if online; on connect replay | optimistic | should be a real ack |
| `message:read` | After `updateMany` count > 0 | bilateral notification | same |

Problems:

1. `deliveredAt` is set **before** the recipient can possibly have received the
   frame (`chat.ts:192` runs before `:193` insert and `:218` emit).
2. On reconnect, `sockets/index.ts:57-61` selects `{ senderId: { not: user.id },
   deliveredAt: null }` **without a conversation filter and without a
   `destination` filter**. It stamps *every* undelivered message in the
   database as delivered to *this* user, including messages addressed to other
   guests and GAME messages. This is a data-integrity bug independent of the
   UI symptoms.
3. Read receipts have no batching; one socket event per message
   (`useDuoApp.ts:875` emits per message).
4. There is no "read up to X" watermark, so a client that scrolls cannot
   reconcile cheaply.

---

## 13. History, Pagination & Ordering

| Property | Value |
|---|---|
| Order | `createdAt ASC` |
| Limit | 500 |
| Cursor | none |
| `hasMore` | none |
| Offset | none |
| Stable tiebreak | none (`createdAt` only; `cuid` is not monotonic) |
| Client virtualization | none (`ChatScreen.tsx` renders the full array) |
| Client-side merge | append-if-id-absent (`useDuoApp.ts:1426-1430`) |

Risk: two messages with identical `createdAt` (millisecond collision) have a
non-deterministic order across queries. `cuid()` is not lexicographically
time-ordered in a way that guarantees agreement with `createdAt`.

---

## 14. Multi-Account & Peer Routing

`peerFor` (`services/peer.ts:10-26`):

```
HOST   → preference.activePeerId (must be a GUEST) → else oldest GUEST
GUEST  → oldest HOST
```

Consequences:

1. **Guest is implicit.** A guest's messages always go to the oldest Host.
2. **Host is explicit but mutable.** Every send re-reads `activePeerId`.
   Switching selection changes where the *next* message goes, but the UI may
   still show the previous thread until reload.
3. **Message rows do not record the recipient.** Only `conversationId`. If
   routing is wrong, the message is correctly stored but in the wrong
   conversation.
4. **`contactsFor` is N+1** (`peer.ts:98-135`): for each guest, one
   `conversation.findUnique` + one `findFirst` + one `count`. With G guests
   that is ~3G round-trips per contacts refresh.
5. **`chat:delete` deletes history for *all* conversations**
   (`sockets/chat.ts:348-350`, no filter by pair) — a Host action with global
   blast radius. Confirmed by reading the `where` clause.

---

## 15. Media / Attachment Pipeline

| Aspect | Implementation | Assessment |
|---|---|---|
| Upload | `POST /api/chat/media`, disk via `storageKey` | Reasonable |
| Legacy path | `ChatMedia.data Bytes?` | Two backends; needs a decision |
| Ownership on attach | `media.ownerId !== user.id` → error (`chat.ts:109-112`) | ✅ |
| Size limits | Unified `MAX_UPLOAD_MB` (default 1000 MB) for image/video/audio/file; server publishes it via `/api/chat/upload-limit` | Client uses the live server value; sending flow unchanged |
| Provisioning | `cleanupTemporaryMediaFiles()` | `NOT VERIFIED` (scheduling) |
| Orphans | Media uploaded but never attached | No visible GC in send flow |
| Serving | `GET /api/chat/media/:id` | Auth check needs line-level verification (`NOT VERIFIED`) |
| Message link | Denormalised `attachmentKind/Mime/Name/Size` on `Message` | Good for rendering without joins |

Media is the healthiest subsystem in the audit. The main risks are orphan
accumulation and the dual-storage legacy column.

---

## 16. Security, AuthZ & Privacy

### 16.1 Confirmed issues

| ID | Issue | Evidence | Impact |
|---|---|---|---|
| S-1 | `message:read` unscoped | `chat.ts:248-260` | Any authenticated user can mutate read state of arbitrary message IDs and learn `senderId` |
| S-2 | `chat:delete` global blast radius | `chat.ts:348-350` | Host deletes every conversation's messages |
| S-3 | Rate limit per socket | `chat.ts:70-81` | Trivial bypass |
| S-4 | Silent validation failures | `chat.ts:83-85`, `:122` | No audit trail of rejected input |
| S-5 | Unscoped delivered reconciliation | `index.ts:57-61` | Cross-conversation data mutation |
| S-6 | No `unhandledRejection` handler | grep: none in `apps/server/src` | DoS via crafted event that makes Prisma throw |

### 16.2 Positive controls

- Socket auth via `duo_session` cookie + `resolveSession` (`index.ts:35-45`).
- Room-per-user (`user:<id>`) prevents broadcast leakage.
- Host-only guards on archive/delete (`chat.ts:287,344`).
- `originGuard` + CORS allow-list + CSRF posture (`index.ts:30-46`).
- Helmet enabled; CSP delegated to proxy (documented trade-off).
- Notifications deliberately exclude message text (`notifier.ts:21-24`) — good.
- `messages:recovered` payloads carry no content.

### 16.3 Not verified

- Media download authorization granularity.
- Session expiry/rotation.
- Admin endpoint authorization.
- Rate limiting on REST routes.

---

## 17. Reliability & Error Handling

| Layer | Current | Gap |
|---|---|---|
| Socket listeners | `message:send` has `.catch()`; 11 others are bare `async` | One throw → unhandled rejection |
| Process | No `process.on('unhandledRejection')` | Node 26 exits |
| DB transactions | Insert + emit + notify are not transactional | Partial success (row exists, no event / event exists, no row is impossible, but notification can fail while message exists) |
| Conversation create | find-then-create | `P2002` race |
| Client send | No ack/timeout/retry | Loss |
| Client receive | No resync | Loss |
| Presence | In-memory | Wrong after restart |
| Multi-instance | No adapter | Broken |
| Health check | `/health` returns ok | Does not check DB or socket layer |

Note the consistency ordering in `sendMessage`: the message is inserted
(`:193`), then emitted (`:217-218`), then notification is awaited (`:222`).
If `notifyUser` throws, the `sendMessage` promise rejects, the `.catch` at
`:235` emits "Message could not be sent" — **but the message is already in the
DB and already emitted to the recipient.** The sender sees an error for a
message that was actually delivered. This is a real, code-verified inconsistency.

---

## 18. Performance & Scalability

| Hotspot | Cost | Scaling behaviour |
|---|---|---|
| `presence` broadcast | `io.emit` per online user, per connect/disconnect | O(N²) events |
| `contactsFor` | 3 queries per guest | O(G) round-trips |
| Send path | ~6-9 queries incl. peer, unlock, conversation, reply check, insert, notify count | ~10 RTT per message |
| History | 500 rows + includes | O(500) payload on every open |
| Client render | full array, no virtualization | O(M) DOM nodes |
| Room model | single process | Cannot scale out |
| Rate limiter | per-socket array | Memory grows with socket lifetime |

At the current single-instance, small-user-count scale this is survivable.
It is not survivable at 100+ concurrent users or on multi-instance deployment.

---

## 19. Observability & Operability

| Signal | Present? | Notes |
|---|---|---|
| Structured logs | ❌ | `console.error` strings only |
| Request IDs | ❌ | |
| Socket event tracing | ❌ | |
| Delivery metrics | ❌ | No counters for sent/failed/replayed |
| Latency histograms | ❌ | |
| Alerting | `NOT VERIFIED` | No metrics endpoint found |
| Health check | ✅ `/health`, `/api/health` | Liveness only, not readiness |
| Audit log | ✅ `writeAudit`, `adminAuditLog` | Used for archive/delete only |

The practical consequence: when a user reports "message nahi aaya", there is
**no way to answer** "was it sent? was it stored? was it delivered? was it
seen?" from logs. Support is reduced to asking the user to reload.

---

## 20. Recommended Architecture & Remediation Roadmap

### 20.1 Target design (minimum viable correctness)

```
CLIENT                                    SERVER
──────                                    ──────
outbox[] (persisted)                      Message { id, clientId UNIQUE(conversationId, clientId), seq }
  │                                          │
  ├─ emit message:send {clientId, ...} ─────►│  upsert on (conversationId, clientId)
  │                                          │  insert → assign seq → emit to room
  │◄──── ack {clientId, id, seq, status} ────┤
  │                                          │
  ├─ on reconnect: sync {conversationId, lastSeq}
  │◄──── messages where seq > lastSeq ───────┤  (bounded, paginated)
  │                                          │
  ├─ delivery = recipient sends ack ────────►│  update deliveredAt when recipient client acks
  └─ read = watermark {upToSeq} ────────────►│  update readAt <= seq
```

Three primitives fix ~80% of the findings: **idempotency key**, **monotonic
seq**, **sync-since-seq**. Everything else is defence in depth.

### 20.2 Roadmap

#### P0 — stop the bleeding (hours, low risk)

| # | Task | Files | Why |
|---|---|---|---|
| P0.1 | Add `messages:recovered`-style resync on `connect`: call `loadMessages()` when chat is unlocked, and set a `pendingSync` flag when locked | `useDuoApp.ts:1385-1404` | Fixes the primary symptom with no schema change |
| P0.2 | Do not force `HOME` on disconnect; keep the thread and show a "reconnecting" banner | `useDuoApp.ts:1391-1404` | Removes the reset illusion |
| P0.3 | Defer (not drop) `message:new` while locked: mark pending, fetch on unlock | `useDuoApp.ts:1412-1415` | Privacy preserved, no loss |
| P0.4 | History: `orderBy desc, take N` then reverse, add `before` cursor + `hasMore` | `routes/chat.ts:207-215`, `useDuoApp.ts loadMessages` | Newest messages always reachable |
| P0.5 | Scope delivered reconciliation by conversation and `destination` | `sockets/index.ts:57-61` | Stops cross-conversation corruption |
| P0.6 | Guard `sendMessage` failure ordering: notify after emit in a `try/catch` that does not report failure for an inserted row | `sockets/chat.ts:193-231` | Removes false "could not send" |
| P0.7 | `safeOn()` wrapper on all listeners + `process.on('unhandledRejection'/'uncaughtException')` logging | `sockets/chat.ts`, `sockets/index.ts`, `index.ts` | Prevents API death |
| P0.8 | Scope `message:read` to caller's conversation participant set | `sockets/chat.ts:248-260` | Closes IDOR |

#### P1 — correctness (days, schema change)

| # | Task |
|---|---|
| P1.1 | Add `clientId` + `@@unique([conversationId, clientId])`; server upserts |
| P1.2 | Add `seq Int` per conversation with `@@unique([conversationId, seq])`; assign in a transaction |
| P1.3 | Emit ack `{clientId, id, seq}`; client outbox retries with backoff |
| P1.4 | Real delivery: recipient client acks `message:delivered`; sender only then sees "Delivered" |
| P1.5 | Read watermark `{upToSeq}` instead of per-message events |
| P1.6 | Atomic conversation create (`upsert` or catch `P2002` + refetch) |
| P1.7 | Persist outbox in `sessionStorage`/IndexedDB; replay on reconnect |

#### P2 — scale & operability (weeks)

| # | Task |
|---|---|
| P2.1 | Redis adapter for Socket.IO; move presence to Redis with TTL |
| P2.2 | Replace O(N²) presence with a single room-based diff or debounced snapshot |
| P2.3 | Batch `contactsFor` into 2-3 aggregate queries |
| P2.4 | Virtualize the message list; windowed rendering |
| P2.5 | Structured logging with `msgId`, `conversationId`, `clientId`, `seq` |
| P2.6 | Metrics: sent, acked, failed, replayed, sync-lag; readiness probe with DB check |
| P2.7 | Fix `chat:delete` blast radius (scope by pair; require explicit confirmation) |

#### P3 — polish

| # | Task |
|---|---|
| P3.1 | Retire `ChatMedia.data` legacy column after backfill verification |
| P3.2 | Orphan media GC |
| P3.3 | Remove dead `Message.deletedAt` or actually implement soft delete |
| P3.4 | Typing throttling and idle timeout tuning |
| P3.5 | E2E test: kill socket mid-send, assert exactly-once |

### 20.3 Explicit non-goals of this audit

No source file was modified, no migration was written, no dependency was
installed, and no database was touched.

---

## 21. Health Scores & Verdict

| Dimension | Score | Rationale |
|---|---|---|
| Message correctness (happy path) | 8/10 | Works when both online, unlocked, <500 msgs |
| Message correctness (failure path) | 2/10 | Silent loss, no ack, no retry, no resync |
| Delivery/read semantics | 3/10 | Presence masquerading as delivery |
| Reconnect behaviour | 2/10 | Locks chat, navigates home, drops events |
| History & pagination | 2/10 | Oldest-500, no cursor, no `hasMore` |
| Data model | 5/10 | Clean core; missing idempotency/seq |
| AuthZ & security | 5/10 | Good rooms/cookies; two real holes |
| Error handling | 2/10 | Unguarded listeners, no process handler |
| Performance | 4/10 | Fine at tiny scale, O(N²) presence, N+1 contacts |
| Observability | 1/10 | Console strings only |
| Media | 7/10 | Ownership checks, disk storage, some legacy debt |
| **Overall** | **≈37/100** | Functional demo, not a reliable messenger |

### Verdict

The system is a **working prototype with production-shaped code**. The
structure (services, typed Prisma models, per-user rooms, per-user hides,
ownership checks on media) is better than the reliability numbers suggest.
The failures are concentrated in a small number of missing primitives:
**sync-on-reconnect, idempotent send, and truthful delivery state.**

The most important insight from this audit:

> The message is usually **not lost**. It is **stored and then made invisible**
> by client-side state destruction and unpaginated history. That distinction
> matters, because it means the fix is mostly additive — resync, ack, seq —
> rather than a rewrite of the send path.

### Recommended order of work

1. **P0.7 + P0.8** (crash safety + authorization) — smallest diff, highest risk removed.
2. **P0.1 → P0.4** (resync, no forced HOME, defer while locked, newest-first history) — this is the fix users will actually feel.
3. **P1.1 → P1.3** (idempotency + seq + ack) — makes retries safe.
4. **P1.4 → P1.5** (truthful delivery/read) — makes the UI honest.
5. **P2.x** only when there is a real need to scale beyond one process.

---

## Appendix A — Evidence Index

| Claim | Location |
|---|---|
| Chat destroyed on disconnect | `apps/web/src/hooks/useDuoApp.ts:1391-1404` |
| Inbound messages dropped while locked | `apps/web/src/hooks/useDuoApp.ts:1412-1415` |
| No resync on connect | `apps/web/src/hooks/useDuoApp.ts:1385-1389` |
| `messages:recovered` only from admin routes | `apps/server/src/routes/chat.ts:1301,1362` |
| Oldest-500 history | `apps/server/src/routes/chat.ts:207-215` |
| Unscoped delivered reconciliation | `apps/server/src/sockets/index.ts:55-73` |
| Presence-based delivery | `apps/server/src/sockets/chat.ts:192,199,219` |
| Fire-and-forget send | `apps/server/src/sockets/chat.ts:234-239`; `useDuoApp.ts:1850-1874` |
| Optimistic draft clear | `apps/web/src/components/ChatScreen.tsx:243,258,374,442,499` |
| Unscoped `message:read` | `apps/server/src/sockets/chat.ts:248-260` |
| Unguarded listeners | `apps/server/src/sockets/chat.ts:262-385,391-424` |
| No `unhandledRejection` handler | grep of `apps/server/src` → no matches |
| Mutable peer routing | `apps/server/src/services/peer.ts:14-26` |
| Non-atomic conversation create | `apps/server/src/services/conversations.ts:21-34` |
| Global `chat:delete` | `apps/server/src/sockets/chat.ts:343-366` |
| O(N²) presence | `apps/server/src/sockets/index.ts:24-30` |
| N+1 contacts | `apps/server/src/services/peer.ts:98-135` |
| In-memory presence | `apps/server/src/services/presence.ts` (29 lines) |
| No Redis adapter | `apps/server/src/index.ts` — `new Server(...)` only |
| Message model gaps | `prisma/schema.prisma:76-101` |
| 9 migrations, none add idempotency | `prisma/migrations/` |

## Appendix B — NOT VERIFIED Items

- Any runtime behaviour (no `node_modules`, no Postgres, no Docker).
- Media download authorization granularity.
- Session expiry/rotation policy.
- Admin route authorization.
- REST rate limiting.
- Migration status on the deployed database.
- Actual Prisma index usage / query plans.
- Socket reconnect timing on real networks.
- Push notification delivery.

---

*End of report. No source code was modified during this audit.*
