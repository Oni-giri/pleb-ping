# Remote Peon

A VS Code extension that plays audio notifications when Claude Code, Codex CLI, Grok Build (or other AI coding agents) changes state — for example, when it finishes a task or needs permission to proceed.

The key difference from existing solutions: **it works on remote machines.** Whether you're connected via VS Code Remote-SSH or running code-server in a browser, you hear the sounds locally.

## How it works

A lightweight shell hook writes a single-line event to a file whenever an agent fires a lifecycle event. The VS Code extension watches that file with `fs.watch` (zero CPU when idle), picks a sound from the active pack, and plays it through a hidden webview — which always renders locally, even over Remote-SSH.

```
Claude / Codex / Grok hook  -->  ~/.remote-peon/remote-peon.ev  -->  VS Code extension  -->  Audio (local)
```

## Supported environments

| Environment | Extension host | Audio plays on |
|---|---|---|
| VS Code + Remote-SSH | Remote server | Local machine (Electron webview) |
| code-server (browser) | Remote server | Browser tab (Web Audio) |
| VS Code local | Local machine | Local machine (native `afplay`/`paplay`) |

## Installation

### From source

```bash
git clone <repo-url> && cd pleb-ping
npm install
npm run compile
npm run package          # creates remote-peon-0.1.0.vsix
code --install-extension remote-peon-0.1.0.vsix
```

### Setup

On first activation the extension will:

1. **Download default sound packs** (peon, peasant, glados, sc_battlecruiser) from the [peon-ping](https://github.com/PeonPing/peon-ping) repository to `~/.remote-peon/packs/`.
2. **Install Claude Code hooks** — copies the hook script to `~/.claude/hooks/remote-peon.sh` and registers it in `~/.claude/settings.json` for `SessionStart`, `Notification` (matcher: `permission_prompt|idle_prompt|agent_needs_input`), and `Stop` events.
3. **Install Grok hooks** (when `~/.grok` exists) — copies the adapter to `~/.grok/hooks/remote-peon.sh` and writes `~/.grok/hooks/remote-peon.json` for `SessionStart` (greeting), `Stop` (completion), and `StopFailure` (error).

After installation, run `/hooks` in Claude Code or Grok to review hooks. In Grok, press `r` in the Hooks tab (or `/hooks`) to reload mid-session.

Codex CLI setup is explicit: use `Remote Peon: Install Codex CLI Hooks` from the Command Palette. It copies the adapter to `~/.codex/hooks/remote-peon.sh` and adds `SessionStart` (greeting), `PermissionRequest` (approval), and `Stop` (completion) handlers to `~/.codex/hooks.json`. Then run `/hooks` in Codex to review and trust the new command hooks before they can run.

### Agent support

| Agent | Install | Events → sounds |
|---|---|---|
| **Claude Code** | Auto | SessionStart → greeting, Notification (attention types) → permission, Stop → complete |
| **Grok Build** | Auto when `~/.grok` exists | SessionStart → greeting, Stop → complete, StopFailure → error. **No Notification** (Grok fires `permission_prompt` on every tool). Claude Notification hooks are ignored under Grok (`GROK_SESSION_ID`). |
| **Codex CLI** | Command palette | SessionStart → greeting, PermissionRequest → permission, Stop → complete |

Grok also loads Claude's `~/.claude/settings.json` by default, so SessionStart/Stop can fire twice; the extension's per-category debounce collapses that to one sound. Use Grok's own `[ui.notifications]` for tool-approval alerts.

## Usage

Once installed, sounds play automatically when a supported agent:

- **Starts a session** — greeting sound
- **Needs your approval** — permission sound (Claude / Codex; not Grok hooks)
- **Finishes a turn or task** — completion sound (`Stop` is turn-scoped in Codex and Grok)
- **Hits an error** — error sound (Grok `StopFailure`; pack `error` category elsewhere)

### Diagnosing hook triggers

Every adapter invocation writes one sanitized JSON line to `~/.remote-peon/remote-peon-debug.jsonl`. The record includes the configured event, resolved `category`, `notification_type` (Claude/Grok), `harness` (`"grok"` when applicable), Codex's `hook_event_name`, `session_id`, `turn_id`, `tool_name`, and the names (but not values) of other payload fields. Raw prompts, tool inputs, working directories, and transcript contents are not logged.

Follow the log while reproducing an unexpected sound:

```sh
tail -f ~/.remote-peon/remote-peon-debug.jsonl
```

Useful patterns:

- **Grok tool spam (fixed in adapter):** `configured_event: "notification"`, `notification_type: "permission_prompt"`, `harness: "grok"`, `category: "ignored"` — no sound.
- **Codex turns:** repeated `Stop` with the same `session_id` and different `turn_id` are separate turns, not tool-use events.
- **Claude permission:** `notification_type: "permission_prompt"` or `idle_prompt` with `category: "permission"`.

Set `REMOTE_PEON_DEBUG_LOG=off` in a hook command to disable this log, or set it to another path to redirect it. After upgrading the extension, reinstall Claude/Codex/Grok hooks so the copied adapter and configs are updated.

### Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---|---|
| `Remote Peon: Select Sound Pack` | Switch between installed packs |
| `Remote Peon: Preview Current Pack Sounds` | Play one sound from each enabled category |
| `Remote Peon: Download More Sound Packs` | Browse and install from 36 available packs |
| `Remote Peon: Install Claude Code Hooks` | Manually (re)install hooks |
| `Remote Peon: Remove Claude Code Hooks` | Remove hooks from Claude Code config |
| `Remote Peon: Install Codex CLI Hooks` | Manually install Codex CLI hooks, then review them with `/hooks` |
| `Remote Peon: Remove Codex CLI Hooks` | Remove only Remote Peon handlers from Codex hooks config |
| `Remote Peon: Install Grok Hooks` | Manually (re)install `~/.grok/hooks/remote-peon.{sh,json}` |
| `Remote Peon: Remove Grok Hooks` | Delete `~/.grok/hooks/remote-peon.json` |
| `Remote Peon: Open Packs Directory` | Open `~/.remote-peon/packs/` in your file manager |

### Status bar

A status bar item shows the current agent state (Ready, Working, Needs input, Done, Error). Click it to change the sound pack.

## Settings

All settings are under `remotePeon.*` in VS Code Settings.

| Setting | Default | Description |
|---|---|---|
| `pack` | `"peon"` | Active sound pack ID |
| `packsDirectory` | `~/.remote-peon/packs` | Where packs are stored |
| `eventFile` | `~/.remote-peon/remote-peon.ev` | Event file path (must match the hook script) |
| `volume` | `0.7` | Playback volume (0.0 -- 1.0) |
| `debounceMs` | `2000` | Min ms between sounds |
| `sounds.greeting` | `true` | Play on session start |
| `sounds.acknowledge` | `false` | Play on each tool use (spammy) |
| `sounds.permission` | `true` | Play when approval needed |
| `sounds.complete` | `true` | Play on task completion |
| `sounds.error` | `true` | Play on errors |
| `sounds.annoyed` | `true` | Easter egg sounds |
| `autoInstallHooks` | `true` | Auto-install Claude Code hooks (and Grok hooks when `~/.grok` exists) on activation |
| `showStatusBar` | `true` | Show status bar item |
| `usePolling` | `false` | Use `fs.watchFile` instead of `fs.watch` (for NFS/FUSE) |
| `pollingIntervalMs` | `500` | Polling interval when `usePolling` is enabled |

## Custom sound packs

Create a directory in `~/.remote-peon/packs/` with a `manifest.json` and a `sounds/` folder:

```
~/.remote-peon/packs/my-pack/
  manifest.json
  sounds/
    greeting_1.wav
    complete_1.wav
    ...
```

`manifest.json`:

```json
{
  "id": "my-pack",
  "name": "My Custom Pack",
  "sounds": {
    "greeting": ["greeting_1.wav"],
    "complete": ["complete_1.wav"],
    "permission": ["permission_1.wav"],
    "error": ["error_1.wav"]
  }
}
```

Sound files can be WAV, MP3, or OGG. The extension also supports the CESP format (`openpeon.json`) used by peon-ping.

## Development

```bash
npm install
npm run watch        # rebuild on changes
# Press F5 in VS Code to launch the Extension Development Host
npm test             # run unit tests
```

## License

MIT
