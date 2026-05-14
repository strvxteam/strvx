# people/

One page per human being. Includes:
- Strvx team members (sourced from `public.users`).
- Client and prospect contacts (sourced from `public.contacts`).
- Partner contacts when they have real signal (currently empty in `partner_contacts`).

## Does NOT go here

- Companies — they're orgs, not humans. → `companies/`
- Roles or job titles in the abstract — those are just frontmatter on a person's page.
- The same person twice — if Alice appears as both a contact AND a partner contact, she gets one page with both roles in frontmatter.

## Slug rule

`first-last` lowercased and hyphenated. Tie-break with a numeric suffix only on actual collisions (e.g., `john-smith-2`).
