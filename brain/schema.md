# strvx Brain — Page Schema

Every page has two layers, separated by a `---` horizontal rule.

## Frontmatter (YAML)

```yaml
---
slug: companies/acme
type: company
source_id: 5a4d9120-31d3-42bc-b8af-2fad9f3550e7   # supabase row id
source_table: companies
source_updated_at: 2026-05-13T17:00:00Z            # supabase row updated_at
synced_at: 2026-05-13T17:05:00Z                    # when we last regenerated this page
# entity-specific fields:
name: Acme Corp
industry: SaaS
stage: active                                       # for deals
value: 75000                                        # for deals
owner: nicolas                                      # for deals
---
```

## Above the line — Compiled Truth

Always current, always rewritten.

```markdown
# {{name}}

One-paragraph executive summary. State of play.

## State
- Field: value
- Field: value

## Open Threads
- [ ] Active task / question, with [[wikilink]] to who/what
- [ ] Another one

## See Also
- [[deals/acme-pilot]] — the active engagement
- [[people/jane-doe]] — primary contact
```

## Below the line — Timeline (append-only)

```markdown
---

## Timeline

### 2026-05-13 — email
**From:** Jane Doe ([[people/jane-doe]])
**Subject:** Following up on the proposal
Snippet of the message body…

### 2026-05-10 — stage change
{{from}} → {{to}} (by {{owner}})

### 2026-05-09 — meeting
[[meetings/2026-05-09-kickoff]] with [[people/jane-doe]]
```

## Typed wikilinks

Use these typed connectors when relating entities (zero-LLM extraction picks them up):
- `works_at`, `founded`, `invested_in`, `advises`
- `owned_by`, `attended_by`, `assigned_to`, `about`
- `references`, `replies_to`, `part_of`

## Slug rules

- Lowercase, hyphenated, ASCII only.
- People: `first-last`. Companies: short name. Deals: `<company>-<deal>`.
- Stable across regenerations — derived from a deterministic function of source_id + canonical name.
