export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { engagements, invoices, tasks, taskAssignees, users, interactions, prospects, timeEntries } from "@/lib/db/schema";
import { sql, eq, and, isNull, count } from "drizzle-orm";

const TEAM_EMAILS = ["alex@strvx.com", "strvxteam@strvx.com"];

export async function GET(req: NextRequest) {
  // Protect with a secret token (call from Vercel Cron or manually)
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.WEEKLY_REPORT_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString();

  // Gather weekly metrics
  const [
    newEngagements,
    closedWon,
    closedLost,
    paidInvoicesResult,
    tasksCompleted,
    newInteractions,
    newProspects,
    hoursLogged,
    activeCount,
  ] = await Promise.all([
    // New engagements this week
    db.select({ count: count() }).from(engagements)
      .where(sql`${engagements.createdAt} >= ${weekAgoStr}`),
    // Closed won
    db.select({ count: count() }).from(engagements)
      .where(and(eq(engagements.stage, "closed_won"), sql`${engagements.stageEnteredAt} >= ${weekAgoStr}`)),
    // Closed lost
    db.select({ count: count() }).from(engagements)
      .where(and(eq(engagements.stage, "closed_lost"), sql`${engagements.stageEnteredAt} >= ${weekAgoStr}`)),
    // Revenue collected
    db.execute(sql`
      SELECT COALESCE(SUM(amount::numeric), 0) as total
      FROM invoices WHERE status = 'paid' AND paid_date >= ${weekAgo.toISOString().split("T")[0]}
    `),
    // Tasks completed
    db.select({ count: count() }).from(tasks)
      .where(sql`${tasks.completedAt} >= ${weekAgoStr}`),
    // Interactions logged
    db.select({ count: count() }).from(interactions)
      .where(sql`${interactions.createdAt} >= ${weekAgoStr}`),
    // New prospects
    db.select({ count: count() }).from(prospects)
      .where(sql`${prospects.createdAt} >= ${weekAgoStr}`),
    // Hours logged
    db.execute(sql`
      SELECT COALESCE(SUM(hours::numeric), 0) as total
      FROM time_entries WHERE date >= ${weekAgo.toISOString().split("T")[0]}
    `),
    // Active engagements
    db.select({ count: count() }).from(engagements)
      .where(and(isNull(engagements.archivedAt), sql`${engagements.stage} NOT IN ('closed_won', 'closed_lost')`)),
  ]);

  const revenue = Number((paidInvoicesResult as unknown as { total: string }[])[0]?.total ?? 0);
  const hours = Number((hoursLogged as unknown as { total: string }[])[0]?.total ?? 0);

  const metrics = {
    newEngagements: newEngagements[0]?.count ?? 0,
    closedWon: closedWon[0]?.count ?? 0,
    closedLost: closedLost[0]?.count ?? 0,
    revenue,
    tasksCompleted: tasksCompleted[0]?.count ?? 0,
    interactions: newInteractions[0]?.count ?? 0,
    newProspects: newProspects[0]?.count ?? 0,
    hoursLogged: hours,
    activeEngagements: activeCount[0]?.count ?? 0,
  };

  const weekLabel = `${weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;">
<div style="background:#fff;border-radius:12px;border:1px solid #e0e0e0;overflow:hidden;">
  <div style="padding:24px 28px;border-bottom:1px solid #f0f0f0;">
    <span style="font-size:18px;font-weight:700;color:#111;">strvx</span>
    <span style="float:right;font-size:12px;color:#888;padding-top:4px;">Weekly Report</span>
  </div>
  <div style="padding:24px 28px;">
    <p style="margin:0 0 16px;font-size:14px;color:#555;">${weekLabel}</p>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="padding:8px 0;font-size:14px;color:#555;">New Engagements</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#222;">${metrics.newEngagements}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#555;">Deals Won</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#27ae60;">${metrics.closedWon}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#555;">Deals Lost</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#c0392b;">${metrics.closedLost}</td></tr>
      <tr style="border-top:1px solid #f0f0f0;"><td style="padding:8px 0;font-size:14px;color:#555;">Revenue Collected</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#27ae60;">$${revenue.toLocaleString()}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#555;">Hours Logged</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#222;">${hours.toFixed(1)}h</td></tr>
      <tr style="border-top:1px solid #f0f0f0;"><td style="padding:8px 0;font-size:14px;color:#555;">Tasks Completed</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#222;">${metrics.tasksCompleted}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#555;">Interactions Logged</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#222;">${metrics.interactions}</td></tr>
      <tr><td style="padding:8px 0;font-size:14px;color:#555;">New Prospects</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:600;color:#222;">${metrics.newProspects}</td></tr>
      <tr style="border-top:1px solid #f0f0f0;"><td style="padding:8px 0;font-size:14px;font-weight:600;color:#222;">Active Engagements</td><td style="padding:8px 0;text-align:right;font-size:18px;font-weight:700;color:#1a73e8;">${metrics.activeEngagements}</td></tr>
    </table>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #f0f0f0;text-align:center;">
    <a href="https://app.strvx.com/dashboard" style="display:inline-block;background:#111;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Open Dashboard</a>
  </div>
</div>
</div>
</body></html>`;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ metrics, message: "RESEND_API_KEY not set, email not sent" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || "reports@strvx.com";

  await resend.emails.send({
    from: `strvx Reports <${fromEmail}>`,
    to: TEAM_EMAILS,
    subject: `strvx Weekly Report — ${weekLabel}`,
    html,
  });

  return NextResponse.json({ metrics, sent: true });
}
