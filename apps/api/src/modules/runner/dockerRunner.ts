import { spawn } from "node:child_process";
import process from "node:process";

export type DockerRunLimits = {
  cpus: string;
  memory: string;
};

export type DockerRunOpts = {
  workDirHost: string;
  image: string;
  command: string[];
  label: string;
  containerName: string;
  timeoutMs: number;
  limits: DockerRunLimits;
  mountMode?: "ro" | "rw";
  network?: string;
  onStdout: (chunk: string) => void;
  onStderr: (chunk: string) => void;
};

function dockerBin(): string {
  return process.env.DOCKER_BIN ?? "docker";
}

async function forceRemoveContainer(containerName: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn(dockerBin(), ["rm", "-f", containerName], {
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

/** Execuție doar în container; host-ul doar invocă CLI-ul Docker. */
export async function runInDocker(
  opts: DockerRunOpts,
): Promise<{ exitCode: number | null }> {
  const args = [
    "run",
    "--rm",
    "--name",
    opts.containerName,
    "-i",
    "--network",
    opts.network ?? "none",
    "--memory",
    opts.limits.memory,
    "--cpus",
    opts.limits.cpus,
    "-v",
    `${opts.workDirHost}:/workspace:${opts.mountMode ?? "rw"}`,
    "-w",
    "/workspace",
    "--label",
    opts.label,
    opts.image,
    ...opts.command,
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
      void forceRemoveContainer(opts.containerName).finally(() => {
        child.kill("SIGKILL");
        reject(new Error("TIMEOUT"));
      });
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
