import type { RunTemplateDto } from "@itecify/shared/runner";

export type RuntimeRecipe = {
  template: RunTemplateDto;
  requiredEntry: string;
  dockerImage: string;
  shellScript: string;
};

export const RUNTIME_RECIPES: Record<RunTemplateDto, RuntimeRecipe> = {
  javascript: {
    template: "javascript",
    requiredEntry: "main.js",
    dockerImage: process.env.RUNNER_IMAGE_JS ?? "node:20-alpine",
    shellScript: `set -euo pipefail
node main.js
`,
  },
  python: {
    template: "python",
    requiredEntry: "main.py",
    dockerImage: process.env.RUNNER_IMAGE_PYTHON ?? "python:3.12-alpine",
    shellScript: `set -euo pipefail
python main.py
`,
  },
  java: {
    template: "java",
    requiredEntry: "Main.java",
    dockerImage: process.env.RUNNER_IMAGE_JAVA ?? "eclipse-temurin:17-jdk-jammy",
    shellScript: `set -euo pipefail
javac -encoding UTF-8 Main.java
java Main
`,
  },
  c: {
    template: "c",
    requiredEntry: "main.c",
    dockerImage: process.env.RUNNER_IMAGE_C ?? "gcc:14-bookworm",
    shellScript: `set -euo pipefail
gcc -O2 -std=c11 -Wall -Wextra -o /tmp/a.out main.c
/tmp/a.out
`,
  },
};

export function getRecipe(template: RunTemplateDto): RuntimeRecipe {
  return RUNTIME_RECIPES[template];
}
