# Remote Peon

Audio notifications for AI coding agents — works over Remote-SSH and code-server.

Hear a sound when Claude Code finishes a task, needs permission, starts a session, or hits an error. Unlike terminal-based notification tools, Remote Peon works when your terminal is on a remote server with no audio device.

## How it works

```
Remote Server                          Local Machine
┌─────────────────────────────┐        ┌──────────────┐
│ Claude Code                 │        │              │
│   └── hook fires            │        │              │
│         └── remote-peon.sh  │        │              │
│               └── writes    │        │              │
│            /tmp/remote-peon.ev       │              │
│                    │        │        │              │
│ VS Code Extension  │        │        │              │
│   └── fs.watch ────┘        │        │              │
│         └── postMessage ──────────▶  Webview        │
│                             │        │  └── Audio() │
│                             │        │     🔊       │
└─────────────────────────────┘        └──────────────┘
```

1. Claude Code fires a lifecycle hook (start, stop, needs permission).
2. A shell script writes one line to `/tmp/remote-peon.ev`.
3. The extension watches that file with `fs.watch` (inotify — zero CPU when idle).
4. It picks a sound from the active pack and plays it via a hidden webview.
5. Since the webview renders locally (Electron or browser), audio comes out of your speakers.

## Installation

### From source

```bash
git clone https://github.com/Oni-giri/pleb-ping.git
cd pleb-ping
npm install
npm run compile
```

Then install the extension in VS Code:

```bash
# Package as .vsix
npx @vscode/vsce package

# Install it
code --install-extension remote-peon-0.1.0.vsix
```

### Development mode

Open the project in VS Code and press **F5** to launch the Extension Development Host with the extension loaded.

## Setup

### 1. Install a sound pack

Create a pack directory and add sound files:

```bash
mkdir -p ~/.remote-peon/packs/peon/sounds
```

Create `~/.remote-peon/packs/peon/manifest.json`:

```json
{
  "id": "peon",
  "name": "Orc Peon",
  "author": "your-name",
  "sounds": {
    "greeting": ["greeting_1.mp3"],
    "acknowledge": ["acknowledge_1.mp3"],
    "permission": ["permission_1.mp3"],
    "complete": ["complete_1.mp3"],
    "error": ["error_1.mp3"],
    "annoyed": ["annoyed_1.mp3"]
  }
}
```

Put the corresponding audio files (MP3, WAV, or OGG) in the `sounds/` subdirectory. The pack format is compatible with [peon-ping](https://github.com/tonyyont/peon-ping).

### 2. Install Claude Code hooks

The extension auto-installs hooks on activation. You can also run it manually:

**Command Palette** → `Remote Peon: Install Claude Code Hooks`

This copies the hook script to `~/.claude/hooks/remote-peon.sh` and registers it in `~/.claude/settings.json` for the `SessionStart`, `Notification`, and `Stop` events.

After installation, run `/hooks` in Claude Code to review and activate the hooks.

### 3. Test without Claude Code

You don't need Claude Code running to verify the extension works. Simulate events from any terminal:

```bash
printf '%s complete\n' "$(date +%s)000" > /tmp/remote-peon.ev.tmp && mv /tmp/remote-peon.ev.tmp /tmp/remote-peon.ev
```

Replace `complete` with `greeting`, `permission`, or `error` to test different categories.

## Sound categories

| Category | Triggered by | Default |
|---|---|---|
| `greeting` | Agent session starts | Enabled |
| `acknowledge` | Each tool use | Disabled (spammy) |
| `permission` | Agent needs your approval | Enabled |
| `complete` | Agent finishes a task | Enabled |
| `error` | Agent hits an error | Enabled |
| `annoyed` | Easter egg | Enabled |

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---|---|
| `Remote Peon: Select Sound Pack` | Switch between installed packs |
| `Remote Peon: Preview Current Pack Sounds` | Play one sound from each enabled category |
| `Remote Peon: Install Claude Code Hooks` | Install/reinstall the hook script |
| `Remote Peon: Remove Claude Code Hooks` | Uninstall hooks from Claude Code settings |
| `Remote Peon: Open Packs Directory` | Open the packs folder in your file manager |

## Settings

Configure in VS Code Settings (`Ctrl+,`) under "Remote Peon":

| Setting | Default | Description |
|---|---|---|
| `remotePeon.pack` | `"peon"` | Active sound pack ID |
| `remotePeon.packsDirectory` | `"~/.remote-peon/packs"` | Directory containing sound packs |
| `remotePeon.eventFile` | `"/tmp/remote-peon.ev"` | Event file path |
| `remotePeon.volume` | `0.7` | Playback volume (0.0–1.0) |
| `remotePeon.debounceMs` | `2000` | Min ms between sounds |
| `remotePeon.autoInstallHooks` | `true` | Auto-install hooks on activation |
| `remotePeon.showStatusBar` | `true` | Show agent state in status bar |
| `remotePeon.usePolling` | `false` | Use polling instead of inotify (for NFS/FUSE) |
| `remotePeon.pollingIntervalMs` | `500` | Polling interval when usePolling is enabled |

Per-category toggles: `remotePeon.sounds.greeting`, `remotePeon.sounds.acknowledge`, `remotePeon.sounds.permission`, `remotePeon.sounds.complete`, `remotePeon.sounds.error`, `remotePeon.sounds.annoyed`.

## Supported environments

| Environment | Extension runs on | Audio plays on |
|---|---|---|
| VS Code + Remote-SSH | Remote server | Local machine (webview) |
| code-server (browser) | Remote server | Browser tab (Web Audio) |
| VS Code local | Local machine | Local machine (native `afplay`/`paplay`) |

## Running tests

```bash
npm test
```

## License

MIT
