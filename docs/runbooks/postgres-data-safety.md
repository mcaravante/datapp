# Postgres data safety runbook

The CDP's production DB lives in a Docker named volume managed by
Dokploy. Two failure modes have actually been observed:

1. **Silent volume rotation**: Dokploy renames the compose project
   between deploys (rare but happens) → fresh empty volume mounts,
   previous data still on disk but unreferenced.
2. **No backups configured**: even when the volume is fine, an
   accidental `docker compose down -v` or a host-level disk failure
   wipes everything with no recovery path.

This runbook covers the prevention + recovery for both.

## 1. Audit the current state

Before changing anything, check **what data is actually present** and
**which volume is currently mounted**:

```bash
# (a) From inside the api / worker container — counts per tenant + table.
node /app/apps/api/dist/cli.js diag:counts

# (b) From the host that runs Dokploy — list the actual volume names.
docker volume ls | grep -E "postgres|redis"
```

If `diag:counts` shows expected row counts: you're fine, just need
backups (skip to §3). If it shows much smaller numbers than expected
or zero: the volume rotated. Either restore from backup if you have
one, or manually re-enter the lost data.

## 2. Pin the volume name (one-time, safe procedure)

Skip this if you don't observe volume rotation. If you do:

```bash
# 1. SSH into the host. Confirm what the current volume is named.
docker volume ls | grep postgres
#   datapp-<id>_postgres_data           ← whatever Compose generated

# 2. Take a fresh dump from the running container BEFORE any rename.
docker exec datapp-<id>-postgres-1 \
  pg_dump --format=custom --no-owner --no-privileges \
  -U datapp datapp > /tmp/datapp-pre-rename.dump

# 3. If you have AWS / R2 set up, push the dump off-host now.
#    The file in /tmp will be lost when the host reboots.

# 4. Edit infra/dokploy/docker-compose.dokploy.yml — uncomment the pin:
#    volumes:
#      postgres_data:
#        name: datapp_postgres_data
#    (and the same for redis_data → datapp_redis_data)

# 5. Stop the stack — DO NOT use `down -v`, that destroys volumes.
docker compose -f infra/dokploy/docker-compose.dokploy.yml stop

# 6. Rename the volume by copying the data into the new name.
docker volume create datapp_postgres_data
docker run --rm \
  -v datapp-<id>_postgres_data:/from \
  -v datapp_postgres_data:/to \
  alpine sh -c "cp -av /from/. /to/"

# 7. Start the stack. The new pinned volume is in use.
docker compose -f infra/dokploy/docker-compose.dokploy.yml up -d

# 8. Verify with `node /app/apps/api/dist/cli.js diag:counts` again.

# 9. Once verified for at least a day, drop the old volume.
docker volume rm datapp-<id>_postgres_data
```

After this, the volume name is stable across deploys, project
renames, and most Dokploy operations. The only thing that still wipes
it is `docker compose down -v` or `docker volume rm` directly.

## 3. Set up automated off-host backups

The encrypted backup → R2 pipeline is already coded under
`infra/backups/` and `infra/docker/backup.Dockerfile`. It is NOT
enabled by default — empty env vars in `.env.example` mean the
script no-ops. To turn it on:

### One-time setup

1. **Generate an age keypair on a machine the production host never
   touches** (your laptop):

   ```bash
   age-keygen -o age.key
   # The public key prints to stderr — looks like `age1xyz...`. Copy it.
   # Store age.key in 1Password / Bitwarden — never on the prod host.
   ```

2. **Create a Cloudflare R2 bucket + scoped token**:
   - Cloudflare dashboard → R2 → create bucket `datapp-backups-prod`.
   - R2 → Manage R2 API Tokens → "Create API Token" → "Object Read &
     Write" scoped to that bucket only.

3. **Set the env in Dokploy** (api / worker / migrate / and a new
   backup job):

   ```env
   BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
   BACKUP_S3_BUCKET=datapp-backups-prod
   BACKUP_S3_ACCESS_KEY_ID=<R2 token id>
   BACKUP_S3_SECRET_ACCESS_KEY=<R2 token secret>
   BACKUP_S3_REGION=auto
   BACKUP_AGE_RECIPIENT=age1xyz... # the public key from step 1
   BACKUP_RETENTION_DAYS=30
   ```

4. **Add the backup job to the compose** (Dokploy treats services
   with no `restart` policy as one-shots when scheduled). Add to
   `infra/dokploy/docker-compose.dokploy.yml`:

   ```yaml
   backup:
     build:
       context: ../..
       dockerfile: infra/docker/backup.Dockerfile
     restart: 'no'
     environment:
       <<: *api-env
     depends_on:
       postgres: { condition: service_healthy }
   ```

   Then in Dokploy → app → Schedules tab → add a cron entry
   `0 3 * * *` running `/app/backup.sh` on the `backup` service.

### Recovery from a backup

When a volume rotates again (or a future bug eats data):

```bash
# 1. List available dumps in the bucket.
aws s3 ls s3://datapp-backups-prod/datapp/ \
  --endpoint-url=https://<account>.r2.cloudflarestorage.com

# 2. Pull + decrypt the latest.
aws s3 cp s3://datapp-backups-prod/datapp/<TS>.dump.age /tmp/ \
  --endpoint-url=https://<account>.r2.cloudflarestorage.com
age -d -i age.key /tmp/<TS>.dump.age > /tmp/<TS>.dump

# 3. Restore into the running Postgres (DESTRUCTIVE — wipes current data).
cat /tmp/<TS>.dump | docker exec -i datapp-<id>-postgres-1 \
  pg_restore --clean --if-exists --no-owner --no-privileges \
  -U datapp -d datapp
```

## 4. Detection — never lose data silently again

After this runbook is followed, set up these alerts:

- **Daily backup success ping**: at the end of `backup.sh` add a
  `curl https://hc-ping.com/<healthchecks-id>` so a missed cron pages
  you within 24h.
- **Volume size monitoring**: if `du -sh /var/lib/docker/volumes/datapp_postgres_data` drops by >50% between consecutive checks, that's a hard signal something destructive happened. A simple cron + Slack webhook is enough.

The reason to not rely solely on Sentry: a wiped volume produces *no
errors* — all queries succeed, they just return empty. Healthcheck
needs to assert *expected presence* of data, not just absence of
errors.
