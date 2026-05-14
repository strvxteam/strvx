import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync, statSync, utimesSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import crypto from "node:crypto";
import { invalidateBrainCache } from "@/lib/kg/brain-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/kg/refresh — runs scripts/refresh-brain.sh in a child process,
 * captures stdout, and invalidates the in-memory brain cache so the next
 * read reflects the new disk state.
 *
 * Body (optional): { "embed": true } — also runs `gbrain embed --stale`.
 *
 * Doubles as the Supabase database-webhook target: Supabase fires this
 * on every row change in tracked tables, so we debounce to one real
 * refresh per DEBOUNCE_MS window. Bursts return 202 Accepted without
 * spawning a child.
 *
 * Auth: when KG_MCP_API_KEY is set, requires that bearer token. Comparison
 * is constant-time. Otherwise the route is open — only safe behind a
 * private network or for local dev.
 */

const DEBOUNCE_MS = 60_000;
const LOCK_PATH = `${tmpdir()}/strvx-kg-refresh.lock`;

function timingSafeBearerEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function shouldDebounce(): boolean {
  try {
    const st = statSync(LOCK_PATH);
    return Date.now() - st.mtimeMs < DEBOUNCE_MS;
  } catch {
    return false;
  }
}

function touchLock(): void {
  try {
    mkdirSync(tmpdir(), { recursive: true });
    const fd = openSync(LOCK_PATH, "a");
    closeSync(fd);
    const now = new Date();
    utimesSync(LOCK_PATH, now, now);
  } catch {
    // best-effort — don't fail the request if /tmp is weird
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env.KG_MCP_API_KEY;
  if (expected) {
    const provided = (req.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!timingSafeBearerEqual(provided, expected)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: { embed?: boolean } = {};
  try {
    body = (await req.json()) as { embed?: boolean };
  } catch {
    // empty body is fine — Supabase webhooks send the row payload but
    // we don't need it, we just refresh the whole brain.
  }

  if (shouldDebounce()) {
    return NextResponse.json(
      { ok: true, debounced: true, message: "refresh ran in the last 60s" },
      { status: 202 },
    );
  }
  touchLock();

  const repoRoot = resolve(process.cwd(), "..", "..");
  const script = resolve(repoRoot, "scripts", "refresh-brain.sh");
  const args = ["--force"];
  if (body.embed) args.push("--embed");

  return new Promise<NextResponse>((resolveResp) => {
    const child = spawn(script, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: string[] = [];
    const err: string[] = [];
    child.stdout.on("data", (b) => out.push(String(b)));
    child.stderr.on("data", (b) => err.push(String(b)));
    child.on("error", (e) =>
      resolveResp(
        NextResponse.json({ ok: false, error: e.message }, { status: 500 }),
      ),
    );
    child.on("exit", (code) => {
      invalidateBrainCache();
      resolveResp(
        NextResponse.json(
          {
            ok: code === 0,
            exitCode: code,
            stdout: out.join(""),
            stderr: err.join(""),
          },
          { status: code === 0 ? 200 : 500 },
        ),
      );
    });
  });
}
