# Start Here — Private Duo

## Local setup

1. Install Node.js 22+ and Docker Engine with the Compose plugin.
2. Copy `.env.example` to `.env`.
3. Replace every `CHANGE_...` value with a different long random secret. Set both account passwords and an initial promo code.
4. For local work, set `WEB_ORIGIN=http://localhost:3000`, `DATABASE_URL=postgresql://duo:<POSTGRES_PASSWORD>@localhost:5432/private_duo?schema=public`, and `NEXT_PUBLIC_API_URL=http://localhost:4000` in `apps/web/.env.local` (copy `.env.local.example`).
5. Start the database: `docker compose up -d db`.
6. Install and prepare: `npm install`, `npx prisma generate`, `npx prisma migrate deploy`, `npx tsx prisma/seed.ts`.
7. Run both apps: `npm run dev`.
8. Open `http://localhost:3000`. Log in as `host` or `guest` using the passwords you configured. No default password is supplied.

## Before calling it production-ready

Run `npm run build`, then follow every item in `docs/ACCEPTANCE-CHECKLIST.md` and `docs/BUILD-AND-TEST-STATUS.md`. A successful frontend render alone is not proof of chat, persistence, call, TURN, push, or security functionality.

## Production deployment — one command

On an Ubuntu/Debian VPS that already runs other websites:

1. Upload the project to `/opt/private-duo` and enter that directory.
2. Run:

   ```bash
   sudo bash scripts/deploy-production.sh --domain your-domain.com --email you@example.com
   ```

3. Enter the Host/Admin password and the Guest password when prompted (hidden input). Every other secret, port and certificate is generated automatically.

The script is isolation-first: it writes only one dedicated Nginx vhost, validates it with `nginx -t`, never takes over ports 80/443, never edits other site configs, and keeps API/Next/PostgreSQL on loopback-only ports. It also installs daily certificate-renewal and database-backup cron jobs.

Without `--domain`, it uses `<public-ip>.sslip.io`. Re-run with `--change-passwords` to replace both account passwords and revoke sessions. Remove only this stack later with:

```bash
sudo bash scripts/undeploy-production.sh            # keep database and certs
sudo bash scripts/undeploy-production.sh --purge    # remove database volume, certs and .env
```

Read `README.md` for the full isolation guarantees, manual fallback and operational notes.
