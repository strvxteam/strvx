# Dev Sync — GitHub repos + Vercel deployments

Auto-syncs every repo in the `strvxteam` GitHub org into `dev_repos`, links
matching Vercel projects, registers their production URLs as monitored sites.
Webhook-driven; bootstrap endpoints reconcile on demand.

## Env vars

| Var | Where | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | required | Fine-grained PAT with `repo` + `admin:org_hook` scopes, org owner = strvxteam |
| `GITHUB_WEBHOOK_SECRET` | required in prod | HMAC-SHA256 secret shared with the GitHub org webhook |
| `VERCEL_TOKEN` | required | Vercel API token, team-scoped |
| `VERCEL_TEAM_ID` | optional | Set if the token isn't team-default |
| `VERCEL_WEBHOOK_SECRET` | required in prod | HMAC-SHA1 secret for `x-vercel-signature` verification |
| `GITHUB_ORG` | optional | Defaults to `strvxteam` |
| `DEV_OPS_REFRESH_SECRET` | required in prod | Protects bootstrap endpoints in prod |

## First-time bootstrap (post-deploy)

After deploy + env vars set:

```bash
curl -X POST "https://app.strvx.com/api/dev/sync-github?secret=$DEV_OPS_REFRESH_SECRET"
curl -X POST "https://app.strvx.com/api/dev/sync-vercel?secret=$DEV_OPS_REFRESH_SECRET"
```

Or click **Sync now** on `/development/repos` (dev-only, no secret required in
development).

## Webhook registration

### GitHub (org-level)

1. https://github.com/organizations/strvxteam/settings/hooks → Add webhook
2. Payload URL: `https://app.strvx.com/api/webhooks/github`
3. Content type: `application/json`
4. Secret: value of `GITHUB_WEBHOOK_SECRET`
5. SSL verify: enabled
6. Events to subscribe:
   - Repositories (created/deleted/archived/publicized/privatized/renamed/transferred)
   - Meta
   - Pushes
   - Pull requests
   - Workflow runs
   - Dependabot alerts

### Vercel (team-level)

1. https://vercel.com/account/integrations → Webhooks (or Team → Settings → Webhooks)
2. Endpoint: `https://app.strvx.com/api/webhooks/vercel`
3. Secret: value of `VERCEL_WEBHOOK_SECRET`
4. Events:
   - `deployment.created`
   - `deployment.succeeded` / `deployment.ready`
   - `deployment.error`
   - `deployment.canceled`
   - `project.created`
   - `project.removed`

## Behavior reference

| Source change | Effect |
|---|---|
| New strvxteam repo created | `repository.created` → inserted into `dev_repos` |
| Repo renamed or transferred inside strvxteam | row updated by `github_id` (stable) |
| Repo transferred out of strvxteam | row hard-deleted (cascades to PR/CI/deploy/alert caches) |
| Repo deleted on GitHub | row hard-deleted |
| Repo archived | `is_archived=true`, still tracked |
| Vercel project linked to a tracked repo | `vercel_project_id` + `vercel_production_url` + new `monitored_sites` row |
| Vercel project deleted | `vercel_project_id` cleared + `monitored_sites` row removed; `dev_repos` row stays |
| Vercel deployment state changes | `vercel_deploy_cache` upserted; visible on `/development/monitoring` tile |

## Migration

Run once before first deploy on a branch that includes schema changes:

```bash
pnpm --filter @strvx/db db:generate
pnpm --filter @strvx/db db:push   # or apply migration via preferred flow
```

New column: `dev_repos.github_id` (nullable `integer`, unique). Bootstrap
sync back-fills it on first run. Once all rows are back-filled you can
tighten to `NOT NULL` in a follow-up migration if desired.

Other new columns: `is_private`, `is_archived`, `is_fork`,
`vercel_production_url`, `monitored_site_id` (on `dev_repos`). All default
to safe values.

## Fallback & recovery

If a webhook is dropped or the queue falls behind, hit the bootstrap
endpoints — they reconcile absolute state (inserts/updates/deletes/back-fill
github_id). Safe to run any time.
