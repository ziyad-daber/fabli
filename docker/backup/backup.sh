#!/bin/sh
# Daily PostgreSQL logical backup (§9 — "sauvegardes régulières").
# Runs pg_dump every 24h, keeps BACKUP_RETENTION_DAYS days, then sleeps.
set -eu

RETENTION="${BACKUP_RETENTION_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

run_dump() {
    stamp="$(date +%Y%m%d-%H%M%S)"
    target="/backups/${POSTGRES_DB}-${stamp}.sql.gz"

    echo "[backup] dumping ${POSTGRES_DB} -> ${target}"
    if pg_dump -h postgres -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
        --no-owner --no-privileges | gzip -9 > "${target}.tmp"; then
        mv "${target}.tmp" "${target}"
        echo "[backup] ok ($(du -h "${target}" | cut -f1))"
    else
        rm -f "${target}.tmp"
        echo "[backup] FAILED — dumping ${POSTGRES_DB}" >&2
    fi

    # Retention
    find /backups -name "${POSTGRES_DB}-*.sql.gz" -type f -mtime "+${RETENTION}" -print -delete
}

while true; do
    run_dump
    sleep "${INTERVAL}" &
    wait $!
done