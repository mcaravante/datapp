# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------
# CDP API + worker. One image, two CMDs:
#   docker build -f infra/docker/api.Dockerfile --target api    -t datapp-api    .
#   docker build -f infra/docker/api.Dockerfile --target worker -t datapp-worker .
# ---------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates tini
WORKDIR /app

# ---- deps: install workspace dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/loader/package.json ./apps/loader/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/magento-client/package.json ./packages/magento-client/
COPY packages/config/package.json ./packages/config/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- builder: generate prisma client + compile workspace packages + build api ----
FROM base AS builder
# Copy the whole deps tree (node_modules + package.jsons + lockfile). pnpm
# uses per-package node_modules with symlinks; copying everything in one shot
# is simpler and tolerant of packages that have no transitive deps.
COPY --from=deps /app ./
COPY . .
# Defense in depth: scrub any tsbuildinfo that slipped past .dockerignore.
# Stale incremental cache makes tsc emit only declaration files (no .js).
RUN find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete || true
RUN pnpm --filter @datapp/db generate
RUN pnpm --filter @datapp/shared build
RUN pnpm --filter @datapp/magento-client build
RUN pnpm --filter @datapp/api build

# ---- runtime base shared by api + worker ----
# Non-root for blast-radius reduction. The `node` user (uid 1000) ships
# with the official image; we add a dedicated `datapp` user (uid 1001) so
# nothing in the image is owned by uid 0.
FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 datapp \
  && useradd --system --uid 1001 --gid datapp --shell /usr/sbin/nologin datapp
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db/generated ./packages/db/generated
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
# Prisma CLI lives under packages/db/node_modules in pnpm — copy it so
# the entrypoint can run `prisma migrate deploy` on boot.
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/magento-client/dist ./packages/magento-client/dist
COPY --from=builder /app/packages/magento-client/package.json ./packages/magento-client/
COPY --from=builder /app/packages/magento-client/node_modules ./packages/magento-client/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/nest-cli.json ./apps/api/
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY infra/docker/entrypoint-api.sh /usr/local/bin/entrypoint-api.sh
RUN chmod +x /usr/local/bin/entrypoint-api.sh && chown -R datapp:datapp /app
USER datapp
WORKDIR /app/apps/api
EXPOSE 3000

# ---- api: HTTP entry point ----
# `tini` reaps zombies and forwards SIGTERM to Node, which is critical
# for graceful shutdown. The entrypoint script optionally runs Prisma
# migrations before exec'ing the server.
FROM runtime AS api
ENV PORT=3000
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint-api.sh"]
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://localhost:'+(process.env.PORT||3000)+'/v1/health/live', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "dist/main.js"]

# ---- worker: BullMQ entry point ----
# Worker has no HTTP listener, so we don't run the migration entrypoint
# here — only the api (or a dedicated migrate job) should touch the
# schema to avoid concurrent prisma migrate deploys.
FROM runtime AS worker
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/worker.js"]
