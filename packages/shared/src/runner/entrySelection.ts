import type { RunTemplateDto } from "./schemas.js";

const RUN_TEMPLATE_DEFAULT_ENTRIES: Record<RunTemplateDto, string> = {
  javascript: "main.js",
  python: "main.py",
  java: "Main.java",
  c: "main.c",
};

const RUN_TEMPLATE_ENTRY_EXTENSIONS: Record<RunTemplateDto, readonly string[]> =
  {
    javascript: [".js", ".mjs", ".cjs"],
    python: [".py"],
    java: [".java"],
    c: [".c"],
  };

export function getDefaultRunEntryPath(template: RunTemplateDto): string {
  return RUN_TEMPLATE_DEFAULT_ENTRIES[template];
}

export function getRunEntryExtensions(
  template: RunTemplateDto,
): readonly string[] {
  return RUN_TEMPLATE_ENTRY_EXTENSIONS[template];
}

export function normalizeRunEntryPath(entryPath: string): string {
  return entryPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "");
}

export function isCompatibleRunEntryPath(
  template: RunTemplateDto,
  entryPath: string,
): boolean {
  const normalized = normalizeRunEntryPath(entryPath).toLowerCase();
  if (!normalized) {
    return false;
  }
  return RUN_TEMPLATE_ENTRY_EXTENSIONS[template].some((extension) =>
    normalized.endsWith(extension),
  );
}

export function filterCompatibleRunEntryPaths(
  template: RunTemplateDto,
  entryPaths: readonly string[],
): string[] {
  const compatible: string[] = [];
  const seen = new Set<string>();

  for (const entryPath of entryPaths) {
    const normalized = normalizeRunEntryPath(entryPath);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    if (!isCompatibleRunEntryPath(template, normalized)) {
      continue;
    }
    seen.add(normalized);
    compatible.push(normalized);
  }

  return compatible.sort((left, right) => left.localeCompare(right));
}
