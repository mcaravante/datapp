# Backups

End-to-end Postgres backups: `pg_dump` → `age` (envelope encryption) → S3-compatible bucket (Cloudflare R2 in production).

## Why age + R2

- **age** keeps the bucket cold-storable. Anyone who pops the R2 token only walks away with ciphertext; the matching private key never lives on the server.
- **R2** is cheap, has a free egress tier, and an S3-compatible API so the same script targets AWS S3, MinIO, or Wasabi without changes.

## One-time setup

1. **Generate an age keypair on a machine the production server will never touch** (your laptop, an offline USB stick, a 1Password item):

   ```sh
   age-keygen -o age.key
   # Public key prints to stderr — copy it. Looks like: age1xyz...
   ```

   Store `age.key` somewhere durable and **out of the repo**. Without it, the backups are unrecoverable.

2. **Create the R2 bucket + token**: Cloudflare → R2 → create bucket `cdp-backups-prod`, then create an S3 API token scoped to that bucket only (Object Read+Write).

3. **Set the env in Dokploy** (or wherever the backup container runs):

   ```env
   DATABASE_URL=postgresql://cdp:...@postgres:5432/cdp
   BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
   BACKUP_S3_BUCKET=cdp-backups-prod
   BACKUP_S3_ACCESS_KEY_ID=...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_S3_REGION=auto
   BACKUP_AGE_RECIPIENT=age1xyz...     # the PUBLIC key from step 1
   BACKUP_RETENTION_DAYS=30            # delete encrypted dumps older than this
   ```

4. **Schedule the backup** in Dokploy as a daily cron job that runs the image built from `infra/docker/backup.Dockerfile` (default CMD = `backup.sh`). 03:00 UTC is a reasonable default — adjust to off-peak hours for the store.

## Manual backup

```sh
docker run --rm \
  --env-file /path/to/backup.env \
  --network cdp_default \
  cdp-backup:latest \
  /usr/local/bin/backup.sh
```

The script logs each step and exits non-zero on failure, so a Dokploy cron with notifications enabled will surface incidents.

## Restore drill — run quarterly

The whole point of backups is that the **restore** works. The drill takes about 15 minutes and forces us to discover broken tooling/permissions before a real incident does.

1. **Spin up an empty target Postgres** (locally is fine):

   ```sh
   docker run --rm -d --name cdp-restore-test \
     -e POSTGRES_USER=cdp \
     -e POSTGRES_PASSWORD=cdp \
     -e POSTGRES_DB=cdp_restore \
     -p 55432:5432 \
     postgres:16-alpine
   ```

2. **Make the age private key available** (mount only — never copy into the image):

   ```sh
   # `age.key` is the file generated during one-time setup.
   ```

3. **Run the restore script** against the throwaway DB:

   ```sh
   docker run --rm \
     -e DATABASE_URL=postgresql://cdp:cdp@host.docker.internal:55432/cdp_restore \
     -e BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
     -e BACKUP_S3_BUCKET=cdp-backups-prod \
     -e BACKUP_S3_ACCESS_KEY_ID=... \
     -e BACKUP_S3_SECRET_ACCESS_KEY=... \
     -e BACKUP_AGE_IDENTITY_FILE=/secrets/age.key \
     -v /absolute/path/to/age.key:/secrets/age.key:ro \
     cdp-backup:latest \
     /usr/local/bin/restore.sh
   ```

   Optional: pass a specific timestamp as the last arg to restore an older dump (`restore.sh 2026-04-28T03-00-00Z`).

4. **Smoke-check the restored DB**:

   ```sh
   PGPASSWORD=cdp psql -h localhost -p 55432 -U cdp -d cdp_restore <<'SQL'
   SELECT count(*) FROM "user";
   SELECT count(*) FROM customer_profile;
   SELECT count(*) FROM "order";
   SELECT max(at) FROM audit_log;
   SQL
   ```

   The counts should match (or be close to) production at backup time. If `audit_log.max(at)` is older than expected, the cron is failing silently — investigate.

5. **Tear down** the throwaway container:

   ```sh
   docker rm -f cdp-restore-test
   ```

6. **Log the drill** in the team runbook with the date, the restored timestamp, and any surprises (token expiry, age version mismatch, schema drift).

## Retention

`BACKUP_RETENTION_DAYS` defaults to 30. The sweep runs at the end of each backup script invocation — old objects are listed by their ISO timestamp prefix and deleted via `aws s3 rm`. Set to `0` to disable retention (manual cleanup).

For longer retention with cheaper storage, configure an R2 lifecycle rule that transitions to colder storage after N days — the script doesn't need to know about it.

## Threats this protects against

- **Accidental drop / migration gone wrong** → restore last good dump.
- **Server / VPS vanishes** → bucket lives elsewhere, restore wherever.
- **Bucket compromised** → age ciphertext alone is useless without the offline key.

## Threats this does NOT protect against

- **Logical corruption that propagated for >retention days** before being noticed → bumped retention or PITR (WAL archiving) is the answer; out of scope here.
- **Lost age private key** → the backups become permanent paperweights. Keep multiple copies in different physical/jurisdictional locations.
