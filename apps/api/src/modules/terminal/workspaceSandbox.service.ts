import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import type { PrismaClient } from "@prisma/client";
import { HttpError } from "../auth/errors.js";
import { getRecipe } from "../runtime-templates/recipes.js";
import { materializeYjsSnapshotToDir } from "../runner/materializeWorkspace.js";
import { getSnapshotBytesForWorkspace } from "../snapshots/snapshot.service.js";
import { assertWorkspaceMember } from "../workspaces/workspace.service.js";
import { dockerBin, dockerInspectRunning, dockerStart } from "./dockerCli.js";
import { prismaTemplateToDto } from "./prismaTemplate.js";
import { registerSandbox } from "./sandboxRegistry.js";

function workDirForWorkspaceTerminal(workspaceId: string): string {
  /** `??` nu ignoră string gol din `.env`; `||` da — colegii pot lăsa `KEY=` fără valoare. */
  const base =
    process.env.TERMINAL_WORK_ROOT?.trim() ||
    process.env.RUNNER_WORK_ROOT?.trim() ||
    os.tmpdir();
  return path.join(base, "itecify-ws-terminal", workspaceId);
}

export function containerNameForWorkspace(workspaceId: string): string {
  const safe = workspaceId.replace(/[^a-zA-Z0-9_.-]/g, "-").slice(0, 120);
  return `itecify-ws-${safe}`;
}

function terminalLimits(): { cpus: string; memory: string; network: string } {
  /** `KEY=` gol în `.env` nu e nullish — fără trim/`||` Docker primește `--cpus` fără valoare. */
  return {
    cpus:
      process.env.TERMINAL_DOCKER_CPUS?.trim() ||
      process.env.RUNNER_DOCKER_CPUS?.trim() ||
      "1",
    memory:
      process.env.TERMINAL_DOCKER_MEMORY?.trim() ||
      process.env.RUNNER_DOCKER_MEMORY?.trim() ||
      "512m",
    network:
      process.env.TERMINAL_DOCKER_NETWORK?.trim() ||
      process.env.RUNNER_DOCKER_NETWORK?.trim() ||
      "bridge",
  };
}

/** Cale host pentru `-v`; pe Windows backslash-urile pot deruta CLI-ul Docker. */
function dockerBindMountSource(hostPath: string): string {
  const resolved = path.resolve(hostPath);
  if (process.platform === "win32") {
    return resolved.replace(/\\/g, "/");
  }
  return resolved;
}

/**
 * Materializează snapshot-ul din DB și pornește (sau repornește) containerul Docker
 * dedicat terminalului. Execuția comenzilor utilizatorilor rămâne doar în container.
 */
export async function ensureWorkspaceSandbox(
  prisma: PrismaClient,
  userId: string,
  workspaceId: string,
): Promise<{ containerName: string }> {
  await assertWorkspaceMember(prisma, userId, workspaceId);

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { template: true },
  });
  if (!workspace) {
    throw new HttpError(404, "Workspace inexistent.");
  }

  const recipe = getRecipe(prismaTemplateToDto(workspace.template));
  const hostDir = workDirForWorkspaceTerminal(workspaceId);
  await fs.mkdir(hostDir, { recursive: true });

  const snapshotBytes = await getSnapshotBytesForWorkspace(prisma, workspaceId);
  await materializeYjsSnapshotToDir(snapshotBytes, hostDir);

  const containerName = containerNameForWorkspace(workspaceId);
  const { cpus, memory, network } = terminalLimits();

  const running = await dockerInspectRunning(containerName);
  if (running === true) {
    registerSandbox(workspaceId, containerName);
    return { containerName };
  }

  if (running === false) {
    const started = await dockerStart(containerName);
    if (started) {
      registerSandbox(workspaceId, containerName);
      return { containerName };
    }
  }

  await dockerRunDetached({
    containerName,
    workDirHost: dockerBindMountSource(hostDir),
    image: recipe.dockerImage,
    cpus,
    memory,
    network,
    workspaceId,
  });

  registerSandbox(workspaceId, containerName);
  return { containerName };
}

type DockerRunDetachedOpts = {
  containerName: string;
  workDirHost: string;
  image: string;
  cpus: string;
  memory: string;
  network: string;
  workspaceId: string;
};

function dockerRunDetached(opts: DockerRunDetachedOpts): Promise<void> {
  const args = [
    "run",
    "-d",
    "--name",
    opts.containerName,
    "-v",
    `${opts.workDirHost}:/workspace:rw`,
    "-w",
    "/workspace",
    "--network",
    opts.network,
    "--cpus",
    opts.cpus,
    "--memory",
    opts.memory,
    "--label",
    `itecify.workspace.terminal=1`,
    "--label",
    `itecify.workspace.id=${opts.workspaceId}`,
    opts.image,
    "tail",
    "-f",
    "/dev/null",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(dockerBin(), args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let err = "";
    let out = "";
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString("utf8");
    });

    child.on("error", (e) => {
      reject(
        new Error(
          e instanceof Error
            ? `Docker: ${e.message}. Verifică că Docker Desktop rulează și că „docker” e în PATH.`
            : String(e),
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = (err.trim() || out.trim()) || null;
      reject(
        new Error(
          detail ??
            `docker run a eșuat (cod ${code ?? "?"}). Imagini: ${opts.image}`,
        ),
      );
    });
  });
}

export async function isSandboxContainerActive(
  workspaceId: string,
  containerName: string,
): Promise<boolean> {
  const running = await dockerInspectRunning(containerName);
  return running === true;
}
