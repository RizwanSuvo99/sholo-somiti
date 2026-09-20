#!/usr/bin/env bash
# Nightly dump of the Sholo Somiti database.
#
# Old dumps are pruned only after the new one is confirmed non-empty, so a
# failed run never leaves the directory emptier than it found it.
set -euo pipefail

CONTAINER=somiti_postgres
DB_USER=somiti
DB_NAME=somiti
DEST=/opt/backups/sholo-somiti
KEEP_DAYS=14

mkdir -p "$DEST"
STAMP=$(date +%F-%H%M)
OUT="$DEST/somiti-$STAMP.sql.gz"

echo "[$(date -Is)] dumping $DB_NAME"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" | gzip > "$OUT"

if [ ! -s "$OUT" ]; then
  echo "[$(date -Is)] FAILED: dump is empty, keeping existing backups" >&2
  rm -f "$OUT"
  exit 1
fi

echo "[$(date -Is)] wrote $OUT ($(du -h "$OUT" | cut -f1))"
find "$DEST" -name 'somiti-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "[$(date -Is)] done; $(ls -1 "$DEST" | wc -l) dumps retained"
