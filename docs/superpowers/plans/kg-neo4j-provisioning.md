# Neo4j Aura DS Provisioning Runbook

## What

Single Neo4j Aura DS instance for the strvx knowledge graph (v1, single-tenant).

## Manual provisioning steps (Nicolas, one-time)

1. Sign in to https://console.neo4j.io with the strvx Google account.
2. Create a new **AuraDS** (Data Science) instance — smallest size (1 GB).
3. Region: pick closest to the existing Supabase region.
4. Download the credentials file once. Store the connection URI in 1Password/Vault.
5. In the Aura console, create two database users:
   - `strvx_kg_rw` with role `editor` (database write access).
   - `strvx_kg_ro` with role `reader` (read-only).
   Store both passwords in 1Password/Vault.
6. Under **Network**, add to the IP allowlist:
   - Vercel egress range (look up current in Vercel dashboard).
   - Local developer static IPs (Nicolas + Alex).
   - Fly.io egress range — defer to Month 2 when `kg-ingestor` and `kg-mcp` deploy.

## Environment variables (required)

Set these in:
- Vercel project `strvx` → Production + Preview env vars.
- Fly.io secrets for `apps/kg-mcp` and `apps/kg-ingestor` (Months 2-3).
- Local `.env` for development.

| Var | Purpose |
|---|---|
| `NEO4J_URI` | Bolt URI from Aura, e.g. `neo4j+s://abc123.databases.neo4j.io` |
| `NEO4J_USER_RW` | `strvx_kg_rw` |
| `NEO4J_PASSWORD_RW` | password for RW user |
| `NEO4J_USER_RO` | `strvx_kg_ro` |
| `NEO4J_PASSWORD_RO` | password for RO user |
| `OPENAI_API_KEY` | for `text-embedding-3-small` |

## Backups

- Aura DS provides daily automatic snapshots; retention per Aura plan.
- Weekly export to `s3://strvx-backups/neo4j/` configured in Aura console under
  **Backups → S3 destination** once the bucket is provisioned.

## Smoke test

After provisioning, verify connectivity from a developer machine:

```bash
NEO4J_URI=neo4j+s://... \
NEO4J_USER_RW=strvx_kg_rw \
NEO4J_PASSWORD_RW=... \
node --input-type=module -e "
import neo4j from 'neo4j-driver';
const d = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER_RW, process.env.NEO4J_PASSWORD_RW));
const s = d.session();
const r = await s.run('RETURN 1 AS one');
console.log(r.records[0].get('one').toNumber());
await s.close(); await d.close();
"
```

Expected: prints `1`.

## Rotation

Rotate `NEO4J_PASSWORD_RW` and `NEO4J_PASSWORD_RO` quarterly. The Aura console
supports password reset without downtime; coordinate with Vercel + Fly secret
rollouts.
