# @strvx/brain-sync

Adapter that turns the production strvx Supabase CRM into the markdown brain
at `<repo>/brain/`. Run-with-supabase-creds-on-the-input-side, no-creds-on-the-output-side.

## Run

```bash
# From the repo root:
./scripts/refresh-brain.sh              # render + import (no embeddings)
./scripts/refresh-brain.sh --embed      # + gbrain embed --stale
./scripts/refresh-brain.sh --force      # wipe generated .md files first

# Or directly (DATABASE_URL must be in env, NOT exported globally):
DATABASE_URL=<supabase-url> pnpm --filter @strvx/brain-sync sync --force
```

The package script `pnpm sync` is the bare adapter. The repo-level
`refresh-brain.sh` wrapper layers in the env-isolation gotcha plus the
gbrain re-index step.

## Architecture

```
public.companies + partners ─┐
public.contacts + users      │
public.engagements           │   render/company.ts
public.projects              │   render/person.ts        ─→ brain/people/
public.tasks                 ├─→ render/deal.ts          ─→ brain/companies/
public.bookings              │   render/project.ts       ─→ brain/deals/
public.meeting_prep_briefs   │   render/meeting.ts       ─→ brain/projects/
public.email_threads         │   render/finance.ts       ─→ brain/meetings/
public.email_messages        │                           ─→ brain/finances/
public.interactions          │
public.stage_history         │   render/transcripts.ts   ─→ brain/.sources/transcripts/
public.next_actions          │                                {meetings,emails}/*.txt
public.invoices + expenses   ─┘
```

One markdown page per real-world entity. Tasks, emails, meetings, and
stage changes fold into the timeline of the deal/person/company they
touch — they're NOT separate pages.

## Invariants

1. **DATABASE_URL must NOT be exported globally before calling gbrain.**
   When gbrain sees `DATABASE_URL` in its env it tries to connect to that
   remote Postgres instead of the local PGLite at `brain/.gbrain/`. This
   produces opaque "relation 'pages' does not exist" errors. `refresh-brain.sh`
   reads the URL explicitly per-process to avoid the leak.

2. **`--force` wipes generated `.md` files and rewrites them all.** The
   sync is idempotent: re-running without `--force` produces the same
   files (frontmatter timestamps refresh; bodies don't shift unless the
   source data changed). Files starting with `_` (e.g. `_README.md`) are
   never deleted.

3. **Slugs are derived deterministically.** `slugify("Acme Q4 platform")`
   always yields `acme-q4-platform`. Company-slug duplicates get suffixed
   with the first 6 hex chars of the row UUID. After a structural slug
   change (e.g. renaming `deal-name`), you MUST wipe
   `brain/.gbrain/brain.pglite` and re-import; gbrain doesn't purge old
   slug entries on re-import.

4. **Placeholder companies are flagged, not skipped.** Companies whose
   `name` ends with `(via Booking)` come from bookings that didn't match
   a real company row. They get `company_kind: placeholder` in
   frontmatter; SIT's `listByLabel` filters them from the default
   /kg/browse view but keeps them in the lookup so wikilinks still
   resolve.

## Tests

```bash
pnpm --filter @strvx/brain-sync test
```

Unit-tests cover the deterministic primitives: slug derivation, page
rendering (frontmatter quoting, timeline ordering), and the
brain-reader's wikilink extraction. The Postgres ↔ markdown integration
is exercised by running `refresh-brain.sh` against the staging Supabase
+ asserting the doctor output.

## Cron

```cron
# /etc/cron.d/strvx-brain — refresh every hour at :05
5 * * * * cd /Users/nicolasdossantos/strvx-kg-into-sit && ./scripts/refresh-brain.sh --force >> /tmp/brain-refresh.log 2>&1
```

A webhook/LISTEN-NOTIFY upgrade is possible but the markdown is cheap
enough to rebuild that polling is fine.
