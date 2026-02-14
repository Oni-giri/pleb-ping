# Remote Peon

A VS Code extension that plays audio notifications when Claude Code (or other AI coding agents) changes state — for example, when it finishes a task or needs permission to proceed.

The key difference from existing solutions: **it works on remote machines.** Whether you're connected via VS Code Remote-SSH or running code-server in a browser, you hear the sounds locally.

## How it works

A lightweight shell hook writes a single-line event to a file whenever Claude Code fires a lifecycle event. The VS Code extension watches that file with `fs.watch` (zero CPU when idle), picks a sound from the active pack, and plays it through a hidden webview — which always renders locally, even over Remote-SSH.

```
Claude Code hook  -->  ~/.remote-peon/remote-peon.ev  -->  VS Code extension  -->  Audio (local)
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
2. **Install Claude Code hooks** — copies the hook script to `~/.claude/hooks/remote-peon.sh` and registers it in `~/.claude/settings.json` for `SessionStart`, `Notification`, and `Stop` events.

After installation, run `/hooks` in Claude Code to review and activate the hooks.

## Usage

Once installed, sounds play automatically when Claude Code:

- **Starts a session** — greeting sound
- **Needs your approval** — permission sound
- **Finishes a task** — completion sound
- **Hits an error** — error sound

### Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for:

| Command | Description |
|---|---|
| `Remote Peon: Select Sound Pack` | Switch between installed packs |
| `Remote Peon: Preview Current Pack Sounds` | Play one sound from each enabled category |
| `Remote Peon: Download More Sound Packs` | Browse and install from 36 available packs |
| `Remote Peon: Install Claude Code Hooks` | Manually (re)install hooks |
| `Remote Peon: Remove Claude Code Hooks` | Remove hooks from Claude Code config |
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
| `autoInstallHooks` | `true` | Auto-install Claude Code hooks on activation |
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
