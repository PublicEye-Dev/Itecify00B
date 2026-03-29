import { spawn } from "node:child_process";
import process from "node:process";

export function dockerBin(): string {
  return process.env.DOCKER_BIN ?? "docker";
}

/** true = rulează, false = oprit, null = nu există / eroare inspect. */
export function dockerInspectRunning(containerName: string): Promise<boolean | null> {
  return new Promise((resolve) => {
    const child = spawn(
      dockerBin(),
      ["inspect", "-f", "{{.State.Running}}", containerName],
      { windowsHide: true },
    );
    let out = "";
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const t = out.trim();
      if (t === "true") resolve(true);
      else if (t === "false") resolve(false);
      else resolve(null);
    });
  });
}

export function dockerStart(containerName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(dockerBin(), ["start", containerName], {
      windowsHide: true,
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}
