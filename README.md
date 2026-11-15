# STUDY WITH GAME

A two-account study and games app. This repository contains a Next.js frontend, an Express + Socket.IO API, PostgreSQL persistence, WebRTC audio signalling, Web Push support, and an isolated Docker deployment.

## What is implemented

- Exactly two pre-created accounts (`host` and `guest`); login only, no public registration.
- Password hashes with bcrypt, random opaque session tokens stored hashed, HttpOnly cookies, session expiry, logout and Host-only route middleware.
- Persistent one-to-one chat, sender identity, timestamps, delivery/read receipts, unread state and real-time Socket.IO delivery.
- Discreet butterfly animation. It never contains message text. Browser and Web Push notifications use generic copy only.
- Chat / Study screen state saved per account. Hiding Chat does not delete or archive messages.
- Hinglish Study Assistant with a predefined question and a locally simulated ~60-second response; completion is remembered in local storage; reduced-motion skips the animation. It does not claim to call an AI model.
- Separate promo-code unlock and `RESTORE` command. Promo codes are bcrypt hashes and attempts are rate-limited.
- Separate hide, archive, restore and permanent delete paths. Host-only destructive actions and audit records.
- Twelve playable games: Turbo Track, Bubble Pop, Snake Classic, Word Typing, Falling Words, Color Sequence, Slide Puzzle, Pair Match, Tic Tac Toe, Whack a Mole, Brick Breaker and Math Sprint.
- Send-to-Game routes messages to a separate persisted Game Chat; OFF routes to Main Chat. The active destination is shown beside the toggle and only when available.
- Real-time activity/presence events and notification preference controls.
- Audio calls using WebRTC peer connections, Socket.IO signalling, microphone permission prompts, accept/decline/end, call duration, local mute, call hiding, and consent-gated remote microphone requests. Guest can mute the Host mic after Host grants remote-control consent; Host can always re-enable their own mic and can control the Guest mic only after Guest consent.
- Host dashboard: normal/game message history, search, individual deletion, full history deletion, permission requests, promo rotation, call/notification/audit activity.
- Optional Web Push subscriptions with a service worker. Push payloads contain no private message text.

## Requirements

- Node.js 22+
- PostgreSQL 16+ (or Docker Compose)
- A domain with HTTPS for production browser microphone and Push APIs
- For reliable audio across restrictive NATs, a reachable TURN service. The Compose file includes coturn in host-network mode.

## Local development

1. Copy `.env.example` to `.env` in this directory.
2. Set `POSTGRES_PASSWORD`, make `DATABASE_URL` use the same password, and set `HOST_INITIAL_PASSWORD`, `GUEST_INITIAL_PASSWORD`, and `INITIAL_PROMO_CODE` to strong unique values.
3. For local development, set `NODE_ENV=development`, make the password in `DATABASE_URL` match `POSTGRES_PASSWORD`, set `WEB_ORIGIN=http://localhost:3000` and `NEXT_PUBLIC_API_URL=http://localhost:4000`.
4. For local frontend development, copy `apps/web/.env.local.example` to `apps/web/.env.local` (it points to the API on port 4000).
5. Start PostgreSQL (or use `docker compose up -d db`).
6. Install dependencies and generate Prisma Client:

   ```bash
   npm install
   npx prisma generate
   npx prisma migrate deploy
   npx tsx prisma/seed.ts
   ```

7. Start frontend and API:

   ```bash
   npm run dev
   ```

   Frontend: `http://localhost:3000`  
   API health: `http://localhost:4000/health`

The seed creates only `host` and `guest`. It will not reset the Guest's chat unlock state on restart. Host remains unlocked.

## Production deployment — one command

The deploy script is designed for a VPS that already runs other websites. It asks only for two passwords, generates every other secret, chooses free ports automatically, and adds exactly one new Nginx vhost. It never replaces the global Nginx config, never takes ports 80/443, and never touches other containers, networks or volumes.

### Requirements

- Ubuntu 22.04/24.04 or Debian 12 VPS with root/sudo access.
- A public IPv4 address and DNS pointing to the VPS (optional if you accept the automatic `<public-ip>.sslip.io` domain).
- Ports 80/tcp and 443/tcp already served by the host Nginx (the script will not take them from another web server).

### Deploy

1. Upload or clone this project to `/opt/private-duo` (any directory works):

   ```bash
   sudo mkdir -p /opt/private-duo
   sudo chown "$USER":"$USER" /opt/private-duo
   # copy the project files into /opt/private-duo
   cd /opt/private-duo
   ```

2. Run the single command:

   ```bash
   sudo bash scripts/deploy-production.sh --domain duo.example.com --email you@example.com
   ```

   With no `--domain`, the script uses `<public-ip>.sslip.io`, which resolves to the VPS automatically. It then:

   - installs Docker/Compose, Nginx (only if port 80 is free) and Certbot when missing;
   - asks for the Host/Admin and Guest passwords twice, with hidden input;
   - generates PostgreSQL, TURN, VAPID and promo secrets;
   - finds free host ports and keeps every app port bound to `127.0.0.1`;
   - builds and starts only the `private-duo` Compose project;
   - applies the two account passwords after the database is healthy;
   - adds one dedicated host Nginx vhost for the domain, validates with `nginx -t`, and rolls back that file if validation fails;
   - issues a Let's Encrypt certificate (or falls back to HTTP with a warning if DNS/HTTP is not ready);
   - installs daily certificate-renewal and database-backup cron jobs;
   - prints the URL, promo code and operational commands.

   Non-interactive alternative:

   ```bash
   HOST_PASSWORD='...' GUEST_PASSWORD='...' \
     sudo -E bash scripts/deploy-production.sh --domain duo.example.com
   ```

3. Log in at the printed HTTPS URL as `host` or `guest` using the passwords you entered. No public registration exists.

### What is isolated

- Compose project name is fixed to `private-duo`; its networks and volume are named `private-duo_*`.
- API, Next.js and PostgreSQL are never published publicly. PostgreSQL and the internal proxy bind to `127.0.0.1` only.
- The TURN port and relay range are selected from free ports, not hard-coded to ports another service may use.
- The host Nginx integration writes only `/etc/nginx/sites-available/private-duo.conf` plus its `sites-enabled` symlink (or `/etc/nginx/conf.d/private-duo.conf`). Existing vhosts are not edited.
- Before writing the vhost, the script checks whether the domain is already used by another Nginx config and aborts if it is.
- UFW rules are added only for the selected TURN ports, and only when UFW is active.
- Re-running the script reuses generated secrets and the existing database. Use `--change-passwords` to replace both account passwords and revoke all sessions.

### Manual deployment (fallback)

If you prefer to deploy manually, `deploy/host-nginx-bootstrap.example.conf` and `deploy/host-nginx-ssl.example.conf` show the host-Nginx blocks. Set strong values in `.env` (copy `.env.example`), run `docker compose up -d --build`, validate the new vhost with `sudo nginx -t`, and issue a certificate with Certbot webroot. Keep the same isolation rules: do not expose API/Next/PostgreSQL ports and do not replace other site configs.

### TURN setup

The deploy script generates a dedicated TURN credential and picks free TURN ports. `TURN_EXTERNAL_IP` is set to the VPS public IPv4. The browser uses `NEXT_PUBLIC_TURN_URL`, `NEXT_PUBLIC_TURN_USERNAME` and `NEXT_PUBLIC_TURN_PASSWORD`; these are client-visible ICE credentials, so rotate the credential periodically by re-running deployment or editing `.env` and restarting the stack. STUN is also configured as a fallback. The TURN ports must be reachable through the provider firewall; the script adds UFW rules when UFW is active.

### Uninstall / rollback

Remove only Private Duo resources:

```bash
sudo bash scripts/undeploy-production.sh
sudo bash scripts/undeploy-production.sh --purge   # also removes database volume, certificates and .env
```

The script removes only the Private Duo vhost (verified by its marker comment), its cron files and its Docker project. Other websites and services are left untouched.

### Background browser notifications

Generate VAPID keys:

```bash
npx web-push generate-vapid-keys
```

Put the generated public/private values into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, set `VAPID_SUBJECT`, then restart the API. In the website, each participant must enable Browser notifications and grant browser permission. Background delivery depends on browser, OS, network and power-saving policies. The push payload is generic and never contains message content.

## Database backup

A helper script creates a compressed dump, restricts permissions and removes dumps older than 14 days:

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
```

The equivalent manual command is:

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U duo private_duo > "backups/private-duo-$(date +%F-%H%M).sql"
```

Restore into a stopped/maintenance instance (this replaces current data):

```bash
./scripts/restore.sh backups/private-duo-YYYY-MM-DD-HHMMSS.sql.gz
```

The one-command deployment already installs a daily backup cron job (`/etc/cron.d/private-duo-backup`) writing to `/var/backups/private-duo`. For a manual deployment, keep backups outside the project directory, restrict file permissions and add an entry such as:

```cron
15 3 * * * cd /opt/private-duo && BACKUP_DIR=/var/backups/private-duo ./scripts/backup.sh >> /var/log/private-duo-backup.log 2>&1
```

## Smoke test

After deployment, with `.env` credentials set:

```bash
HOST_PASSWORD='...' GUEST_PASSWORD='...' npm run test:smoke
```

This checks health, login/session, Host-only authorization and promo unlock. Browser audio, push delivery, two-device UI behaviour and NAT traversal still require manual end-to-end testing.

## Security and operational notes

- Never commit `.env`, database backups, VAPID private keys or TURN secrets.
- HTTPS is mandatory for browser microphone and Push APIs outside localhost.
- Keep the VPS firewall enabled and expose only the reverse proxy and TURN ports.
- Host admin APIs are protected on the server; hiding a menu is not authorization.
- A Host permanent history deletion physically removes private chat message rows. An audit event records the action without retaining message content.
- Web Push and in-app/browser notifications intentionally use generic text only.
- TURN credentials are client-visible by design. Use dedicated credentials and firewall/rate limits.
- Before public use, complete the acceptance checklist and test with two real devices and two different networks.
