#!/bin/sh
# CDP Postgres restore — download from S3, decrypt with age, pg_restore.
#
# Usage:
#   restore.sh                       # restore the most recent backup
#   restore.sh 2026-04-28T03-00-00Z  # restore a specific timestamp
#
# Required env (same as backup.sh, plus the private age key):
#   DATABASE_URL                — connection string used for pg_restore
#                                 (typically points at a clean target DB!)
#   BACKUP_S3_ENDPOINT
#   BACKUP_S3_BUCKET
#   BACKUP_S3_ACCESS_KEY_ID
#   BACKUP_S3_SECRET_ACCESS_KEY
#   BACKUP_S3_REGION            — defaults to "auto"
#   BACKUP_AGE_IDENTITY_FILE    — path to the age private key (e.g.
#                                 /run/secrets/age.key). NEVER commit
#                                 this file or store it in S3.
#
# Drill: run quarterly against a throwaway DB to verify the chain works
# end-to-end. The runbook documents the exact dance.

set -eu

: "${DATABASE_URL:?missing}"
: "${BACKUP_S3_ENDPOINT:?missing}"
: "${BACKUP_S3_BUCKET:?missing}"
: "${BACKUP_S3_ACCESS_KEY_ID:?missing}"
: "${BACKUP_S3_SECRET_ACCESS_KEY:?missing}"
: "${BACKUP_AGE_IDENTITY_FILE:?missing}"

REGION="${BACKUP_S3_REGION:-auto}"
PREFIX="${BACKUP_S3_PREFIX:-cdp}"

TS="${1:-}"
if [ -z "$TS" ]; then
  echo "[restore] no timestamp given — picking most recent backup..."
  TS=$(AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
       AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
       aws s3 ls \
         --endpoint-url "$BACKUP_S3_ENDPOINT" \
         --region "$REGION" \
         "s3://${BACKUP_S3_BUCKET}/${PREFIX}/" \
       | awk '{print $4}' \
       | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z\.dump\.age$' \
       | sort \
       | tail -n 1)
  TS="${TS%.dump.age}"
  if [ -z "$TS" ]; then
    echo "[restore] no backups found in s3://${BACKUP_S3_BUCKET}/${PREFIX}/"
    exit 1
  fi
fi

KEY="${PREFIX}/${TS}.dump.age"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT INT TERM
ENC_FILE="$WORK_DIR/${TS}.dump.age"
DUMP_FILE="$WORK_DIR/${TS}.dump"

echo "[restore] downloading s3://${BACKUP_S3_BUCKET}/${KEY}..."
AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
aws s3 cp \
  --endpoint-url "$BACKUP_S3_ENDPOINT" \
  --region "$REGION" \
  --no-progress \
  "s3://${BACKUP_S3_BUCKET}/${KEY}" \
  "$ENC_FILE"

echo "[restore] decrypting with age..."
age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" --output "$DUMP_FILE" "$ENC_FILE"

echo "[restore] restoring into the target database..."
# `--clean --if-exists` so we can rerun on a partially-restored DB.
pg_restore \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --dbname="$DATABASE_URL" \
  "$DUMP_FILE"

echo "[restore] done. Run a smoke check (count rows, SELECT 1, login) before pointing the app at this DB."
