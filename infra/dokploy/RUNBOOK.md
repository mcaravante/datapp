# CDP — Production deploy runbook

> Step-by-step procedure to bring a fresh CDP install up on a Hostinger VPS through Dokploy with Cloudflare in front. Pair this file with `docker-compose.dokploy.yml`, `infra/docker/*`, and `infra/backups/`.

The runbook assumes:

- A new Hostinger KVM 4 (or larger) running Ubuntu 24.04 LTS.
- A Cloudflare account with the apex domain delegated.
- An R2 bucket reserved for backups (see `infra/backups/README.md`).
- A Sentry project for both `cdp-api` and `cdp-admin`.

Run through every step once. Tick the checkboxes as you go — half-completed deploys leave the system in a state nobody can debug six months later.

---

## 1. VPS hardening

> Goal: only sshd is exposed, only your key works, and unattended security patches apply automatically.

- [ ] Create the box, log in as `root` once, then **immediately** make a sudo user:

  ```sh
  adduser cdp
  usermod -aG sudo cdp
  rsync --archive --chown=cdp:cdp ~/.ssh /home/cdp
  ```

- [ ] Lock down sshd (`/etc/ssh/sshd_config.d/99-cdp.conf`):

  ```
  PermitRootLogin no
  PasswordAuthentication no
  PubkeyAuthentication yes
  KbdInteractiveAuthentication no
  X11Forwarding no
  AllowUsers cdp
  ```

  ```sh
  sudo systemctl restart ssh
  ```

  **Verify in a separate terminal** that `ssh cdp@host` still works before closing the original session.

- [ ] UFW — allow only 22, 80, 443:

  ```sh
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  sudo ufw status verbose
  ```

- [ ] fail2ban for SSH brute-force:

  ```sh
  sudo apt install -y fail2ban
  sudo systemctl enable --now fail2ban
  ```

- [ ] Unattended security upgrades:

  ```sh
  sudo apt install -y unattended-upgrades
  sudo dpkg-reconfigure --priority=low unattended-upgrades
  ```

- [ ] Set the timezone to UTC (presentation timezone is handled in the app):

  ```sh
  sudo timedatectl set-timezone UTC
  ```

---

## 2. Install Dokploy

- [ ] Run the official installer:

  ```sh
  curl -sSL https://dokploy.com/install.sh | sudo sh
  ```

- [ ] Open the Dokploy UI on `https://<vps-ip>:3000` (one-time bootstrap), create the admin user, then put it behind a Cloudflare-proxied subdomain (e.g. `dokploy.cdp.example.com`). Don't leave the panel exposed on a public IP+port.

- [ ] Inside Dokploy: create an **Application** linked to this repo's `main` branch, build mode = `Compose`, compose path = `infra/dokploy/docker-compose.dokploy.yml`.

---

## 3. Cloudflare

- [ ] Add A records (proxied) for:

  ```
  api.cdp.example.com    → <vps-ip>
  admin.cdp.example.com  → <vps-ip>
  ```

- [ ] In **SSL/TLS → Overview**, set encryption mode to **Full (strict)**. Anything weaker breaks HSTS and lets a MITM strip TLS between Cloudflare and the origin.

- [ ] Generate an **Origin Certificate** (SSL/TLS → Origin Server) for `*.cdp.example.com`. Copy the cert + private key. In Dokploy, paste them into the Traefik certs panel for both subdomains so the origin actually serves TLS.

- [ ] In **Rules → Configuration Rules**, set:

  - Browser Cache TTL = "Respect existing headers" for `api.cdp.example.com`.
  - Cache Level = "Bypass" for `api.cdp.example.com` (the API responses are dynamic).

- [ ] In **Speed → Optimization**, **disable** Auto Minify (breaks Next.js script hashes) and Rocket Loader.

- [ ] Optional but recommended: enable **WAF managed rules** for `admin.cdp.example.com` (paid feature on Pro+).

---

## 3.5. Google Sign-In

The whole sign-in flow (including the owner's first login) goes through Google. Whitelist = `user` table. No public signup. The `OWNER_EMAIL` env var auto-creates a super_admin row the first time it sees a Google sign-in matching it; everyone else has to be created from the admin's `/users/new` page.

- [ ] In [Google Cloud Console](https://console.cloud.google.com), create a project named `cdp-prod` (or reuse an existing one).

- [ ] **APIs & Services → OAuth consent screen**:
  - User Type: External
  - App name: `CDP Admin`
  - User support email + developer contact: your email
  - Authorized domains: `tudominio.com`
  - Scopes: keep the default `openid`, `email`, `profile`.
  - Test users: add `matias.caravante@gmail.com` if the app stays in "Testing" status. Move to "In production" once the consent screen is final, otherwise non-test-user sign-ins will be rejected.

- [ ] **Credentials → + Create credentials → OAuth client ID**:
  - Application type: Web application
  - Name: `cdp-admin`
  - **Authorized JavaScript origins**: `https://admin.tudominio.com`
  - **Authorized redirect URIs**: `https://admin.tudominio.com/api/auth/callback/google`
  - Hit Create. Copy the Client ID and the Client secret.

- [ ] Set the Dokploy env vars from the credentials:

  ```env
  GOOGLE_CLIENT_ID=<the OAuth client id>
  AUTH_GOOGLE_ID=<same client id>
  AUTH_GOOGLE_SECRET=<the OAuth client secret>
  OWNER_EMAIL=matias.caravante@gmail.com
  ```

  `GOOGLE_CLIENT_ID` is what the API uses to verify the `aud` claim on incoming `id_token`s. `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are what NextAuth uses to drive the OAuth flow on the admin side. They share the same Client ID value.

- [ ] **First sign-in**: after the first deploy is up, hit `https://admin.tudominio.com/login` and click **"Continuar con Google"**. The first sign-in matching `OWNER_EMAIL` auto-creates (or migrates) the `super_admin` row. Subsequent users have to be created from `/users/new`.

  > **Migration note:** if a seed `admin@cdp.local` row already exists (typical from `pnpm db:seed`), the bootstrap step migrates that row's email to `OWNER_EMAIL` so existing audit logs / sessions stay attached to the same `user_id`. Cosmetic, but means you keep history.

- [ ] **After the owner is in**:
  1. Enroll 2FA on `/security` and download the recovery codes (Dokploy default is `FEATURE_2FA_ENFORCED=true`, so this happens automatically on first login if you're admin or super_admin).
  2. From `/users/new`, create the e-commerce manager's user with their email. Leave the password field blank if they should only sign in with Google.

- [ ] **Optional — clear `OWNER_EMAIL` after bootstrap.** Once the owner row exists, the env var stops doing anything (the bootstrap branch only runs when no row matches). Leaving it set is harmless but removing it documents that the bootstrap is no longer needed.

---

## 4. Secrets — generate and store in Dokploy

> Generate every secret on a machine that will never see prod. Paste them into Dokploy → Environment Variables for the cdp stack. **Never commit a real value to the repo.**

- [ ] Strong Postgres password:

  ```sh
  openssl rand -base64 48 | tr -d '/+=' | head -c 32
  ```

- [ ] `AUTH_SECRET` (NextAuth):

  ```sh
  openssl rand -base64 32
  ```

- [ ] JWT RS256 key pair:

  ```sh
  openssl genpkey -algorithm RSA -out priv.pem -pkeyopt rsa_keygen_bits:4096
  openssl rsa -in priv.pem -pubout -out pub.pem
  # Paste each PEM into Dokploy with newlines escaped as `\n`.
  ```

- [ ] `ENCRYPTION_MASTER_KEY` (32-byte hex):

  ```sh
  openssl rand -hex 32
  ```

- [ ] Magento HMAC secret + admin token (from the Magento side).

- [ ] Sentry DSNs (one per project — `cdp-api` and `cdp-admin`).

- [ ] SMTP credentials (Resend / Mailgun / SES). For password-reset emails. If left empty the mailer logs to stdout instead of sending — DO NOT ship to prod with this.

- [ ] Backup secrets: see `infra/backups/README.md`. Generate the age keypair offline, paste the public key as `BACKUP_AGE_RECIPIENT`. Keep the private key on a USB stick / in a 1Password vault — without it the backups are unrecoverable.

Final shape of the env block in Dokploy (matches `.env.example`):

```env
DATABASE_URL=postgresql://cdp:<pw>@postgres:5432/cdp
DIRECT_URL=postgresql://cdp:<pw>@postgres:5432/cdp
REDIS_URL=redis://redis:6379/0
AUTH_SECRET=...
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
ENCRYPTION_MASTER_KEY=...
APP_URL_API=https://api.cdp.example.com
APP_URL_ADMIN=https://admin.cdp.example.com
DEFAULT_TENANT_SLUG=acme
FEATURE_2FA_ENFORCED=true
GOOGLE_CLIENT_ID=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
OWNER_EMAIL=matias.caravante@gmail.com
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=re_xxx
SMTP_FROM="CDP <no-reply@cdp.example.com>"
SENTRY_DSN_API=https://...sentry.io/...
SENTRY_DSN_ADMIN=https://...sentry.io/...
NEXT_PUBLIC_SENTRY_DSN_ADMIN=https://...sentry.io/...   # same as SENTRY_DSN_ADMIN — must be a build arg
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
POSTGRES_PASSWORD=<strong-password>
POSTGRES_USER=cdp
POSTGRES_DB=cdp
MAGENTO_BASE_URL=https://store.example.com
MAGENTO_ADMIN_TOKEN=...
MAGENTO_HMAC_SECRET=...
BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
BACKUP_S3_BUCKET=cdp-backups-prod
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_S3_REGION=auto
BACKUP_AGE_RECIPIENT=age1xyz...
```

---

## 5. First deploy

- [ ] In Dokploy, hit **Deploy** on the cdp application. The first build pulls images for postgres + redis and builds api / worker / admin from the Dockerfiles in `infra/docker/`.

- [ ] Watch the api container logs:

  - Migrations run automatically because `MIGRATE_ON_BOOT=true` is set on the `api` service in the compose. The worker container does **not** run migrations — only one replica should ever apply schema changes at a time.
  - You should see `prisma migrate deploy` apply every migration once, then `API listening on :3000`.

- [ ] Seed an initial super_admin user. Run a one-shot command in the api container:

  ```sh
  docker compose -f infra/dokploy/docker-compose.dokploy.yml exec api \
    pnpm --filter @cdp/db seed
  ```

  Or, if no seed script fits, log into the DB and insert manually with an argon2id hash generated by the auth module.

- [ ] Hit `https://admin.cdp.example.com` — login as the super_admin, immediately enroll 2FA (it's required for admin/super_admin roles when `FEATURE_2FA_ENFORCED=true`), download the recovery codes, store them somewhere safe.

- [ ] Smoke checks:

  ```sh
  curl -sf https://api.cdp.example.com/v1/health/live
  curl -sf https://api.cdp.example.com/v1/health/ready | jq
  ```

  `ready` should return `{ status: "ok", checks: { postgres: { status: "ok" }, redis: { status: "ok" } } }`. If either is `fail`, the stack isn't ready to serve traffic — investigate before continuing.

---

## 6. Backups

Follow `infra/backups/README.md` end-to-end. The minimum acceptable state for production:

- [ ] Backup container scheduled daily in Dokploy (03:00 UTC).
- [ ] Restore drill executed once on a throwaway DB. Counts of `user`, `customer_profile`, `order`, `audit_log` match the source.
- [ ] Age private key stored in **at least two physical locations** (e.g. 1Password vault + printed paper QR in a fireproof safe). Document where, here:

  ```
  age private key location 1: __________________________________
  age private key location 2: __________________________________
  ```

---

## 7. Operations

### Rolling deploy

Dokploy does this for you when you push to `main`. The api container exposes `/v1/health/live` for the HEALTHCHECK; Traefik waits for healthy before swapping. Graceful shutdown drains in-flight requests within `stop_grace_period: 30s`.

### Rollback

```sh
# In Dokploy: Application → Deployments → pick the previous green deploy → "Rollback".
# Or, from the host:
docker compose -f infra/dokploy/docker-compose.dokploy.yml \
  pull cdp-api:<previous-sha> cdp-admin:<previous-sha> cdp-api-worker:<previous-sha>
docker compose -f infra/dokploy/docker-compose.dokploy.yml up -d --no-deps api admin worker
```

If the rollback target predates the latest migration, restore from the most recent backup that matches the older schema. Migrations are intentionally additive — a forward-only deploy can't be rolled back schema-wise.

### Rotating secrets

- **`AUTH_SECRET`**: rotating logs every user out (their JWTs become unverifiable). Acceptable on rotation.
- **`JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`**: same blast radius — every active session dies. Run during off-hours.
- **`ENCRYPTION_MASTER_KEY`**: re-encrypts at rest are NOT automatic — rotation requires an offline migration. Don't rotate without a plan.
- **`POSTGRES_PASSWORD`**: change via `ALTER USER cdp WITH PASSWORD '...'`, then update `DATABASE_URL` and `DIRECT_URL` in Dokploy and redeploy.
- **`MAGENTO_HMAC_SECRET`**: must change in Magento simultaneously — coordinate with whoever owns the bridge module.

### Postgres / Redis access

The compose stack puts both on the internal Docker network only — they're not bound to a host port, and UFW blocks external access regardless. To exec a one-off psql/redis-cli session:

```sh
docker compose -f infra/dokploy/docker-compose.dokploy.yml exec postgres \
  psql -U cdp -d cdp

docker compose -f infra/dokploy/docker-compose.dokploy.yml exec redis \
  redis-cli
```

Never expose 5432 or 6379 to the public internet.

### Common incidents

| Symptom                                | First check                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------- |
| 502 from `api.cdp.example.com`         | `docker logs cdp-api`. Liveness probe failing? Migration failed on boot?    |
| 503 on `/v1/health/ready`              | DB or Redis unreachable. Check `cdp-postgres` / `cdp-redis` containers.     |
| Login returns 429 for everyone         | Bad rate-limit state in Redis. `redis-cli FLUSHDB` purges all auth counters. |
| Recovery codes `404` in Sentry         | Wrong `NEXT_PUBLIC_SENTRY_DSN_ADMIN` build arg → rebuild admin image.       |
| No backups for 24h                     | Dokploy cron failed or R2 token expired. `aws s3 ls` to verify access.       |
| 2FA enforcement locks all admins out   | Set `FEATURE_2FA_ENFORCED=false`, redeploy, log in, enroll, set back to true. |

### Scaling up

- **API + admin**: bump `replicas: N` in the compose. Stateless, scales horizontally.
- **Worker**: BullMQ supports multiple consumers — add replicas freely. Just keep `MIGRATE_ON_BOOT` unset on workers.
- **Postgres**: vertical first (bigger VPS, higher `shared_buffers`). Read replicas + pgbouncer come later if traffic justifies it.

---

## 8. Things this runbook doesn't cover yet

- WAL archiving / point-in-time recovery (current backups are daily snapshots only).
- Logs shipped off-host (Loki / Grafana Cloud / Datadog). Today logs live in `docker logs` until rotated by the daemon.
- Multi-region failover.
- Automated dependency updates (Renovate / Dependabot).

These belong in a follow-up iteration once the basic stack has been running clean for a sprint.
