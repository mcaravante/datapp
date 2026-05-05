# Pinning the Postgres data volume

The named `postgres_data` volume in `infra/dokploy/docker-compose.dokploy.yml`
is **not pinned** today. Docker resolves it as
`<compose_project>_postgres_data` — and Dokploy may change the
compose-project name when the app is renamed, recreated, or migrated to
a new server. The next `docker compose up` then mounts a brand-new
empty volume and leaves the old one orphaned. From the application's
point of view, all data is gone.

This runbook locks the volume to a stable, predictable name
(`datapp_postgres_data`) **without losing data** along the way.

## Pre-flight

You'll need shell access on the VPS that runs Dokploy. All commands are
run as the user that controls Docker (root or in the `docker` group).

## 1. Discover the live volume name

```sh
docker volume ls | grep postgres
```

Pick the volume whose name ends in `_postgres_data` and that has the
most disk usage / most recent mount time. That's the live one. Save it:

```sh
LIVE=datapp-datapp-eb7xco_postgres_data   # paste the actual name here
TARGET=datapp_postgres_data
```

If `LIVE` already equals `TARGET`, you're done — pin the name in compose
(see step 5) and the next deploy is a no-op.

## 2. Take a fresh dump (off-host)

Even though the migration below copies the directory verbatim, never
run a volume rename without a backup you can restore from cold.

```sh
docker exec -i $(docker ps --filter name=postgres --format '{{.ID}}') \
  pg_dumpall -U "$POSTGRES_USER" \
  | gzip > "$HOME/datapp-pre-pin-$(date -u +%Y%m%d-%H%M%S).sql.gz"
```

Copy the resulting `.sql.gz` to a different machine (S3, your laptop,
a backup VPS — anywhere not on this host).

## 3. Stop the stack

```sh
cd /etc/dokploy/compose/<dokploy-app-id>/code
docker compose -f infra/dokploy/docker-compose.dokploy.yml down
```

`down` (not `down -v`) — we want the volume preserved.

## 4. Copy the data into the new pinned volume

```sh
docker volume create "$TARGET"

docker run --rm \
  -v "$LIVE":/from:ro \
  -v "$TARGET":/to \
  alpine \
  sh -c 'cd /from && tar cf - . | (cd /to && tar xf -)'
```

Verify the target has the same size and contains the `PG_VERSION` file:

```sh
docker run --rm -v "$TARGET":/data alpine ls -la /data
```

## 5. Pin the name in compose

Edit `infra/dokploy/docker-compose.dokploy.yml`, replacing:

```yaml
volumes:
  postgres_data:
  redis_data:
```

with:

```yaml
volumes:
  postgres_data:
    name: datapp_postgres_data
    external: true
  redis_data:
    name: datapp_redis_data
    external: true
```

`external: true` tells compose "this volume is managed outside; never
recreate it". Combined with the explicit `name:`, Dokploy can never
silently switch.

(You can do the same dance for `redis_data` — Redis state is less
critical because BullMQ jobs are reproducible, but pinning it stops
in-flight jobs from being lost across a Dokploy reset.)

## 6. Bring the stack back up

```sh
docker compose -f infra/dokploy/docker-compose.dokploy.yml up -d
```

Watch the api logs for `Prisma connected` and tail postgres for
`database system is ready`. If the schema looks intact, you're done.

## 7. Sanity check + cleanup

Run a quick row count against a known table:

```sh
docker exec -i $(docker ps --filter name=postgres --format '{{.ID}}') \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT COUNT(*) FROM customer_profile;'
```

If it matches the pre-pin number, drop the old orphan volume:

```sh
docker volume rm "$LIVE"
```

Keep the `.sql.gz` dump for at least 30 days.

## Rolling back

If something goes wrong before step 7:

1. `docker compose down`
2. Revert the compose change (drop `name:` + `external:`).
3. `docker compose up -d` — it remounts the original `LIVE` volume.
4. Restore from the `.sql.gz` only if data inside `LIVE` was corrupted
   somehow (extremely unlikely with the `tar` copy above).

After step 7 the rollback path is the same minus the volume revert
(rename is permanent on the operator's side).
