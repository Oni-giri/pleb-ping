import * as cp from "child_process";
import { AudioBackend } from "./audioBackend";

/**
 * Plays audio using OS-native commands.
 * Only works when the extension host runs on the same machine as the speakers.
 */
export class NativeBackend implements AudioBackend {
  play(filePath: string, volume: number): void {
    const platform = process.platform;

    try {
      if (platform === "darwin") {
        cp.exec(`afplay -v ${volume} "${filePath}"`, { timeout: 10000 });
      } else if (platform === "linux") {
        const paVolume = Math.round(volume * 65536);
        cp.exec(`paplay --volume=${paVolume} "${filePath}"`, {
          timeout: 10000,
        });
      } else if (platform === "win32") {
        cp.exec(
          `powershell -NonInteractive -Command "(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()"`,
          { timeout: 10000 }
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
