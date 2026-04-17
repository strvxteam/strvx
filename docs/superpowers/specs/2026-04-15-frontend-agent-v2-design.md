# STRVX Frontend Agent v2 — Design Spec

> Date: 2026-04-15
> Status: Approved
> Author: Nicolas + Claude

## Problem

Claude Code builds UI that requires constant correction. The three recurring issues:
1. White space — pages don't fill the viewport
2. Container sizing — boxes grow with content instead of being fixed-height + scrollable
3. Box hierarchy — nesting is wrong (which box is parent, which scrolls, which is fixed)

The current agent (v1) has rules files that tell Claude Code what to do and what to avoid, but it lacks real code examples from the strvx codebase. It follows rules but doesn't know what a good strvx page actually looks like. It also can't adapt to non-strvx projects.

## Goal

"Build me a page" → it comes out right without touching it.

The agent should:
- Build complete, production-quality pages from a high-level brief ("partners page with a table")
- Plan the layout tree before writing any code
- Get the container hierarchy correct every time
- Use the right components from the right libraries
- Work for strvx projects by default, adapt to any project

## Architecture

Four layers:

### Layer 1: Pattern Library
Real layout trees, component hierarchies, and code examples extracted from Custos, strvx SIT, and Dr. Bob Nelson. This is the "how strvx builds pages" reference.

Source projects:
- `~/custos` (Custos)
- `~/Projects/strvx-internal-tool` (SIT)
- `~/drbobnelson` (Dr. Bob Nelson)

Stored in SIT database (`patterns` table) and exported into agent rules files.

### Layer 2: Rules Engine
The existing global/importable rules system. Layout rules, design tokens, corrections, component preferences. Already built in SIT.

### Layer 3: Agent Composer
The workbench in SIT where you assemble an agent from rules + patterns + component knowledge + identity. Deploy generates `.claude/rules/` files.

### Layer 4: Adaptation Layer
When used in a non-strvx project, the agent detects the project's stack (package.json, existing components) and adapts component choices. Core layout principles stay the same.

## Pattern Library — What Gets Extracted

### Page Layout Trees
The actual DOM hierarchy of each page type, annotated with WHY each level exists.

Example (SIT clients page):
```
PageShell (flex-col, h-screen)
  └─ Sidebar (fixed width 220px)
  └─ Main (flex-1, overflow-y-auto)
       └─ Header (flex, justify-between)
       │    └─ Title + subtitle
       │    └─ Action buttons
       └─ Content (flex-1)
            └─ Table container (fixed height, overflow-y-auto)
                 └─ Table header (sticky)
                 └─ Table body (scrolls)
```

### Page Archetypes
Six patterns the agent can match against:

1. **List page** (clients, components catalog) — header + filterable table/grid
2. **Detail page** (client detail) — header + sheet/panel with sections
3. **Dashboard page** (home) — header + card grid with mixed content
4. **Form page** (invoice builder) — header + multi-section form
5. **Editor page** (docs) — minimal chrome + full-viewport editor
6. **Split page** (agent workbench) — sidebar list + detail panel

### Component Compositions
How components are assembled in practice. Not just "use shadcn Table" but the full pattern:
- Table: Table + ScrollArea + sticky header + search input + filter selects + empty state + loading skeleton
- Form: Zod schema + field grid + labels + inline errors + disabled submit + loading state
- Card: bordered container + header/body/footer + optional scroll body
- Page: breadcrumb + title row (left: title, right: actions) + content area (flex-1)

### Spacing & Sizing Actuals
Real values verified across all three projects:
- Page padding, card gaps, header heights, sidebar widths, table row heights
- Border radius values per element type
- Font sizes per context
- Color values per semantic role

## Deploy Engine Output

When "Deploy" is clicked in SIT, the generated agent config contains these sections in priority order:

### 1. Identity & Behavior
- Agent persona and approach
- "Before writing any code, plan the layout tree. State the hierarchy, then build."
- "Produce the full page — server component, client component, queries, and actions."

### 2. Layout Trees
Real page archetypes with annotated DOM structures. The agent matches the user's brief to an archetype and follows that tree.

### 3. Corrections
WRONG/CORRECT pairs from the corrections database. Hard-learned rules.

### 4. Component Choices
What library to use for what, with install status. Per-project adaptation.

### 5. Design Tokens
Actual spacing, colors, typography, border radius from the codebase.

### 6. Component Compositions
Full assembly patterns for common UI elements.

### 7. Adaptation Logic
Instructions for non-strvx projects: scan package.json, detect stack, adapt component choices, keep layout principles.

## Rules File Structure

Split into focused files to manage context window budget:

- **`strvx-agent-core.md`** (~8KB) — Identity, layout trees, corrections, design tokens. Always loaded. Must stay under 8KB to avoid truncation.
- **`strvx-agent-components.md`** (~15KB trimmed) — Component reference for installed libraries only. Loaded automatically.
- **`strvx-agent-patterns.md`** (~10KB) — Page archetypes with real code examples. Loaded automatically.

Total budget: ~33KB across 3 files.

## Adaptation Layer

### What stays the same everywhere:
- Fixed-height containers with scroll
- Viewport-filling layouts, no dead white space
- Layout tree planning before coding
- Page archetypes (list, detail, dashboard, form, editor, split)
- Spacing system (24/16/8px)
- All corrections (universal frontend mistakes)

### What adapts per-project:
- Component library (detect from package.json)
- Styling approach (Tailwind vs CSS modules vs styled-components)
- File structure (Next.js App Router vs Pages vs plain React)
- Server/client split (only for Next.js App Router)

### Detection method:
Short instruction block at end of rules file: "At session start, check package.json and src/ structure. If not strvx, adapt component choices. State findings before building."

## SIT Changes

### New: Patterns page (`/skills/patterns`)
- Browse extracted patterns by archetype
- Each pattern shows: annotated layout tree, real code example, source project
- Toggle patterns on/off for agent inclusion

### New: `patterns` table
```sql
patterns (
  id UUID PK,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL, -- list|detail|dashboard|form|editor|split
  source_project TEXT NOT NULL, -- custos|sit|drbobnelson
  source_file TEXT, -- e.g. "src/app/(app)/clients/clients-table.tsx"
  layout_tree TEXT NOT NULL, -- annotated hierarchy
  code_example TEXT, -- real code snippet
  annotations JSONB, -- why each level exists
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

### Updated: Deploy engine
Generates the full 7-section config. Includes patterns, adaptation logic.

### Updated: Sidebar
Add "Patterns" link under Skills & Agents section.

## Build Order

### Phase 1: Codebase Analysis
- Build analyzer script that extracts layout trees from React/Next.js codebases
- Run on Custos, SIT, Dr. Bob Nelson
- Extract page layout trees, component compositions, spacing values
- Categorize into 6 archetypes
- Store in `patterns` table

### Phase 2: Patterns Page
- New `/skills/patterns` page
- Browse by archetype, view layout trees and code
- Toggle on/off for agent inclusion

### Phase 3: Upgraded Deploy Engine
- Generate full 7-section agent config
- Layout tree planning baked into identity
- Adaptation logic auto-generated
- Split output into 3 focused files

### Phase 4: Rules File Output
- Generate `strvx-agent-core.md` (≤8KB)
- Generate `strvx-agent-components.md` (≤15KB, installed libs only)
- Generate `strvx-agent-patterns.md` (≤10KB, real code examples)

### Phase 5: Validation
- Test agent on 3 page types from brief alone
- Verify: layout tree planned first, containers fixed-height, no white space, correct components, hierarchy correct
- Compare against real strvx pages

## Success Criteria

1. Agent builds a list page from "build me a partners page with a table" — correct layout tree, scrollable table, viewport-filling, right components
2. Agent builds a dashboard from "build me a metrics dashboard" — card grid, fills viewport, correct spacing
3. Agent builds a form page from "build me an invoice form" — Zod validation, 2-column grid, proper hierarchy
4. Agent works in a non-strvx project — detects stack, adapts components, keeps layout principles
5. No correction needed for container sizing, white space, or box hierarchy on any of the above
