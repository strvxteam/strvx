# Port Skills & Agents feature from `strvx-internal-tool` → `strvx` (monorepo)

**Status:** Approved for implementation
**Date:** 2026-04-16
**Source:** `strvxteam/strvx-internal-tool` branch `nick` (HEAD `d63a8b1`)
**Target:** `strvxteam/strvx` branch `nick` (HEAD `36169a2`)

## Goal

Bring the Skills & Agents system — 6 app routes (`/skills`, `/skills/agents`, `/skills/components`, `/skills/rules`, `/skills/patterns`, `/skills/corrections`) backed by 10 Postgres tables — into the monorepo so the team can work on it alongside the rest of the internal tool.

## Context

The two repos (`strvx` monorepo, `strvx-internal-tool` flat) point at the same Supabase project (`onbocejypbakvnkslwju`). The 10 feature tables (`agents`, `agent_rule_links`, `agent_runs`, `corrections`, `instance_skills`, `patterns`, `skill_component_links`, `skill_components`, `skill_libraries`, `skills`) already exist in that DB. This port is code-only — no DB mutations required.

The monorepo's nick branch has marketing/outreach features; it does **not** have the partner CRM from main. The sit nick branch's top commit is a merge combining partners with Skills & Agents — for this port we take only the Skills & Agents additions, leaving partners untouched (they live only on strvx `main`).

## File mapping

| Source (`~/sit` on `nick`) | Target (`~/strvx` on `nick`) | Strategy |
|---|---|---|
| `src/app/(app)/skills/**` (11 files) | `apps/internal/src/app/(app)/skills/**` | Clean copy — no collisions |
| Added table defs in `src/lib/db/schema.ts` | `packages/db/src/schema.ts` | Merge — shared Drizzle source of truth (apps/internal re-exports from `@strvx/db/schema`) |
| Added funcs in `src/lib/queries.ts` | `apps/internal/src/lib/queries.ts` | Diff + merge additions |
| Added zod schemas in `src/lib/validations.ts` | `apps/internal/src/lib/validations.ts` | Diff + merge additions |
| Added actions in `src/actions.ts` | `apps/internal/src/actions.ts` | Diff + merge additions |
| SKILLS & AGENTS block in `src/components/layout/sidebar.tsx` | `apps/internal/src/components/layout/sidebar.tsx` | Surgical insert — keep all existing nav entries intact |
| Modifications to `src/components/docs/doc-editor.tsx` | `apps/internal/src/components/docs/doc-editor.tsx` | Diff + merge |
| `supabase/migrations/008–011.sql` | `apps/internal/supabase/migrations/008–011.sql` | Copy for VCS record. Already applied in shared DB; never run again |
| `scripts/*.mjs` + `pattern-code-examples.json` (7 + 1 files) | monorepo-root `scripts/` | Copy. Add script entries to root `package.json` |
| `.claude/rules/strvx-components.md`, `strvx-uiux-agent.md` | monorepo-root `.claude/rules/` | Copy as-is |
| `docs/superpowers/specs/2026-04-15-frontend-agent-v2-design.md` | monorepo-root `docs/superpowers/specs/` | Copy as-is |
| `.gitignore` delta | root `.gitignore` | Diff + merge |
| Added deps in `package.json` | `apps/internal/package.json` | Add missing deps, `pnpm install` at monorepo root |

## Migration numbering

Monorepo nick has migrations `001–006`; main has `001–007_follow_up_links`. Using `008–011` on nick (matching sit's original numbering) means:
- No collision with main's `007`.
- On a future nick→main merge, history is `001–007, 008–011` — clean.

## Schema merge

`packages/db/src/schema.ts` is the single Drizzle source of truth. `apps/internal/src/lib/db/schema.ts` already `export * from "@strvx/db/schema"`. Merge every new table definition, enum, and relation from sit's local `src/lib/db/schema.ts` into `packages/db/src/schema.ts`. No import changes needed in app code.

## Sidebar integration

Read monorepo's current `apps/internal/src/components/layout/sidebar.tsx` on `nick`. Read sit's `src/components/layout/sidebar.tsx` on its `nick`. Isolate exactly the JSX block for the SKILLS & AGENTS section (6 nav items) plus any lucide-react icon imports it adds. Insert block into monorepo sidebar as a new section; preserve every existing entry (marketing, outreach, clients, etc.). No other sidebar edits.

## Commit plan

One commit per layer for reviewability/revertability:

1. `feat(db): add Skills & Agents tables to @strvx/db schema`
2. `chore(supabase): record migrations 008–011 (already applied)`
3. `feat(internal): add queries, validations, and actions for skills/agents`
4. `feat(internal): add /skills routes + client components`
5. `feat(internal): add SKILLS & AGENTS section to sidebar`
6. `chore: add seed scripts, claude rules, and design doc for skills/agents`

## Validation

1. `pnpm install` succeeds from monorepo root.
2. `pnpm -F tacoma typecheck` passes.
3. `pnpm -F tacoma dev` — hit `/skills`, `/skills/agents`, `/skills/components`, `/skills/rules`, `/skills/patterns`, `/skills/corrections`. All render; live data loads from Supabase.
4. Sidebar shows SKILLS & AGENTS section alongside every pre-existing entry.

## Out of scope

- Running seed scripts (DB already populated).
- Applying migrations against DB (already applied).
- Porting landing page or any non-feature sit code.
- Porting partner CRM from strvx `main` (separate work).
- Refactoring beyond what the port requires.

## Risks

- Shared-name files (`actions.ts`, `queries.ts`, `validations.ts`, `sidebar.tsx`, `doc-editor.tsx`) exist in both repos with divergent content. Must diff and merge — never overwrite.
- sit's `package.json` has deps not in `apps/internal`. Add only what's missing; keep monorepo versions when they're newer.
- The `@strvx/db` re-export arrangement means any sit code importing from `~/src/lib/db/schema` continues to work via apps/internal's re-export — but double-check for any path aliases that differ.
