#!/bin/sh
# remote-peon.sh — Claude Code hook that writes events for the VS Code extension.
#
# Usage:
#   Called by Claude Code hooks. Receives hook event JSON on stdin.
#   Writes a single-line event to the event file.
#
# Arguments:
#   $1 — event type: session_start | notification | stop | post_tool_use
#
# Environment:
#   REMOTE_PEON_EVENT_FILE — path to event file (default: /tmp/remote-peon.ev)

set -e

EVENT_TYPE="${1:-unknown}"
EVENT_FILE="${REMOTE_PEON_EVENT_FILE:-/tmp/remote-peon.ev}"

# IMPORTANT: Drain stdin immediately to unblock Claude Code.
# Claude Code pipes hook JSON to stdin. If we don't consume it,
# the pipe stays open and Claude Code waits for our process to finish reading.
cat > /dev/null

# Map Claude Code hook event types to sound categories.
case "$EVENT_TYPE" in
  session_start) CATEGORY="greeting" ;;
  notification)  CATEGORY="permission" ;;
  stop)          CATEGORY="complete" ;;
  post_tool_use) CATEGORY="acknowledge" ;;
  *)             exit 0 ;;  # Unknown event — ignore silently
esac

# Generate timestamp in milliseconds if possible, otherwise seconds.
# GNU date supports %N (nanoseconds), BSD/macOS date does not.
if date +%s%3N 2>/dev/null | grep -q '^[0-9]*$'; then
  TIMESTAMP=$(date +%s%3N)
else
  TIMESTAMP=$(date +%s)000
fi

# Write the event file atomically.
# 1. Write to a temp file (named with our PID to avoid collisions).
# 2. mv (rename) over the target — this is atomic on all POSIX filesystems.
# 3. fs.watch on the extension side sees a "rename" event.
TMPFILE="${EVENT_FILE}.$$"
printf '%s %s\n' "$TIMESTAMP" "$CATEGORY" > "$TMPFILE"
mv -f "$TMPFILE" "$EVENT_FILE"

exit 0
