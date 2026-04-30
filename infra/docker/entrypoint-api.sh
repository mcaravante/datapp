#!/bin/sh
# API container entrypoint.
#
# When MIGRATE_ON_BOOT=true, runs `prisma migrate deploy` before
# starting the server. Recommended setup:
#   - Set MIGRATE_ON_BOOT=true on exactly ONE replica of the API
#     container (or run it as a one-shot pre-deploy job in Dokploy).
#   - Leave MIGRATE_ON_BOOT unset on the worker container — only the
#     API or a dedicated job container should mutate the schema, to
#     avoid race conditions between replicas.

set -eu

if [ "${MIGRATE_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] MIGRATE_ON_BOOT=true — running prisma migrate deploy..."
  cd /app/packages/db
  # `node_modules/.bin/prisma` is a POSIX shell wrapper that pnpm
  # creates — invoke it directly. Prefixing with `node` made the JS
  # parser try to read the shell snippet and fail with "missing )"
  # at the `basedir=$(dirname "$0")` line.
  ./node_modules/.bin/prisma migrate deploy
  cd /app/apps/api
  echo "[entrypoint] migrations applied"
fi

exec "$@"
