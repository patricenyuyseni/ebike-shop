#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_DIR="$HOME/ebike-backups"

mkdir -p "$BACKUP_DIR"

# Load DATABASE_URL safely from backend/.env
if [ -z "${DATABASE_URL:-}" ] && [ -f "$PROJECT_DIR/.env" ]; then
    DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$PROJECT_DIR/.env" | head -n 1)"
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL is missing"
    exit 1
fi

BACKUP_FILE="$BACKUP_DIR/ebike_$(date +%Y%m%d_%H%M%S).dump"

echo "Starting Neon database backup..."

pg_dump "$DATABASE_URL" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$BACKUP_FILE"

echo "Backup completed successfully!"
echo "Backup location: $BACKUP_FILE"

find "$BACKUP_DIR" -type f -name "*.dump" -mtime +7 -delete