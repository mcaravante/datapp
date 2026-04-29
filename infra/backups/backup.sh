#!/bin/sh
# CDP Postgres backup — pg_dump → age encryption → S3-compatible upload.
#
# Designed to run as a Dokploy scheduled job (or host cron) once a day.
# Uploads to a key like `cdp/2026-04-28T03:00:00Z.dump.age` so the
# bucket browse view stays sortable and the restore script can list +
# pick the latest by lexicographic order.
#
# Required env:
#   DATABASE_URL                — connection string used for pg_dump
#   BACKUP_S3_ENDPOINT          — e.g. https://<account>.r2.cloudflarestorage.com
#   BACKUP_S3_BUCKET            — e.g. cdp-backups-prod
#   BACKUP_S3_ACCESS_KEY_ID     — R2 token (or AWS access key)
#   BACKUP_S3_SECRET_ACCESS_KEY — R2 token secret
#   BACKUP_S3_REGION            — defaults to "auto" for R2
#   BACKUP_AGE_RECIPIENT        — public key used to encrypt the dump
#                                 (e.g. age1xyz...). The matching
#                                 private key lives OFFLINE — anyone
#                                 with read access to the bucket cannot
#                                 decrypt without it.
#
# Tools required in the runtime: pg_dump (postgresql-client),
# age, aws-cli (or rclone).

set -eu

: "${DATABASE_URL:?missing}"
: "${BACKUP_S3_ENDPOINT:?missing}"
: "${BACKUP_S3_BUCKET:?missing}"
: "${BACKUP_S3_ACCESS_KEY_ID:?missing}"
: "${BACKUP_S3_SECRET_ACCESS_KEY:?missing}"
: "${BACKUP_AGE_RECIPIENT:?missing}"

REGION="${BACKUP_S3_REGION:-auto}"
PREFIX="${BACKUP_S3_PREFIX:-cdp}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT_DIR="$(mktemp -d)"
trap 'rm -rf "$OUT_DIR"' EXIT INT TERM

DUMP_FILE="$OUT_DIR/${TS}.dump"
ENC_FILE="$OUT_DIR/${TS}.dump.age"
KEY="${PREFIX}/${TS}.dump.age"

echo "[backup] $(date -u +%FT%TZ) starting pg_dump..."
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --compress=9 \
  --file="$DUMP_FILE" \
  "$DATABASE_URL"

DUMP_SIZE=$(wc -c < "$DUMP_FILE")
echo "[backup] dump complete (${DUMP_SIZE} bytes), encrypting with age..."

age --recipient "$BACKUP_AGE_RECIPIENT" --output "$ENC_FILE" "$DUMP_FILE"
ENC_SIZE=$(wc -c < "$ENC_FILE")
echo "[backup] encrypted (${ENC_SIZE} bytes), uploading to s3://${BACKUP_S3_BUCKET}/${KEY}..."

AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
aws s3 cp \
  --endpoint-url "$BACKUP_S3_ENDPOINT" \
  --region "$REGION" \
  --no-progress \
  "$ENC_FILE" \
  "s3://${BACKUP_S3_BUCKET}/${KEY}"

echo "[backup] uploaded ${KEY} (${ENC_SIZE} bytes)"

# Retention sweep — delete encrypted dumps older than the threshold.
# We compare ISO timestamps embedded in the keys, which works because
# the prefix sorts lexicographically by date.
if [ "$RETENTION_DAYS" -gt 0 ]; then
  CUTOFF="$(date -u -d "${RETENTION_DAYS} days ago" +%Y-%m-%dT%H-%M-%SZ 2>/dev/null \
    || date -u -v-"${RETENTION_DAYS}"d +%Y-%m-%dT%H-%M-%SZ)"
  echo "[backup] sweeping objects older than ${CUTOFF}..."
  AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
  aws s3 ls \
    --endpoint-url "$BACKUP_S3_ENDPOINT" \
    --region "$REGION" \
    "s3://${BACKUP_S3_BUCKET}/${PREFIX}/" \
  | awk '{print $4}' \
  | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z\.dump\.age$' \
  | while read -r OBJ_NAME; do
      OBJ_TS="${OBJ_NAME%.dump.age}"
      if [ "$OBJ_TS" \< "$CUTOFF" ]; then
        echo "[backup] deleting old backup ${OBJ_NAME}"
        AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
        AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
        aws s3 rm \
          --endpoint-url "$BACKUP_S3_ENDPOINT" \
          --region "$REGION" \
          "s3://${BACKUP_S3_BUCKET}/${PREFIX}/${OBJ_NAME}"
      fi
    done
fi

echo "[backup] done."
