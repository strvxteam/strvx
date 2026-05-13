import type { db as DbType } from "@strvx/db";
import type { z } from "zod";

/**
 * Shared context object passed to every tool handler. Lets tools talk to the
 * DB + know which thread/mailbox they're operating on, without each tool
 * needing to re-load it.
 */
export type ToolContext = {
  db: typeof DbType;
  mailboxId: string;
  threadId: string;
  cosRunId: string;
  // Whether the tool ended the loop. Set by terminal tools.
  terminalCalled?: boolean;
  terminalReason?: string;
};

/**
 * One agent tool. The model sees `name` + `description` + `inputSchema`; our
 * server runs `handle()` and feeds the result back as a tool_result message.
 */
export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  /** Zod schema for validation. We derive JSON Schema for OpenAI from this. */
  inputSchema: z.ZodType<TInput>;
  /** True for done/escalate/no_action — loop checks this to stop. */
  isTerminal?: boolean;
  /** Run server-side after the model emits a tool call. */
  handle: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
};

/**
 * Output the loop appends to the conversation for the model to see.
 * Always a JSON-serialisable object so the model can parse it.
 */
export type ToolResult = Record<string, unknown>;
