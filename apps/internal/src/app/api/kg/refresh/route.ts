import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
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
 * Auth: when KG_MCP_API_KEY is set, requires that bearer token. Otherwise
 * the route is open — only safe behind a private network or for local dev.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env.KG_MCP_API_KEY;
  if (expected) {
    const provided = (req.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: { embed?: boolean } = {};
  try {
    body = (await req.json()) as { embed?: boolean };
  } catch {
    // empty body is fine
  }

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
