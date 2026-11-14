# Deploy Private Duo on mj.negbuy.tech

Target VPS: `200.97.170.179` (DNS for `mj.negbuy.tech` already points here).

At the time of writing, `mj.negbuy.tech` had **no dedicated vhost**: requests fell
through to the default site (`aeroturbinespare.com`) and the served certificate
did not match this hostname. Adding a dedicated `server_name mj.negbuy.tech`
vhost only affects this hostname; every other domain keeps its current config.

## What stays separate

| Resource | Private Duo only |
| --- | --- |
| Directory | `/opt/private-duo` |
| Compose project | `private-duo` |
| Containers | `private-duo-db-1`, `private-duo-api-1`, `private-duo-web-1`, `private-duo-nginx-1`, `private-duo-turn-1` |
| Docker volume | `private-duo_duo_db` |
| Docker networks | `private-duo_private`, `private-duo_edge` |
| Published ports | PostgreSQL + internal Nginx on `127.0.0.1` only; free ports chosen automatically |
| TURN | free signalling port + 60 free UDP relay ports |
| Host Nginx | one new file: `/etc/nginx/sites-available/private-duo.conf` |
| Certificates | `/opt/private-duo/certbot/` (not the system Let's Encrypt dir) |
| Cron | `/etc/cron.d/private-duo-renew`, `/etc/cron.d/private-duo-backup` |
| Firewall | UFW rules tagged `private-duo`, TURN ports only |

The deploy script never edits existing vhosts, never takes over ports 80/443, and
rolls back only its own vhost if `nginx -t` fails. `undeploy-production.sh`
removes only resources carrying the Private Duo marker.

## Steps

1. Copy the project to the VPS **without** the local development `.env`:

   ```bash
   sudo mkdir -p /opt/private-duo
   sudo chown "$USER":"$USER" /opt/private-duo
   # upload/copy the project into /opt/private-duo
   cd /opt/private-duo
   rm -f .env          # the deploy script generates production secrets itself
   ```

2. Confirm DNS and that host Nginx owns ports 80/443:

   ```bash
   getent ahostsv4 mj.negbuy.tech | head -n1
   sudo ss -ltnp 'sport = :80'
   sudo ss -ltnp 'sport = :443'
   ```

   Expected: the IP is `200.97.170.179`, and the listeners are owned by `nginx`.
   If instead they are owned by `docker-proxy`, port 80/443 is handled by a
   containerized proxy (Nginx Proxy Manager, Traefik, Coolify, etc.). Do **not**
   run the host-Nginx mode; add `mj.negbuy.tech` as a proxy host in that panel
   pointing to `http://127.0.0.1:<DUO_HTTP_PORT>` after starting the stack.

3. Deploy:

   ```bash
   sudo bash scripts/deploy-production.sh \
     --domain mj.negbuy.tech \
     --email you@example.com
   ```

   Enter the Host/Admin and Guest passwords when prompted (hidden input). All
   database, TURN, VAPID and promo secrets are generated automatically.

4. Verify:

   ```bash
   curl -sSI https://mj.negbuy.tech
   docker compose --project-name private-duo ps
   ```

   Then open `https://mj.negbuy.tech` and log in as `host` or `guest`.

## Notes

- If certificate issuance fails, the site stays on HTTP for that hostname only
  and the script prints a warning. Re-run the same command after fixing DNS or
  port 80.
- TURN needs the selected signalling port and UDP relay range open in the
  provider firewall. The script adds UFW rules only when UFW is active.
- Remove only this stack later:

  ```bash
  sudo bash scripts/undeploy-production.sh          # keeps DB and certs
  sudo bash scripts/undeploy-production.sh --purge  # removes DB volume, certs, .env
  ```
