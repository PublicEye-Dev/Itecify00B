import { spawn } from "node:child_process";
import process from "node:process";

export type DockerRunOpts = {
  workDirHost: string;
  image: string;
  shellScript: string;
  label: string;
  timeoutMs: number;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
};

function dockerBin(): string {
  return process.env.DOCKER_BIN ?? "docker";
}

/** Execuție doar în container; host-ul doar invocă CLI-ul Docker. */
export async function runInDocker(opts: DockerRunOpts): Promise<{ exitCode: number | null }> {
  const args = [
    "run",
    "--rm",
    "-i",
    "--network",
    "none",
    "--memory",
    process.env.RUNNER_DOCKER_MEMORY ?? "256m",
    "--cpus",
    process.env.RUNNER_DOCKER_CPUS ?? "1",
    "-v",
    `${opts.workDirHost}:/workspace:rw`,
    "-w",
    "/workspace",
    "--label",
    opts.label,
    opts.image,
    "sh",
    "-c",
    opts.shellScript,
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn(dockerBin(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error("TIMEOUT"));
    }, opts.timeoutMs);

    const onData =
      (cb: (s: string) => void) =>
      (d: Buffer): void => {
        cb(d.toString("utf8"));
      };

    child.stdout?.on("data", onData(opts.onStdout));
    child.stderr?.on("data", onData(opts.onStderr));

    child.on("error", (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ exitCode: code });
    });
  });
}
