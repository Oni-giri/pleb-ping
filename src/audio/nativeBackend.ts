import * as cp from "child_process";
import { AudioBackend } from "./audioBackend";

/**
 * Plays audio using OS-native commands.
 * Only works when the extension host runs on the same machine as the speakers.
 */
export class NativeBackend implements AudioBackend {
  play(filePath: string, volume: number): void {
    const platform = process.platform;
    const safeVolume = Math.max(0, Math.min(1, volume));
    const options = { timeout: 10000, windowsHide: true };

    try {
      if (platform === "darwin") {
        cp.execFile("afplay", ["-v", String(safeVolume), filePath], options);
      } else if (platform === "linux") {
        const paVolume = Math.round(safeVolume * 65536);
        cp.execFile("paplay", [`--volume=${paVolume}`, filePath], options);
      } else if (platform === "win32") {
        cp.execFile(
          "powershell",
          [
            "-NonInteractive",
            "-Command",
            `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`,
          ],
          options
        );
      }
    } catch (err) {
      console.error("Remote Peon: Native audio playback failed:", err);
    }
  }

  dispose(): void {
    // Nothing to clean up
  }
}
