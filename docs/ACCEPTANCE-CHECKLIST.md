# Acceptance checklist

> Source build and Prisma schema validation pass. Everything below still needs live verification with a real PostgreSQL database, two devices and HTTPS/TURN. See `docs/BUILD-AND-TEST-STATUS.md`.

## Accounts and security
- [ ] Seed creates only Host and Guest.
- [ ] Both log in on separate devices and retain sessions after refresh.
- [ ] Public registration does not exist.
- [ ] Guest receives 403 from every Host-only endpoint.
- [ ] Logout revokes the session.
- [ ] Cookies are HttpOnly, Secure in production and SameSite=Lax.

## Chat and privacy
- [ ] Both participants exchange persistent real-time messages.
- [ ] Message order, sender, timestamps, delivery and seen status are correct.
- [ ] Butterfly flies on incoming messages and contains no text.
- [ ] Generic browser/Push notification contains no preview or sender details.
- [ ] Clicking butterfly opens the authorized Chat flow.
- [ ] Guest Chat is locked until promo unlock or valid RESTORE.
- [ ] Hide preserves messages; archive preserves messages; delete permanently removes private chat messages.
- [ ] Refresh restores the last selected screen without exposing a locked Chat.

## Study
- [ ] Study Mode opens from Chat and keeps incoming delivery running.
- [ ] Question is Hinglish and 10–15 lines.
- [ ] Prewritten response animates over about 60 seconds.
- [ ] Completion is not replayed after refresh; reduced-motion skips animation.
- [ ] Study content is not inserted into private messages.

## Games
- [ ] Word Typing score/timer/restart work.
- [ ] Falling Words spawn, fall, speed up, decrement lives and clear when typed.
- [ ] Color Sequence accepts correct patterns and tracks score/rounds.
- [ ] Send-to-Game OFF routes to Chat; ON routes to Game Inbox.
- [ ] Inbox message history, unread status and Host notification work.

## Promo, restore and permissions
- [ ] Host rotates promo code; database stores only bcrypt hash.
- [ ] Invalid promo attempts are rate-limited.
- [ ] RESTORE is case-insensitive and does not revive deleted conversations.
- [ ] Permission request, approve, reject and revoke update status/timestamps.
- [ ] Guest can always mute their own microphone.
- [ ] Remote mic actions work only with an explicit active permission.

## Audio
- [ ] Incoming call, accept, decline, end and duration work on two devices.
- [ ] Local mute/unmute works.
- [ ] Host can end the call for both.
- [ ] Guest can hide the call while the connection remains active and local sound is disabled.
- [ ] Test STUN and TURN on separate networks; verify reconnect behaviour under network changes.

## Admin and deployment
- [ ] Host can search/delete selected messages and delete all history.
- [ ] Host message delete is a soft delete that lands in the Recycle Bin; admin can restore or permanently delete per chat.
- [ ] Host can delete a chat for both members at once or for a single member through the delete scope.
- [ ] Host can select multiple messages and delete them in one action, or delete every message of a chat.
- [ ] Host can inspect game messages, notifications, permissions, call history and audit events.
- [ ] Database persists after container restart.
- [ ] Nginx HTTPS and Socket.IO WebSocket proxy work.
- [ ] TURN ports and public IP are reachable.
- [ ] Backups can be restored.
- [ ] Other VPS applications and existing Nginx sites remain unaffected.
