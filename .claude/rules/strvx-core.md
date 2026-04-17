# STRVX Frontend Agent — Core Rules

You are the STRVX frontend agent. You build complete, production-quality UI pages autonomously.

## Workflow (ALWAYS follow this order)

1. Match the request to a page archetype (see strvx-uiux-agent.md)
2. State the layout tree BEFORE writing any code
3. Build server component (page.tsx) + client component ("use client")
4. Server component fetches data via @/lib/queries.ts, passes as props
5. Mutations go through server actions in src/app/actions.ts (append, don't create new files)
6. Run `node scripts/lint-layout.mjs <path>` to catch violations
7. Run `node scripts/validate-layout.mjs <url>` to check visually
8. Fix any violations before delivering

## The 3 Rules That Matter Most

### 1. Fixed containers, always scroll
Containers NEVER grow with content. Set explicit height + overflowY: "auto".
```tsx
// WRONG — container grows with content
<div className="flex-1">{items.map(...)}</div>

// CORRECT — container is fixed, content scrolls
<div style={{ height: "calc(100vh - 120px)", overflowY: "auto" }}>
  {items.map(...)}
</div>
```

### 2. Fill the viewport, no dead white space
Every page fills 100% of the viewport height. No gaps below content.
- Root: flex h-screen (or calc(100vh-offset))
- Content area: flex-1 overflow-y-auto

### 3. Use inline styles for new values
Tailwind v4 JIT doesn't reliably generate new classes. Use style={{ }}.
Existing Tailwind classes already in the codebase (flex, items-center, etc.) are safe.

## Installed Libraries

| Need | Use | NOT |
|------|-----|-----|
| UI components | shadcn/ui | custom components |
| Icons | lucide-react | react-icons, heroicons |
| Charts | recharts | Tremor (not installed) |
| Editor | TipTap (@tiptap/react) | Plate.js (not installed) |
| Animation | framer-motion | Motion Primitives (not installed) |
| Toast | Sonner | react-hot-toast |

## Design Tokens

- Border radius: 6px inputs, 8px buttons, 10px cards, 12px modals
- Borders: 1px solid #e0e0e0 (standard), #f0f0f0 (subtle)
- Text: #111 primary, #555 secondary, #888 muted
- Font: 22px title, 13px body, 11px labels (uppercase), 10px badges
- Spacing: 24px sections, 16px groups, 8px tight items
- Cards: borderRadius 10, border 1px solid #e0e0e0, padding 20

## Page Header Pattern (every page)

```tsx
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
  <div>
    <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111" }}>Page Title</h1>
    <p style={{ fontSize: 13, color: "#888", marginTop: 2 }}>Subtitle</p>
  </div>
  <button style={{ /* action button */ }}>+ Action</button>
</div>
```

## For detailed patterns, corrections, and component reference:
- strvx-uiux-agent.md — Full rules + 13 layout archetypes + corrections
- strvx-components.md — 675 component reference with install status
