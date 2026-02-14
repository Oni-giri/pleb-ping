#!/bin/sh
# remote-peon.sh — Claude Code hook that writes events for the VS Code extension.
#
# Usage:
#   Called by Claude Code hooks. Receives hook event JSON on stdin.
#   Appends a single-line event to the event file.
#
# Arguments:
#   $1 — event type: session_start | notification | stop | post_tool_use
#
# Environment:
#   REMOTE_PEON_EVENT_FILE — path to event file
#     (default: $HOME/.remote-peon/remote-peon.ev)

set -e

EVENT_TYPE="${1:-unknown}"
EVENT_FILE="${REMOTE_PEON_EVENT_FILE:-$HOME/.remote-peon/remote-peon.ev}"

EVENT_DIR="$(dirname "$EVENT_FILE")"
mkdir -p "$EVENT_DIR"

umask 077

# Drain stdin immediately to unblock Claude Code.
cat > /dev/null

# Map Claude Code hook event types to sound categories.
case "$EVENT_TYPE" in
  session_start) CATEGORY="greeting" ;;
  notification)  CATEGORY="permission" ;;
  stop)          CATEGORY="complete" ;;
  post_tool_use) CATEGORY="acknowledge" ;;
  *)             exit 0 ;;
esac

# Generate timestamp in milliseconds if possible, otherwise seconds.
if date +%s%3N 2>/dev/null | grep -q '^[0-9]*$'; then
  TIMESTAMP=$(date +%s%3N)
else
  TIMESTAMP=$(date +%s)000
fi

# Append the event line under an exclusive lock so concurrent hooks
# from multiple Claude instances don't clobber each other.
# The extension reads all new lines and truncates after processing.
LOCKFILE="${EVENT_FILE}.lock"
if command -v flock >/dev/null 2>&1; then
  flock "$LOCKFILE" sh -c "printf '%s %s\n' '$TIMESTAMP' '$CATEGORY' >> '$EVENT_FILE'"
else
  # Fallback for systems without flock (e.g., macOS).
  # >> is atomic for short writes on POSIX, so this is safe enough.
  printf '%s %s\n' "$TIMESTAMP" "$CATEGORY" >> "$EVENT_FILE"
fi

exit 0
