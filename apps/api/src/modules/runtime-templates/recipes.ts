import path from "node:path";
import type { RunTemplateDto } from "@itecify/shared/runner";

export type RuntimeRecipe = {
  template: RunTemplateDto;
  requiredEntry: string;
  dockerImage: string;
  buildScript: string | null;
  runScript: string;
};

/**
 * Scripturile rulează cu `docker run … sh -c`. În imagini Debian, `sh` = `dash`, care nu suportă
 * `set -o pipefail` (Bash). Folosim `set -eu` (POSIX) pentru compatibilitate.
 */
export const RUNTIME_RECIPES: Record<RunTemplateDto, RuntimeRecipe> = {
  javascript: {
    template: "javascript",
    requiredEntry: "main.js",
    dockerImage: process.env.RUNNER_IMAGE_JS ?? "node:20-alpine",
    buildScript: null,
    runScript: `set -eu
node main.js
`,
  },
  python: {
    template: "python",
    requiredEntry: "main.py",
    dockerImage: process.env.RUNNER_IMAGE_PYTHON ?? "python:3.12-alpine",
    buildScript: null,
    runScript: `set -eu
python main.py
`,
  },
  java: {
    template: "java",
    requiredEntry: "Main.java",
    dockerImage:
      process.env.RUNNER_IMAGE_JAVA ?? "eclipse-temurin:17-jdk-jammy",
    buildScript: `set -eu
rm -rf .itecify-build
mkdir -p .itecify-build
javac -encoding UTF-8 -d .itecify-build Main.java
`,
    runScript: `set -eu
java -cp .itecify-build Main
`,
  },
  c: {
    template: "c",
    requiredEntry: "main.c",
    dockerImage: process.env.RUNNER_IMAGE_C ?? "gcc:14-bookworm",
    buildScript: `set -eu
rm -rf .itecify-build
mkdir -p .itecify-build
gcc -O2 -std=c11 -Wall -Wextra -o .itecify-build/a.out main.c
`,
    runScript: `set -eu
./.itecify-build/a.out
`,
  },
};

export function getRecipe(template: RunTemplateDto): RuntimeRecipe {
  return RUNTIME_RECIPES[template];
}

function shellQuotePosix(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function resolveJavaMainClass(
  entryPath: string,
  entrySourceText: string | null | undefined,
): string {
  const fileBaseName = path.posix.basename(entryPath, ".java");
  const pkgMatch = entrySourceText?.match(
    /^\s*package\s+([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\s*;/m,
  );
  if (!pkgMatch?.[1]) {
    return fileBaseName;
  }
  return `${pkgMatch[1]}.${fileBaseName}`;
}

export function resolveRuntimeScripts(opts: {
  template: RunTemplateDto;
  entryPath: string;
  entrySourceText?: string | null;
}): {
  buildScript: string | null;
  runScript: string;
} {
  const entryPath = opts.entryPath.split("\\").join("/");
  const quotedEntryPath = shellQuotePosix(entryPath);

  switch (opts.template) {
    case "javascript":
      return {
        buildScript: null,
        runScript: `set -eu
node ${quotedEntryPath}
`,
      };

    case "python":
      return {
        buildScript: null,
        runScript: `set -eu
python ${quotedEntryPath}
`,
      };

    case "java": {
      const mainClass = shellQuotePosix(
        resolveJavaMainClass(entryPath, opts.entrySourceText),
      );
      return {
        buildScript: `set -eu
rm -rf .itecify-build
mkdir -p .itecify-build
javac -encoding UTF-8 -d .itecify-build ${quotedEntryPath}
`,
        runScript: `set -eu
java -cp .itecify-build ${mainClass}
`,
      };
    }

    case "c":
      return {
        buildScript: `set -eu
rm -rf .itecify-build
mkdir -p .itecify-build
gcc -O2 -std=c11 -Wall -Wextra -o .itecify-build/a.out ${quotedEntryPath}
`,
        runScript: `set -eu
./.itecify-build/a.out
`,
      };
  }
}
