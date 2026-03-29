import { z } from "zod";

/** Mesaje text JSON peste WebSocket (control); I/O terminal = cadre binare. */
export const terminalClientControlSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("claim_typist") }),
  z.object({ type: z.literal("release_typist") }),
  z.object({ type: z.literal("ping") }),
  /** Doar typistul; serverul difuzează textul UTF-8 tuturor clienților (ieșire partajată). */
  z.object({
    type: z.literal("operator_broadcast"),
    text: z.string().max(16_384),
  }),
  /** Doar typistul — serverul difuzează tuturor (inclusiv pentru echo linie în timp real la spectatori). */
  z.object({
    type: z.literal("line_preview"),
    text: z.string().max(4096),
  }),
  /** După Enter: linie fixată în istoric pentru spectatori (operatorul o vede deja local). */
  z.object({
    type: z.literal("command_echo"),
    line: z.string().max(4096),
  }),
]);

export type TerminalClientControlMessage = z.infer<
  typeof terminalClientControlSchema
>;

export const terminalServerControlSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("typist"),
    holderUserId: z.string().nullable(),
    holderName: z.string().nullable(),
  }),
  z.object({
    type: z.literal("status"),
    kind: z.enum(["ready", "no_container", "shell_error"]),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal("claim_result"),
    ok: z.boolean(),
    reason: z.string().optional(),
  }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("line_preview"),
    holderUserId: z.string(),
    holderName: z.string().nullable(),
    text: z.string().max(4096),
  }),
  z.object({
    type: z.literal("command_echo"),
    holderUserId: z.string(),
    holderName: z.string().nullable(),
    line: z.string().max(4096),
  }),
]);

export type TerminalServerControlMessage = z.infer<
  typeof terminalServerControlSchema
>;

export const terminalSandboxStatusSchema = z.object({
  active: z.boolean(),
  containerName: z.string().nullable().optional(),
});

export type TerminalSandboxStatusDto = z.infer<
  typeof terminalSandboxStatusSchema
>;

export const terminalEnsureSandboxResponseSchema = z.object({
  ok: z.literal(true),
  containerName: z.string(),
});

export type TerminalEnsureSandboxResponseDto = z.infer<
  typeof terminalEnsureSandboxResponseSchema
>;
