# plan-thread.ts — deferred to slice 5

The `plan-thread.ts` reasoning loop (8-iteration tool-use orchestrator) ships
together with the agent tool registry in slice 5. It imports
`buildOpenAIToolList` / `findTool` / `ToolContext` from `../tools/registry` and
`../tools/types`, which do not exist yet — porting it now would break
typecheck.

What slice 5 needs to do:

1. Port `src/lib/agent/tools/` from `strvx-internal-tool` (read tools, write
   tools, terminal tools, registry, types).
2. Port `plan-thread.ts` from
   `strvx-internal-tool/src/lib/agent/reasoning/plan-thread.ts`, applying
   the same `agentRuns` → `cosRuns` rename used throughout slice 3.
3. Update the failure path to use `recordCosRunFailedBreadcrumb` once
   `apps/internal/src/trigger/_sentry.ts` lands in slice 4 (currently the
   classify / brief / prep-brief / extract-actions failure paths carry a
   `// TODO(slice-4): wire Sentry breadcrumb` marker — replace them then).
4. Port the corresponding tests (`plan-thread.test.ts`,
   `plan-thread-voice.test.ts`, `voice-samples-block.test.ts`).

Until then, `system-prompt.ts` (the stable persona text) lives here on its
own so the rest of the reasoning module can be wired in cleanly later.
