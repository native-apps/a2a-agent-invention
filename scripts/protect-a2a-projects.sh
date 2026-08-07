#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# protect-a2a-projects.sh — Protects the A2A Agent invention's per-project
# data from being wiped by Mother Brain's update process.
#
# WHY: MB's installFromTarball() deletes the ENTIRE invention directory
# (including projects/ with per-project configs + pgdata) on every update.
# It only preserves config.json — projects/ is silently destroyed.
#
# THIS SCRIPT: continuously snapshots projects/ and auto-restores it if an
# update wipes it. Run it periodically (see launchd/cron) or manually.
#
# Usage:
#   ./scripts/protect-a2a-projects.sh snapshot   # snapshot now
#   ./scripts/protect-a2a-projects.sh restore    # restore if wiped
#   ./scripts/protect-a2a-projects.sh auto       # restore-if-missing, then snapshot
# ---------------------------------------------------------------------------
set -euo pipefail

INV_PROJECTS="$HOME/.mother-brain/inventions/a2a-agent/projects"
BACKUP_DIR="$HOME/.mother-brain/backups/a2a-agent-projects"
MAX_SNAPSHOTS=8   # keep the last 8 snapshots (~16 min of history at 2-min cadence)

mkdir -p "$BACKUP_DIR"

snapshot() {
  if [ -d "$INV_PROJECTS" ] && [ "$(ls -A "$INV_PROJECTS" 2>/dev/null)" ]; then
    local ts
    ts=$(date +%Y%m%d-%H%M%S)
    local snap="$BACKUP_DIR/snapshot-$ts"
    cp -R "$INV_PROJECTS" "$snap" 2>/dev/null
    # Keep a canonical "latest" copy for quick restore
    rm -rf "$BACKUP_DIR/latest"
    cp -R "$INV_PROJECTS" "$BACKUP_DIR/latest" 2>/dev/null
    # Rotate old snapshots (portable — works on BSD/macOS)
    ls -d "$BACKUP_DIR"/snapshot-* 2>/dev/null | sort | awk -v keep=$MAX_SNAPSHOTS 'NR > keep { print }' | xargs -r rm -rf
    echo "[protect] ✅ Snapshot saved: $snap"
  else
    echo "[protect] ⚠️ projects/ missing or empty — nothing to snapshot"
  fi
}

restore() {
  if [ -d "$INV_PROJECTS" ] && [ "$(ls -A "$INV_PROJECTS" 2>/dev/null)" ]; then
    echo "[protect] ✅ projects/ already present — no restore needed"
    return 0
  fi
  # Try latest, then any snapshot
  if [ -d "$BACKUP_DIR/latest" ]; then
    mkdir -p "$INV_PROJECTS"
    cp -R "$BACKUP_DIR/latest/." "$INV_PROJECTS/" 2>/dev/null
    echo "[protect] 🔄 RESTORED projects/ from latest backup"
  else
    local snap
    snap=$(ls -d "$BACKUP_DIR"/snapshot-* 2>/dev/null | sort | tail -1 || true)
    if [ -n "$snap" ] && [ -d "$snap" ]; then
      mkdir -p "$INV_PROJECTS"
      cp -R "$snap/." "$INV_PROJECTS/" 2>/dev/null
      echo "[protect] 🔄 RESTORED projects/ from $snap"
    else
      echo "[protect] ❌ No backup found — projects/ cannot be restored"
      return 1
    fi
  fi
  du -sh "$INV_PROJECTS" 2>/dev/null || true
}

auto() {
  restore
  snapshot
}

case "${1:-auto}" in
  snapshot) snapshot ;;
  restore)  restore ;;
  auto)     auto ;;
  *) echo "Usage: $0 {snapshot|restore|auto}"; exit 1 ;;
esac
