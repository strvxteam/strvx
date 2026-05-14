# `no-neo4j-outside-kg`

Forbids `import 'neo4j-driver'` anywhere outside `packages/kg`. All graph access
must flow through `@strvx/kg`, which enforces trust, provenance, and audit invariants.

Wire it up in any app's `eslint.config.mjs` (see `apps/internal/eslint.config.mjs`).
