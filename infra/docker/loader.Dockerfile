# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------
# Datapp loader — public popup script for storefronts.
# Builds the bundle with esbuild + serves it via nginx-alpine on :80.
# Cloudflare in front terminates SSL and points loader.datapp.com.ar
# at the container.
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

# ---- builder ----
FROM base AS builder
ARG LOADER_DEFAULT_API_URL=https://api.datapp.com.ar
ENV LOADER_DEFAULT_API_URL=$LOADER_DEFAULT_API_URL
COPY --from=deps /app ./
COPY . .
RUN find . -name '*.tsbuildinfo' -not -path './node_modules/*' -delete || true
RUN pnpm --filter @datapp/loader build
# Copy the static index.html alongside the bundle so the runtime image
# only carries `dist/` + `public/` — no Node, no source.
RUN cp -R apps/loader/public/. apps/loader/dist/

# ---- runtime: nginx ----
FROM nginx:1.27-alpine AS runtime
COPY infra/docker/loader.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/loader/dist /usr/share/nginx/html
EXPOSE 80
# 127.0.0.1, not localhost — busybox wget in alpine resolves localhost to
# ::1 first, but nginx here listens only on IPv4. Using the literal IPv4
# address avoids a flapping unhealthy state that makes Traefik refuse to
# route to the container.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1/loader.js >/dev/null || exit 1
