# strvx Brain — Resolver

Decision tree for filing any new page. The agent walks this top-to-bottom.

## 1. Is the page about a human being?
→ `people/<slug>.md` (one page per person — team or client)
- The same person doesn't get two pages because they wear two hats. Use typed wikilinks to surface multi-role facets.
- Slug: `first-last` (lowercase, hyphenated).

## 2. Is the page about an organization (company or partner)?
→ `companies/<slug>.md`
- Includes our own clients' companies AND our channel partners.
- Slug: company short name, lowercased, hyphenated.

## 3. Is it a piece of business in motion (a deal, an engagement)?
→ `deals/<slug>.md`
- One page per engagement. Holds stage, value, owner, open threads, and the timeline of every interaction.
- Slug: `<company-slug>-<short-deal-name>`.

## 4. Is it a structured body of work that ships?
→ `projects/<slug>.md`
- One page per project. Linked from its parent deal.

## 5. Is it a single scheduled meeting?
→ `meetings/<slug>.md`
- One page per booking. Subject + attendees + notes. Meeting prep briefs are folded into frontmatter.
- Slug: `YYYY-MM-DD-<short-title>`.

## 6. Is it a financial event (invoice, expense)?
→ `finances/<slug>.md`

## 7. Can't decide?
→ `inbox/<slug>.md`
- An item in `inbox/` is a signal the schema needs to evolve. Periodically empty.

## Rules folded into entity pages (NOT separate pages)

- **Tasks** → "Open Threads" section of the deal/project the task is about. If a task is resolved, move it to the timeline.
- **Emails / email threads** → timeline entries on the contact + company + deal they touch (cross-linked).
- **Stage history** → timeline entries on the deal page.
- **Interactions** (calls, notes from CRM) → timeline entries on the deal + contact pages.

## Cross-references

Every page uses typed wikilinks for relationships:
- `[[people/alice-anderson]] works_at [[companies/acme]]`
- `[[deals/acme-pilot]] owned_by [[people/nicolas]]`
- `[[meetings/2026-05-14-kickoff]] attended_by [[people/alice-anderson]]`

## Sources

- Postgres (Supabase project `onbocejypbakvnkslwju`) is the *raw source*. The brain is **rebuilt from it** by adapters at `scripts/brain-sync/`.
- The adapter reads rows, computes compiled-truth, appends events to timelines, regenerates wikilinks.
- Markdown pages are the human-and-LLM-readable view; the PGLite index under `.gbrain/` is the retrieval cache.
