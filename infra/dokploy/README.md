# Datapp — Production deployment (Hostinger VPS + Dokploy + Cloudflare)

> **STATUS — Iteration 3 finalizes this runbook.** The compose file and the
> bullet outline below are committed early so the schema for the
> deployment is locked. The full step-by-step procedure (with screenshots /
> exact commands) lands when the Docker images are buildable end-to-end.

## Topology

```
┌──────────────┐    ┌─────────────────┐    ┌─────────────────────────┐
│  Cloudflare  │───▶│  Hostinger VPS   │───▶│ Dokploy stack           │
│  proxy + WAF │    │  (Dokploy host) │    │  ┌────────┐  ┌────────┐ │
└──────────────┘    └─────────────────┘    │  │  api   │  │ worker │ │
                                            │  └────────┘  └────────┘ │
                                            │  ┌────────┐  ┌────────┐ │
                                            │  │ admin  │  │postgres│ │
                                            │  └────────┘  └────────┘ │
                                            │  ┌────────┐             │
                                            │  │ redis  │             │
                                            │  └────────┘             │
                                            └─────────────────────────┘
```

## VPS sizing

| Plan      | RAM   | Recommended?                                        |
| --------- | ----- | --------------------------------------------------- |
| KVM 2     | 8 GB  | Too tight once the worker is doing initial sync     |
| **KVM 4** | 16 GB | **Minimum** for production                          |
| KVM 8     | 32 GB | Recommended once orders > 100k or web events arrive |

## Outline (to be expanded in Iteration 3)

1. **Hostinger VPS provisioning.** Ubuntu 24.04 LTS, KVM 4 minimum.
2. **Initial hardening.**
   - Non-root user with sudo + SSH key only.
   - `ufw` allow 22, 80, 443; deny everything else.
   - `fail2ban` for SSH.
   - `unattended-upgrades` for security patches.
3. **Dokploy installation.** Single-line installer; reverse proxy via
   Traefik bundled with Dokploy.
4. **Cloudflare DNS.** A records for `api.datapp.com.ar` and
   `datapp.com.ar` proxied through Cloudflare; SSL = Full (Strict).
5. **Stack deployment.** Use `docker-compose.dokploy.yml` (committed in
   Iteration 3). Secrets via Dokploy's encrypted env store.
6. **Postgres backup.** Sidecar cron container running `pg_dump` nightly,
   piped through `age` for encryption, uploaded to Cloudflare R2 with
   lifecycle: 30 daily + 12 monthly. Restore drill documented in
   `RESTORE.md`.
7. **Observability.** Sentry DSNs configured per service; logs shipped via
   Dokploy's Loki integration to a central instance.

## Secrets needed

See repo root `.env.example`. In Dokploy these go in the per-service
"Environment" tab — never committed.
