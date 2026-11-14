# Implementation status — 12 November 2026

This repository contains the full application source for the requested Private Duo feature set. It is not a hosted service: it still needs production secrets, PostgreSQL, HTTPS, and deployment-specific setup.

## Verified in this environment

- `npm install` completed successfully.
- `npm run build` (server TypeScript build + Next.js production build) completed successfully.
- `npx prisma validate` passed.
- `npx prisma generate` completed successfully.
- The initial Prisma migration exists at `prisma/migrations/20261112000000_init/migration.sql`.
- The frontend is split into modular screens/components/hooks rather than one large file.
- Deployment files (`docker-compose.yml`, `deploy/*`, `.env.example`, `.dockerignore`) were updated for a migration-based entrypoint and non-root containers.

## Implemented in source

- Two seeded accounts only (`host`, `guest`), login only, no public registration.
- Bcrypt password hashes, opaque hashed sessions, HttpOnly cookies, expiry, logout, password change with session revocation and origin/CSRF guard.
- Persistent chat, Socket.IO messaging, delivery/read receipts, unread state, presence and delivery reconciliation on reconnect.
- Generic butterfly-only in-app notification animation. Browser and Web Push payloads never contain message text or sender details.
- Study screen with the required Hinglish question and a locally animated ~60-second prewritten answer; reduced-motion support and remembered completion.
- Separate hide, archive, restore and permanent-delete paths. Permanent deletion is Host-only and cannot be recovered by RESTORE.
- Promo-code unlock (bcrypt, rate-limited) and a separate case-insensitive `RESTORE` command.
- Three games: Word Typing (score/timer/progress/accuracy/restart), Falling Words (score/timer/progress/lives/restart), and Color Sequence (score/timer/progress/rounds/restart); all are keyboard/touch friendly and responsive.
- SEND-TO-GAME toggle: OFF sends to private Chat, ON sends to the persisted Game Inbox with real-time delivery.
- Audio calling with WebRTC/STUN/optional TURN, accept/decline, mute, duration, ICE reconnect handling, Host end-for-both, Guest independent leave and call hiding with sound disabled.
- Consent-based, timestamped permission flow (requested/granted/rejected/revoked) for remote microphone control.
- Host Admin dashboard: chat history search, individual and full deletion, game messages, permissions, promo rotation, call history, notifications, activity and audit logs.
- Docker Compose with PostgreSQL persistence, coturn, isolated internal Nginx, host-Nginx bootstrap/TLS examples and backup instructions.
- One-command production deployment (`scripts/deploy-production.sh`) that asks only for Host/Guest passwords, generates all other secrets, selects free loopback/TURN ports, writes a single dedicated host-Nginx vhost, issues HTTPS where possible, installs renewal/backup cron jobs, and leaves existing websites untouched.
- Isolated rollback (`scripts/undeploy-production.sh`) that removes only Private Duo containers, volumes, vhost, cron jobs and UFW rules.

## Still requires deployment-specific setup and live verification

- Configure real domain, HTTPS certificate, VAPID keys and TURN public IP/credentials.
- Run the stack against a real PostgreSQL instance (`prisma migrate deploy` + seed).
- Test WebRTC call quality and reconnect across two separate networks; TURN must be reachable for restrictive NATs.
- Test browser Push on supported HTTPS browsers and operating systems.
- Test all permission and destructive flows with two separate user accounts/devices.
- Build and run the Docker images on the target VPS (Docker is not available in the authoring environment).
- Configure certificate renewal and an off-VPS backup schedule.

See `docs/BUILD-AND-TEST-STATUS.md` and `docs/ACCEPTANCE-CHECKLIST.md` before treating the deployment as production-ready.
