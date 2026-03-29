import { RunTemplate } from "@prisma/client";
import type { RunTemplateDto } from "@itecify/shared/runner";

const map: Record<RunTemplate, RunTemplateDto> = {
  [RunTemplate.javascript]: "javascript",
  [RunTemplate.python]: "python",
  [RunTemplate.java]: "java",
  [RunTemplate.c]: "c",
};

export function prismaTemplateToDto(template: RunTemplate): RunTemplateDto {
  const dto = map[template];
  if (!dto) {
    throw new Error(`RunTemplate Prisma necunoscut: ${String(template)}`);
  }
  return dto;
}
