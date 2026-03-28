const USER_CURSOR_PALETTE = [
  "#e11d48",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#84cc16",
  "#06b6d4",
] as const;

/** #rrggbb stabil din userId (aceseași sesiune => aceeași culoare). */
export function stableHexColorForUserId(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return USER_CURSOR_PALETTE[h % USER_CURSOR_PALETTE.length]!;
}

/** Culoare stabilă per client Yjs (cursor remote + strip). */
export function colorForClientId(clientId: number): string {
  const hue = ((clientId % 360) + 360) % 360;
  const sat = 62 + (clientId % 3) * 6;
  const light = 52 + (clientId % 2) * 4;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** Opacitate pentru fundal selection remote (syntaxă HSL modernă). */
export function hslToRgbaBackground(hsl: string, alpha = 0.28): string {
  if (hsl.startsWith("hsl(") && hsl.endsWith(")")) {
    return hsl.replace(/\)$/, ` / ${alpha})`);
  }
  return hsl;
}
