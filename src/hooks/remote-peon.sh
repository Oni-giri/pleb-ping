#!/bin/sh
# remote-peon.sh — Claude Code/Codex/Grok hook that writes events for the VS Code extension.
#
# Usage:
#   Called by Claude Code, Codex, or Grok (Claude-compat) hooks. Receives hook
#   event JSON on stdin. Appends a single-line event to the event file.
#
# Arguments:
#   $1 — event type: session_start | notification | permission_request | stop |
#        stop_failure | post_tool_use
#
# Environment:
#   REMOTE_PEON_EVENT_FILE — path to event file
#     (default: $HOME/.remote-peon/remote-peon.ev)
#   REMOTE_PEON_DEBUG_LOG — path to the sanitized hook invocation log, or "off"
#     (default: alongside the event file as remote-peon-debug.jsonl)
#   GROK_SESSION_ID / GROK_HOOK_EVENT — set by Grok when it runs hooks; used to
#     suppress Claude Notification spam (Grok fires permission_prompt per tool).

set -e

EVENT_TYPE="${1:-unknown}"
EVENT_FILE="${REMOTE_PEON_EVENT_FILE:-$HOME/.remote-peon/remote-peon.ev}"

EVENT_DIR="$(dirname "$EVENT_FILE")"
mkdir -p "$EVENT_DIR"
DEBUG_LOG="${REMOTE_PEON_DEBUG_LOG:-$EVENT_DIR/remote-peon-debug.jsonl}"

umask 077

# Keep stdin only long enough to extract safe trigger metadata. The payload can
# contain prompts and tool inputs, so the raw JSON is never written to the log.
PAYLOAD_FILE="$(mktemp "${TMPDIR:-/tmp}/remote-peon-payload.XXXXXX")"
DECISION_FILE="$(mktemp "${TMPDIR:-/tmp}/remote-peon-decision.XXXXXX")"
trap 'rm -f "$PAYLOAD_FILE" "$DECISION_FILE"' EXIT HUP INT TERM
cat > "$PAYLOAD_FILE"

# Generate timestamp in milliseconds if possible, otherwise seconds.
if date +%s%3N 2>/dev/null | grep -q '^[0-9]*$'; then
  TIMESTAMP=$(date +%s%3N)
else
  TIMESTAMP=$(date +%s)000
fi

# Decide the sound category from the configured event + payload metadata.
# Node is available wherever this extension is built; the shell fallback keeps
# basic mappings when a hook runs in a more minimal environment.
if command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs");
    const [payloadPath, decisionPath, timestamp, configuredEvent, debugLog] = process.argv.slice(1);
    const raw = fs.readFileSync(payloadPath, "utf8");
    let payload = {};
    let payloadValidJson = true;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
      else payloadValidJson = false;
    } catch {
      payloadValidJson = false;
    }

    const safeString = (...fields) => {
      for (const field of fields) {
        if (typeof payload[field] === "string" && payload[field]) return payload[field];
      }
      return null;
    };

    const notificationType = safeString("notificationType", "notification_type");
    const underGrok = Boolean(process.env.GROK_SESSION_ID || process.env.GROK_HOOK_EVENT);

    // Attention-seeking Claude Notification types only. Grok loads Claude hooks
    // from ~/.claude/settings.json and fires permission_prompt on every tool
    // call (including auto-approved), so never emit a sound for notifications
    // when running under Grok.
    const ATTENTION_NOTIFICATION_TYPES = new Set([
      "permission_prompt",
      "idle_prompt",
      "agent_needs_input",
    ]);

    let category = "ignored";
    switch (configuredEvent) {
      case "session_start":
        category = "greeting";
        break;
      case "permission_request":
        category = "permission";
        break;
      case "stop":
        category = "complete";
        break;
      case "stop_failure":
        category = "error";
        break;
      case "post_tool_use":
        category = "acknowledge";
        break;
      case "notification":
        if (underGrok) {
          category = "ignored";
        } else if (!notificationType || ATTENTION_NOTIFICATION_TYPES.has(notificationType)) {
          // Missing type: older clients / empty payload — keep permission sound.
          category = "permission";
        } else {
          category = "ignored";
        }
        break;
      default:
        category = "ignored";
    }

    fs.writeFileSync(decisionPath, category);

    if (debugLog && debugLog !== "off") {
      const record = {
        timestamp: Number(timestamp),
        configured_event: configuredEvent,
        category,
        harness: underGrok ? "grok" : null,
        notification_type: notificationType,
        hook_event_name: safeString("hook_event_name", "hookEventName"),
        session_id: safeString("session_id", "sessionId"),
        turn_id: safeString("turn_id", "turnId"),
        source: safeString("source"),
        permission_mode: safeString("permission_mode", "permissionMode"),
        tool_name: safeString("tool_name", "toolName"),
        model: safeString("model"),
        payload_keys: Object.keys(payload).sort(),
        payload_bytes: Buffer.byteLength(raw),
        payload_valid_json: payloadValidJson,
      };
      fs.appendFileSync(debugLog, JSON.stringify(record) + "\n");
    }
  ' "$PAYLOAD_FILE" "$DECISION_FILE" "$TIMESTAMP" "$EVENT_TYPE" "$DEBUG_LOG" 2>/dev/null || true
  CATEGORY="$(cat "$DECISION_FILE" 2>/dev/null || true)"
  if [ -z "$CATEGORY" ]; then
    CATEGORY="ignored"
  fi
else
  # Minimal fallback without Node: same coarse mapping as before, but still
  # suppress notifications under Grok so tool spam cannot play sounds.
  case "$EVENT_TYPE" in
    session_start) CATEGORY="greeting" ;;
    permission_request) CATEGORY="permission" ;;
    stop) CATEGORY="complete" ;;
    stop_failure) CATEGORY="error" ;;
    post_tool_use) CATEGORY="acknowledge" ;;
    notification)
      if [ -n "${GROK_SESSION_ID:-}" ] || [ -n "${GROK_HOOK_EVENT:-}" ]; then
        CATEGORY="ignored"
      else
        CATEGORY="permission"
      fi
      ;;
    *) CATEGORY="ignored" ;;
  esac
  if [ "$DEBUG_LOG" != "off" ]; then
    DEBUG_DIR="$(dirname "$DEBUG_LOG")"
    mkdir -p "$DEBUG_DIR"
    SAFE_EVENT="$(printf '%s' "$EVENT_TYPE" | tr -cd '[:alnum:]_-')"
    printf '{"timestamp":%s,"configured_event":"%s","category":"%s","metadata_parser":"unavailable"}\n' \
      "$TIMESTAMP" "$SAFE_EVENT" "$CATEGORY" >> "$DEBUG_LOG" 2>/dev/null || true
  fi
fi

# Unknown / filtered events are useful in the debug log but must not make a
# sound or enter the extension event stream.
if [ "$CATEGORY" = "ignored" ]; then
  exit 0
fi

# Append the event line under an exclusive lock so concurrent hooks
# from multiple agent instances don't clobber each other.
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
