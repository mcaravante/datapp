# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------
# CDP admin (Next.js standalone output).
#   docker build -f infra/docker/admin.Dockerfile -t cdp-admin .
# ---------------------------------------------------------------------

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ---- deps ----
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

# ---- builder: shared package + admin Next build ----
FROM base AS builder
COPY --from=deps /app ./
COPY . .
# Defense in depth: scrub stale incremental tsc cache.
RUN find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete || true
RUN pnpm --filter @cdp/shared build
# Next reads NODE_ENV at build time; it must be `production` for the prerender.
RUN cd apps/admin && NODE_ENV=production pnpm exec next build

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Next standalone bundles only the files it traced. We layered our root at
# `outputFileTracingRoot = ../../`, so the output mirrors the monorepo path.
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public

EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('node:http').get('http://localhost:'+(process.env.PORT||3001)+'/login', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "apps/admin/server.js"]
