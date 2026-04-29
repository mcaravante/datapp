# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------
# CDP backup runner.
#
# Tiny image with the three tools backup.sh / restore.sh need:
#   - pg_dump / pg_restore (postgresql-client-16)
#   - age (encryption)
#   - aws-cli (S3-compatible upload)
#
# Run scheduled (Dokploy cron / docker compose run / k8s CronJob) with
# the env block from infra/backups/backup.sh injected at runtime. The
# image NEVER carries secrets.
# ---------------------------------------------------------------------

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       gnupg \
       lsb-release \
       awscli \
       age \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

# Non-root for backups too — there's no reason this needs uid 0.
RUN groupadd --system --gid 1001 backup \
  && useradd --system --uid 1001 --gid backup --shell /usr/sbin/nologin --home /backup backup

COPY infra/backups/backup.sh /usr/local/bin/backup.sh
COPY infra/backups/restore.sh /usr/local/bin/restore.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

USER backup
WORKDIR /backup

CMD ["/usr/local/bin/backup.sh"]
