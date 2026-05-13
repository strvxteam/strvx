import { z } from "zod";
import type { ToolDefinition } from "./types";

import { readThreadTool } from "./read/read-thread";
import { readEngagementTool } from "./read/read-engagement";
import { readContactTool } from "./read/read-contact";
import { searchCrmTool } from "./read/search-crm";
import { searchPastEmailsTool } from "./read/search-past-emails";
import { readRecentThreadsWithTool } from "./read/read-recent-threads-with";
import { checkCalendarTool } from "./read/check-calendar";
import { findAvailableSlotsTool } from "./read/find-available-slots";

import { proposeDraftTool } from "./write/propose-draft";
import { proposeScheduleTool } from "./write/propose-schedule";
import { logInteractionTool } from "./write/log-interaction";
import { linkThreadToEngagementTool } from "./write/link-thread-to-engagement";
import { createNextActionTool } from "./write/create-next-action";
import { scheduleFollowUpWatcherTool } from "./write/schedule-follow-up-watcher";

import { doneTool } from "./terminal/done";
import { escalateToHumanTool } from "./terminal/escalate-to-human";
import { noActionTool } from "./terminal/no-action";

/**
 * ToolDefinition is generic over its input type, which means a
 * ToolDefinition<SpecificInput> is not assignable to ToolDefinition<unknown>
 * due to function-parameter contravariance. We use ToolDefinition<never> as the
 * erasure type for the shared array and cast each tool in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToolDefinition = ToolDefinition<any, any>;

export const ALL_TOOLS: AnyToolDefinition[] = [
  // Read
  readThreadTool,
  readEngagementTool,
  readContactTool,
  searchCrmTool,
  searchPastEmailsTool,
  readRecentThreadsWithTool,
  checkCalendarTool,
  findAvailableSlotsTool,
  // Write
  proposeDraftTool,
  proposeScheduleTool,
  logInteractionTool,
  linkThreadToEngagementTool,
  createNextActionTool,
  scheduleFollowUpWatcherTool,
  // Terminal
  doneTool,
  escalateToHumanTool,
  noActionTool,
];

export function getAllTools(): AnyToolDefinition[] {
  return ALL_TOOLS;
}

/**
 * Convert our tool definitions into the shape the OpenAI Responses API expects.
 * Zod 4 ships with a native toJSONSchema() top-level export.
 */
export function buildOpenAIToolList() {
  return ALL_TOOLS.map((t: AnyToolDefinition) => {
    // Zod 4 exposes toJSONSchema as a named export on the module.
    const zMod = z as unknown as {
      toJSONSchema?: (s: z.ZodType) => Record<string, unknown>;
    };
    const schema =
      typeof zMod.toJSONSchema === "function"
        ? zMod.toJSONSchema(t.inputSchema as z.ZodType)
        : (JSON.parse(JSON.stringify(t.inputSchema)) as Record<string, unknown>);

    return {
      type: "function" as const,
      name: t.name,
      description: t.description,
      parameters: makeStrict(schema),
      strict: true,
    };
  });
}

/**
 * Recursively coerce every object node in a JSON schema to OpenAI's strict-mode
 * shape: `additionalProperties: false` plus `required: [...all property keys]`.
 * Zod 4's `toJSONSchema` omits these by default, which OpenAI rejects when
 * `strict: true` is set on a tool.
 */
export function makeStrict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(makeStrict);
  if (schema && typeof schema === "object") {
    const o = { ...(schema as Record<string, unknown>) };
    if (o.type === "object" && o.properties && typeof o.properties === "object") {
      o.additionalProperties = false;
      o.required = Object.keys(o.properties as Record<string, unknown>);
      o.properties = Object.fromEntries(
        Object.entries(o.properties as Record<string, unknown>).map(([k, v]) => [
          k,
          makeStrict(v),
        ])
      );
    }
    for (const k of Object.keys(o)) {
      if (k !== "properties" && o[k] && typeof o[k] === "object") {
        o[k] = makeStrict(o[k]);
      }
    }
    return o;
  }
  return schema;
}

export function findTool(name: string): AnyToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
