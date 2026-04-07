// STRVX Internal Dashboard — Database Seed Script
// Run with: npx tsx scripts/seed.ts
// Add to package.json scripts: "db:seed": "tsx scripts/seed.ts"

import dotenv from "dotenv";
import path from "path";

// Load .env.local first (Next.js convention), then fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import * as schema from "../src/lib/db/schema";
import { db } from "../src/lib/db";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Create a .env.local or .env file.");
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

function ts(daysOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d;
}

function log(table: string, count: number) {
  console.log(`  ✓ ${table}: ${count} rows`);
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log("🌱 STRVX Database Seed\n");

  // ── 1. Clear existing data (reverse dependency order) ──
  console.log("Clearing existing data...");
  await db.delete(schema.documents);
  await db.delete(schema.goals);
  await db.delete(schema.expenses);
  await db.delete(schema.invoices);
  await db.delete(schema.tasks);
  await db.delete(schema.calendarEvents);
  await db.delete(schema.projectMembers);
  await db.delete(schema.projects);
  await db.delete(schema.nextActions);
  await db.delete(schema.interactions);
  await db.delete(schema.stageHistory);
  await db.delete(schema.engagements);
  await db.delete(schema.contacts);
  await db.delete(schema.companies);
  await db.delete(schema.users);
  console.log("  Done.\n");

  // ── 2. Users ───────────────────────────────────────────
  console.log("Seeding users...");
  const [nick, alex] = await db
    .insert(schema.users)
    .values([
      { name: "Nick", email: "nick@strvx.com" },
      { name: "Alex", email: "alex@strvx.com" },
    ])
    .returning();
  log("users", 2);

  // ── 3. Companies ───────────────────────────────────────
  console.log("Seeding companies...");
  const companiesData = [
    { name: "The Stability Group", industry: "Consulting" },
    { name: "Dr. Bob Nelson", industry: "Executive Coaching" },
    { name: "Meridian Labs", industry: "Biotech" },
    { name: "Harbor Freight Co", industry: "Logistics" },
    { name: "Prism Analytics", industry: "Data Analytics" },
    { name: "Apex Financial", industry: "Fintech" },
    { name: "Summit Retail", industry: "E-commerce" },
    { name: "Vantage Health", industry: "Healthtech" },
  ];
  const insertedCompanies = await db
    .insert(schema.companies)
    .values(companiesData)
    .returning();
  log("companies", insertedCompanies.length);

  const co = Object.fromEntries(
    insertedCompanies.map((c) => [c.name, c.id])
  ) as Record<string, string>;

  // ── 4. Contacts ────────────────────────────────────────
  console.log("Seeding contacts...");
  const contactsData = [
    {
      name: "Jesse Martinez",
      email: "jesse@stabilitygroup.com",
      phone: "+1 (415) 555-0101",
      role: "CEO",
      companyId: co["The Stability Group"],
    },
    {
      name: "Bob Nelson",
      email: "bob@drbobnelson.com",
      phone: "+1 (858) 555-0202",
      role: "Speaker / Author",
      companyId: co["Dr. Bob Nelson"],
    },
    {
      name: "Sarah Chen",
      email: "sarah.chen@meridianlabs.io",
      phone: "+1 (650) 555-0303",
      role: "Head of Research",
      companyId: co["Meridian Labs"],
    },
    {
      name: "Marcus Rivera",
      email: "marcus@harborfreight.co",
      phone: "+1 (310) 555-0404",
      role: "CTO",
      companyId: co["Harbor Freight Co"],
    },
    {
      name: "Aisha Patel",
      email: "aisha@prismanalytics.com",
      phone: "+1 (212) 555-0505",
      role: "VP Engineering",
      companyId: co["Prism Analytics"],
    },
    {
      name: "David Kim",
      email: "david.kim@apexfinancial.com",
      phone: "+1 (312) 555-0606",
      role: "COO",
      companyId: co["Apex Financial"],
    },
    {
      name: "Linda Park",
      email: "linda@summitretail.com",
      phone: "+1 (206) 555-0707",
      role: "Marketing Director",
      companyId: co["Summit Retail"],
    },
    {
      name: "Tom Williams",
      email: "tom.williams@vantagehealth.io",
      phone: "+1 (617) 555-0808",
      role: "Product Manager",
      companyId: co["Vantage Health"],
    },
  ];
  const insertedContacts = await db
    .insert(schema.contacts)
    .values(contactsData)
    .returning();
  log("contacts", insertedContacts.length);

  const ct = Object.fromEntries(
    insertedContacts.map((c) => [c.name, c.id])
  ) as Record<string, string>;

  // ── 5. Engagements ─────────────────────────────────────
  console.log("Seeding engagements...");
  const engagementsData = [
    {
      companyId: co["The Stability Group"],
      primaryContactId: ct["Jesse Martinez"],
      name: "AI Ops Dashboard",
      stage: "build" as const,
      stageEnteredAt: daysAgo(12),
      dealValue: "35000",
      expectedCloseDate: dateStr(18),
      probability: "85",
      source: "referral",
      tags: ["ai", "dashboard", "priority"],
      createdAt: daysAgo(60),
    },
    {
      companyId: co["Dr. Bob Nelson"],
      primaryContactId: ct["Bob Nelson"],
      name: "Speaker Dashboard & Website Redesign",
      stage: "build" as const,
      stageEnteredAt: daysAgo(8),
      dealValue: "28000",
      expectedCloseDate: dateStr(30),
      probability: "90",
      source: "direct",
      maintenanceOptedIn: true,
      maintenanceMonthlyFee: "1500",
      maintenanceNextCheckin: dateStr(45),
      tags: ["website", "dashboard", "content"],
      createdAt: daysAgo(45),
    },
    {
      companyId: co["Meridian Labs"],
      primaryContactId: ct["Sarah Chen"],
      name: "Research Data Pipeline",
      stage: "proposal" as const,
      stageEnteredAt: daysAgo(5),
      dealValue: "42000",
      expectedCloseDate: dateStr(25),
      probability: "60",
      source: "linkedin",
      tags: ["data", "pipeline", "ai"],
      createdAt: daysAgo(21),
    },
    {
      companyId: co["Harbor Freight Co"],
      primaryContactId: ct["Marcus Rivera"],
      name: "Fleet Tracking AI Integration",
      stage: "discovery" as const,
      stageEnteredAt: daysAgo(3),
      dealValue: "50000",
      expectedCloseDate: dateStr(60),
      probability: "35",
      source: "cold_outreach",
      tags: ["ai", "logistics", "iot"],
      createdAt: daysAgo(10),
    },
    {
      companyId: co["Prism Analytics"],
      primaryContactId: ct["Aisha Patel"],
      name: "Automated Reporting Module",
      stage: "negotiation" as const,
      stageEnteredAt: daysAgo(2),
      dealValue: "22000",
      expectedCloseDate: dateStr(14),
      probability: "75",
      source: "referral",
      tags: ["analytics", "automation"],
      createdAt: daysAgo(30),
    },
    {
      companyId: co["Apex Financial"],
      primaryContactId: ct["David Kim"],
      name: "Compliance Workflow Tool",
      stage: "closed_won" as const,
      stageEnteredAt: daysAgo(20),
      dealValue: "18000",
      expectedCloseDate: dateStr(-5),
      probability: "100",
      source: "referral",
      tags: ["fintech", "compliance"],
      createdAt: daysAgo(75),
    },
    {
      companyId: co["Summit Retail"],
      primaryContactId: ct["Linda Park"],
      name: "AI Product Recommendations Engine",
      stage: "lead" as const,
      stageEnteredAt: daysAgo(1),
      dealValue: "15000",
      expectedCloseDate: dateStr(90),
      probability: "15",
      source: "website",
      tags: ["ecommerce", "ai", "ml"],
      createdAt: daysAgo(1),
    },
    {
      companyId: co["Vantage Health"],
      primaryContactId: ct["Tom Williams"],
      name: "Patient Intake Automation",
      stage: "maintain" as const,
      stageEnteredAt: daysAgo(35),
      dealValue: "25000",
      expectedCloseDate: dateStr(-30),
      probability: "100",
      source: "direct",
      maintenanceOptedIn: true,
      maintenanceMonthlyFee: "2000",
      maintenanceNextCheckin: dateStr(10),
      tags: ["healthtech", "automation"],
      createdAt: daysAgo(90),
    },
    {
      companyId: co["The Stability Group"],
      primaryContactId: ct["Jesse Martinez"],
      name: "Internal Knowledge Base",
      stage: "closed_lost" as const,
      stageEnteredAt: daysAgo(40),
      dealValue: "12000",
      expectedCloseDate: dateStr(-35),
      probability: "0",
      source: "referral",
      tags: ["knowledge-base"],
      createdAt: daysAgo(80),
    },
    {
      companyId: co["Meridian Labs"],
      primaryContactId: ct["Sarah Chen"],
      name: "Lab Inventory Tracker",
      stage: "contacted" as const,
      stageEnteredAt: daysAgo(2),
      dealValue: "8000",
      expectedCloseDate: dateStr(45),
      probability: "20",
      source: "email",
      tags: ["biotech", "inventory"],
      createdAt: daysAgo(5),
    },
  ];
  const insertedEngagements = await db
    .insert(schema.engagements)
    .values(engagementsData)
    .returning();
  log("engagements", insertedEngagements.length);

  const eng = Object.fromEntries(
    insertedEngagements.map((e) => [e.name, e.id])
  ) as Record<string, string>;

  // ── 6. Stage History ───────────────────────────────────
  console.log("Seeding stage history...");
  const stageHistoryData = [
    // AI Ops Dashboard: lead -> contacted -> discovery -> proposal -> build
    { engagementId: eng["AI Ops Dashboard"], stage: "lead" as const, enteredAt: daysAgo(60), exitedAt: daysAgo(52) },
    { engagementId: eng["AI Ops Dashboard"], stage: "contacted" as const, enteredAt: daysAgo(52), exitedAt: daysAgo(40) },
    { engagementId: eng["AI Ops Dashboard"], stage: "discovery" as const, enteredAt: daysAgo(40), exitedAt: daysAgo(28) },
    { engagementId: eng["AI Ops Dashboard"], stage: "proposal" as const, enteredAt: daysAgo(28), exitedAt: daysAgo(12) },
    { engagementId: eng["AI Ops Dashboard"], stage: "build" as const, enteredAt: daysAgo(12) },

    // Dr. Bob Nelson: lead -> discovery -> proposal -> build
    { engagementId: eng["Speaker Dashboard & Website Redesign"], stage: "lead" as const, enteredAt: daysAgo(45), exitedAt: daysAgo(35) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], stage: "discovery" as const, enteredAt: daysAgo(35), exitedAt: daysAgo(20) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], stage: "proposal" as const, enteredAt: daysAgo(20), exitedAt: daysAgo(8) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], stage: "build" as const, enteredAt: daysAgo(8) },

    // Meridian Labs Research: lead -> contacted -> discovery -> proposal
    { engagementId: eng["Research Data Pipeline"], stage: "lead" as const, enteredAt: daysAgo(21), exitedAt: daysAgo(16) },
    { engagementId: eng["Research Data Pipeline"], stage: "contacted" as const, enteredAt: daysAgo(16), exitedAt: daysAgo(10) },
    { engagementId: eng["Research Data Pipeline"], stage: "discovery" as const, enteredAt: daysAgo(10), exitedAt: daysAgo(5) },
    { engagementId: eng["Research Data Pipeline"], stage: "proposal" as const, enteredAt: daysAgo(5) },

    // Harbor Freight: lead -> contacted -> discovery
    { engagementId: eng["Fleet Tracking AI Integration"], stage: "lead" as const, enteredAt: daysAgo(10), exitedAt: daysAgo(7) },
    { engagementId: eng["Fleet Tracking AI Integration"], stage: "contacted" as const, enteredAt: daysAgo(7), exitedAt: daysAgo(3) },
    { engagementId: eng["Fleet Tracking AI Integration"], stage: "discovery" as const, enteredAt: daysAgo(3) },

    // Prism Analytics: lead -> contacted -> discovery -> proposal -> negotiation
    { engagementId: eng["Automated Reporting Module"], stage: "lead" as const, enteredAt: daysAgo(30), exitedAt: daysAgo(25) },
    { engagementId: eng["Automated Reporting Module"], stage: "contacted" as const, enteredAt: daysAgo(25), exitedAt: daysAgo(18) },
    { engagementId: eng["Automated Reporting Module"], stage: "discovery" as const, enteredAt: daysAgo(18), exitedAt: daysAgo(10) },
    { engagementId: eng["Automated Reporting Module"], stage: "proposal" as const, enteredAt: daysAgo(10), exitedAt: daysAgo(2) },
    { engagementId: eng["Automated Reporting Module"], stage: "negotiation" as const, enteredAt: daysAgo(2) },

    // Apex Financial: lead -> discovery -> proposal -> negotiation -> closed_won
    { engagementId: eng["Compliance Workflow Tool"], stage: "lead" as const, enteredAt: daysAgo(75), exitedAt: daysAgo(65) },
    { engagementId: eng["Compliance Workflow Tool"], stage: "discovery" as const, enteredAt: daysAgo(65), exitedAt: daysAgo(50) },
    { engagementId: eng["Compliance Workflow Tool"], stage: "proposal" as const, enteredAt: daysAgo(50), exitedAt: daysAgo(35) },
    { engagementId: eng["Compliance Workflow Tool"], stage: "negotiation" as const, enteredAt: daysAgo(35), exitedAt: daysAgo(20) },
    { engagementId: eng["Compliance Workflow Tool"], stage: "closed_won" as const, enteredAt: daysAgo(20) },

    // Vantage Health: lead -> build -> deliver -> maintain
    { engagementId: eng["Patient Intake Automation"], stage: "lead" as const, enteredAt: daysAgo(90), exitedAt: daysAgo(80) },
    { engagementId: eng["Patient Intake Automation"], stage: "build" as const, enteredAt: daysAgo(80), exitedAt: daysAgo(55) },
    { engagementId: eng["Patient Intake Automation"], stage: "deliver" as const, enteredAt: daysAgo(55), exitedAt: daysAgo(35) },
    { engagementId: eng["Patient Intake Automation"], stage: "maintain" as const, enteredAt: daysAgo(35) },

    // Internal Knowledge Base: lead -> contacted -> discovery -> proposal -> closed_lost
    { engagementId: eng["Internal Knowledge Base"], stage: "lead" as const, enteredAt: daysAgo(80), exitedAt: daysAgo(70) },
    { engagementId: eng["Internal Knowledge Base"], stage: "contacted" as const, enteredAt: daysAgo(70), exitedAt: daysAgo(60) },
    { engagementId: eng["Internal Knowledge Base"], stage: "discovery" as const, enteredAt: daysAgo(60), exitedAt: daysAgo(50) },
    { engagementId: eng["Internal Knowledge Base"], stage: "proposal" as const, enteredAt: daysAgo(50), exitedAt: daysAgo(40) },
    { engagementId: eng["Internal Knowledge Base"], stage: "closed_lost" as const, enteredAt: daysAgo(40) },

    // Summit Retail: lead (just entered)
    { engagementId: eng["AI Product Recommendations Engine"], stage: "lead" as const, enteredAt: daysAgo(1) },

    // Lab Inventory Tracker: lead -> contacted
    { engagementId: eng["Lab Inventory Tracker"], stage: "lead" as const, enteredAt: daysAgo(5), exitedAt: daysAgo(2) },
    { engagementId: eng["Lab Inventory Tracker"], stage: "contacted" as const, enteredAt: daysAgo(2) },
  ];
  const insertedStageHistory = await db
    .insert(schema.stageHistory)
    .values(stageHistoryData)
    .returning();
  log("stage_history", insertedStageHistory.length);

  // ── 7. Interactions ────────────────────────────────────
  console.log("Seeding interactions...");
  const interactionsData = [
    // AI Ops Dashboard interactions
    { engagementId: eng["AI Ops Dashboard"], authorId: nick.id, type: "note" as const, content: "Initial intro call with Jesse. They need a centralized dashboard for their AI operations across 3 departments. Currently using spreadsheets and Notion. Pain point is visibility into model performance and cost tracking.", createdAt: daysAgo(58) },
    { engagementId: eng["AI Ops Dashboard"], authorId: nick.id, type: "meeting" as const, content: "Discovery deep-dive: walked through their current workflow. They have 12 AI models in production across customer support, HR screening, and document processing. Main ask is real-time cost monitoring and performance alerts.", scheduledAt: daysAgo(38), createdAt: daysAgo(38) },
    { engagementId: eng["AI Ops Dashboard"], authorId: nick.id, type: "note" as const, content: "Technical assessment complete. Their infra is AWS-based, models deployed on SageMaker. We can pull CloudWatch metrics + cost explorer data via APIs. Estimated 3-week build for v1.", createdAt: daysAgo(35) },
    { engagementId: eng["AI Ops Dashboard"], authorId: nick.id, type: "stage_change" as const, content: "Moved to proposal stage. Sent SOW with $35K fixed-price quote for dashboard + 3 months maintenance.", createdAt: daysAgo(28) },
    { engagementId: eng["AI Ops Dashboard"], authorId: nick.id, type: "meeting" as const, content: "Proposal walkthrough with Jesse and their VP of Engineering. They want to add anomaly detection to the monitoring — added as phase 2 scope. Verbal approval received.", scheduledAt: daysAgo(18), createdAt: daysAgo(18) },
    { engagementId: eng["AI Ops Dashboard"], authorId: nick.id, type: "stage_change" as const, content: "Contract signed. Moving to build. Kickoff scheduled for Monday.", createdAt: daysAgo(12) },
    { engagementId: eng["AI Ops Dashboard"], authorId: alex.id, type: "note" as const, content: "Sprint 1 complete: auth, base layout, and data ingestion pipeline from CloudWatch are working. Demo to client went well — Jesse wants a Slack integration for alerts.", createdAt: daysAgo(5) },

    // Dr. Bob Nelson interactions
    { engagementId: eng["Speaker Dashboard & Website Redesign"], authorId: nick.id, type: "note" as const, content: "Bob reached out directly — needs a complete digital presence overhaul. Current site is a decade-old WordPress. Wants a modern dashboard to manage speaking engagements, track book sales, and collect testimonials.", createdAt: daysAgo(44) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], authorId: nick.id, type: "meeting" as const, content: "Discovery session with Bob. He has 200+ speaking engagements per year. Needs calendar management, automated follow-up emails, and a media kit page. Budget is flexible for the right solution.", scheduledAt: daysAgo(33), createdAt: daysAgo(33) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], authorId: nick.id, type: "stage_change" as const, content: "Sent proposal: $28K for website redesign + speaker dashboard. Includes $1,500/mo maintenance with content updates.", createdAt: daysAgo(20) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], authorId: nick.id, type: "meeting" as const, content: "Bob approved the proposal with minor tweaks — wants the testimonial carousel to support video. Added to scope at no extra cost since it's straightforward.", scheduledAt: daysAgo(10), createdAt: daysAgo(10) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], authorId: nick.id, type: "stage_change" as const, content: "Moving to build. Alex taking lead on frontend, Nick on the CMS integration.", createdAt: daysAgo(8) },
    { engagementId: eng["Speaker Dashboard & Website Redesign"], authorId: alex.id, type: "note" as const, content: "Homepage and about page mockups approved by Bob. Using Next.js with a headless CMS (Sanity). Design language is clean, authoritative — inspired by Simon Sinek's site.", createdAt: daysAgo(3) },

    // Research Data Pipeline interactions
    { engagementId: eng["Research Data Pipeline"], authorId: nick.id, type: "note" as const, content: "Inbound from LinkedIn — Sarah saw our post about AI data pipelines. Meridian Labs is a Series B biotech running genomics research. They need to automate their data cleaning and annotation workflow.", createdAt: daysAgo(20) },
    { engagementId: eng["Research Data Pipeline"], authorId: nick.id, type: "meeting" as const, content: "Intro call with Sarah. They process ~2TB of genomics data weekly. Current pipeline is a mess of Python scripts and manual QC steps. She wants an automated pipeline with validation gates and audit logging.", scheduledAt: daysAgo(15), createdAt: daysAgo(15) },
    { engagementId: eng["Research Data Pipeline"], authorId: nick.id, type: "note" as const, content: "Reviewed their codebase. They use AWS Batch for compute, S3 for storage. Pipeline orchestration with Airflow but it's barely maintained. We could rebuild on Step Functions + Lambda with proper monitoring.", createdAt: daysAgo(12) },
    { engagementId: eng["Research Data Pipeline"], authorId: nick.id, type: "meeting" as const, content: "Technical deep-dive with Sarah and their bioinformatics lead. Agreed on Step Functions approach. They need HIPAA compliance since some data links to patient records. Adjusting scope and pricing.", scheduledAt: daysAgo(8), createdAt: daysAgo(8) },
    { engagementId: eng["Research Data Pipeline"], authorId: nick.id, type: "stage_change" as const, content: "Proposal sent. $42K for HIPAA-compliant data pipeline with monitoring dashboard. Includes compliance documentation and audit trail.", createdAt: daysAgo(5) },
    { engagementId: eng["Research Data Pipeline"], authorId: nick.id, type: "note" as const, content: "Sarah says the proposal is with their CFO for budget approval. Expects decision by end of week. She's pushing hard internally.", createdAt: daysAgo(2) },

    // Harbor Freight interactions
    { engagementId: eng["Fleet Tracking AI Integration"], authorId: nick.id, type: "note" as const, content: "Cold outreach to Marcus paid off. Harbor Freight runs 400+ delivery trucks and wants predictive maintenance + route optimization. Huge potential deal.", createdAt: daysAgo(9) },
    { engagementId: eng["Fleet Tracking AI Integration"], authorId: nick.id, type: "meeting" as const, content: "First call with Marcus. They're using Samsara for GPS tracking but want AI-powered route optimization and predictive maintenance alerts. Currently losing $200K/year on unplanned breakdowns.", scheduledAt: daysAgo(5), createdAt: daysAgo(5) },
    { engagementId: eng["Fleet Tracking AI Integration"], authorId: nick.id, type: "stage_change" as const, content: "Moved to discovery. Scheduling a technical assessment of their Samsara API and fleet data.", createdAt: daysAgo(3) },

    // Prism Analytics interactions
    { engagementId: eng["Automated Reporting Module"], authorId: nick.id, type: "note" as const, content: "Referral from Jesse at Stability Group. Aisha needs automated client-facing reports. Currently their analysts spend 15 hours/week generating PDF reports manually.", createdAt: daysAgo(29) },
    { engagementId: eng["Automated Reporting Module"], authorId: nick.id, type: "meeting" as const, content: "Discovery call with Aisha. They need templated reports that pull from their Snowflake warehouse, apply client-specific branding, and auto-distribute via email. Want AI-generated executive summaries.", scheduledAt: daysAgo(16), createdAt: daysAgo(16) },
    { engagementId: eng["Automated Reporting Module"], authorId: nick.id, type: "note" as const, content: "Scoped the tech: Snowflake connector -> report template engine (React PDF) -> AI summary via Claude -> email distribution via SendGrid. Clean architecture, 2-week build.", createdAt: daysAgo(13) },
    { engagementId: eng["Automated Reporting Module"], authorId: nick.id, type: "stage_change" as const, content: "Sent proposal at $22K. Includes report template builder, AI summaries, and automated distribution.", createdAt: daysAgo(10) },
    { engagementId: eng["Automated Reporting Module"], authorId: nick.id, type: "meeting" as const, content: "Negotiation call with Aisha and their CFO. They want to bring it down to $18K. Countered at $20K with 2 months of included support instead of 1. Waiting on response.", scheduledAt: daysAgo(2), createdAt: daysAgo(2) },
    { engagementId: eng["Automated Reporting Module"], authorId: nick.id, type: "stage_change" as const, content: "Moved to negotiation. They're reviewing our counter-offer.", createdAt: daysAgo(2) },

    // Apex Financial interactions
    { engagementId: eng["Compliance Workflow Tool"], authorId: nick.id, type: "meeting" as const, content: "Final delivery walkthrough with David. All compliance workflows are automated, audit trail is complete, and they're seeing 70% reduction in manual compliance tasks.", scheduledAt: daysAgo(22), createdAt: daysAgo(22) },
    { engagementId: eng["Compliance Workflow Tool"], authorId: nick.id, type: "stage_change" as const, content: "Closed won. Payment received. David is extremely happy — already discussing a phase 2 for their risk assessment module.", createdAt: daysAgo(20) },
    { engagementId: eng["Compliance Workflow Tool"], authorId: nick.id, type: "note" as const, content: "David referred us to two other fintech companies. Need to follow up with them next week.", createdAt: daysAgo(15) },

    // Summit Retail interactions
    { engagementId: eng["AI Product Recommendations Engine"], authorId: nick.id, type: "note" as const, content: "Inbound from website contact form. Linda is looking for an AI recommendation engine for their Shopify Plus store. ~50K SKUs, 200K monthly visitors. Currently using Shopify's basic recommendations.", createdAt: daysAgo(1) },

    // Vantage Health interactions
    { engagementId: eng["Patient Intake Automation"], authorId: nick.id, type: "note" as const, content: "Monthly maintenance check-in: system running smoothly. Processed 4,200 patient intakes this month with 99.7% accuracy. Fixed a minor timezone bug in the PDF generation.", createdAt: daysAgo(5) },
    { engagementId: eng["Patient Intake Automation"], authorId: nick.id, type: "meeting" as const, content: "Quarterly review with Tom. They want to add insurance verification automation — could be a significant expansion. Scheduling a discovery call for the add-on.", scheduledAt: daysAgo(10), createdAt: daysAgo(10) },

    // Internal Knowledge Base (closed_lost)
    { engagementId: eng["Internal Knowledge Base"], authorId: nick.id, type: "note" as const, content: "Jesse mentioned they decided to go with Notion AI for their internal knowledge base. Budget constraints — the $12K was too much for an internal tool vs. a $15/user SaaS. No hard feelings, they're still proceeding with the AI Ops Dashboard.", createdAt: daysAgo(40) },
    { engagementId: eng["Internal Knowledge Base"], authorId: nick.id, type: "stage_change" as const, content: "Closed lost. Client chose Notion AI. Maintaining good relationship through the dashboard engagement.", createdAt: daysAgo(40) },

    // Lab Inventory Tracker interactions
    { engagementId: eng["Lab Inventory Tracker"], authorId: nick.id, type: "note" as const, content: "Sarah mentioned this as a secondary need during our pipeline discussions. Their lab inventory tracking is all Excel-based. Quick win — could be a simple CRUD app.", createdAt: daysAgo(4) },
    { engagementId: eng["Lab Inventory Tracker"], authorId: nick.id, type: "stage_change" as const, content: "Sent initial outreach email with some ideas. Low priority but easy revenue if we can bundle with the pipeline deal.", createdAt: daysAgo(2) },
  ];
  const insertedInteractions = await db
    .insert(schema.interactions)
    .values(interactionsData)
    .returning();
  log("interactions", insertedInteractions.length);

  // ── 8. Next Actions ────────────────────────────────────
  console.log("Seeding next actions...");
  const nextActionsData = [
    {
      engagementId: eng["AI Ops Dashboard"],
      ownerId: alex.id,
      description: "Complete Sprint 2: Slack alert integration and cost breakdown charts",
      priority: "high" as const,
      dueDate: dateStr(5),
    },
    {
      engagementId: eng["AI Ops Dashboard"],
      ownerId: nick.id,
      description: "Set up anomaly detection model training pipeline for phase 2",
      priority: "normal" as const,
      dueDate: dateStr(14),
    },
    {
      engagementId: eng["Speaker Dashboard & Website Redesign"],
      ownerId: alex.id,
      description: "Finish responsive design for speaking engagements calendar view",
      priority: "high" as const,
      dueDate: dateStr(3),
    },
    {
      engagementId: eng["Speaker Dashboard & Website Redesign"],
      ownerId: nick.id,
      description: "Integrate Sanity CMS for blog and testimonials content management",
      priority: "normal" as const,
      dueDate: dateStr(7),
    },
    {
      engagementId: eng["Research Data Pipeline"],
      ownerId: nick.id,
      description: "Follow up with Sarah on CFO budget approval status",
      priority: "urgent" as const,
      dueDate: dateStr(0),
    },
    {
      engagementId: eng["Fleet Tracking AI Integration"],
      ownerId: nick.id,
      description: "Schedule technical assessment call with Marcus and their fleet ops team",
      priority: "high" as const,
      dueDate: dateStr(2),
    },
    {
      engagementId: eng["Fleet Tracking AI Integration"],
      ownerId: nick.id,
      description: "Research Samsara API capabilities and rate limits",
      priority: "normal" as const,
      dueDate: dateStr(5),
    },
    {
      engagementId: eng["Automated Reporting Module"],
      ownerId: nick.id,
      description: "Send final counter-offer email to Aisha with revised payment terms",
      priority: "urgent" as const,
      dueDate: dateStr(-1),
    },
    {
      engagementId: eng["AI Product Recommendations Engine"],
      ownerId: nick.id,
      description: "Research Linda's Shopify Plus setup and prepare discovery questions",
      priority: "normal" as const,
      dueDate: dateStr(3),
    },
    {
      engagementId: eng["Patient Intake Automation"],
      ownerId: nick.id,
      description: "Prepare insurance verification add-on proposal for Tom",
      priority: "normal" as const,
      dueDate: dateStr(10),
    },
    {
      engagementId: eng["Compliance Workflow Tool"],
      ownerId: nick.id,
      description: "Follow up on David's fintech referrals — reach out to both contacts",
      priority: "high" as const,
      dueDate: dateStr(-3),
    },
    {
      engagementId: eng["Lab Inventory Tracker"],
      ownerId: nick.id,
      description: "Draft bundled pricing proposal for pipeline + inventory tracker",
      priority: "low" as const,
      dueDate: dateStr(14),
    },
    {
      engagementId: eng["AI Ops Dashboard"],
      ownerId: nick.id,
      description: "Send Sprint 1 demo recording to Jesse for internal distribution",
      priority: "low" as const,
      dueDate: dateStr(-2),
      completed: true,
      completedAt: daysAgo(4),
    },
    {
      engagementId: eng["Speaker Dashboard & Website Redesign"],
      ownerId: nick.id,
      description: "Get Bob's brand guidelines and headshot photos for the new site",
      priority: "normal" as const,
      dueDate: dateStr(-5),
      completed: true,
      completedAt: daysAgo(6),
    },
  ];
  const insertedNextActions = await db
    .insert(schema.nextActions)
    .values(nextActionsData)
    .returning();
  log("next_actions", insertedNextActions.length);

  // ── 9. Industries ──────────────────────────────────────

  // ── 10. Projects ───────────────────────────────────────
  console.log("Seeding projects...");
  const projectsData = [
    {
      name: "AI Ops Dashboard — v1",
      description: "Real-time AI operations dashboard with cost monitoring, performance tracking, and Slack alerts for The Stability Group.",
      status: "in_progress",
      client: "The Stability Group",
      engagementId: eng["AI Ops Dashboard"],
      startDate: dateStr(-12),
      endDate: dateStr(18),
      team: ["Nick", "Alex"],
    },
    {
      name: "Dr. Bob Nelson — Website & Dashboard",
      description: "Modern website redesign and speaker engagement management dashboard for Dr. Bob Nelson. Next.js + Sanity CMS.",
      status: "in_progress",
      client: "Dr. Bob Nelson",
      engagementId: eng["Speaker Dashboard & Website Redesign"],
      startDate: dateStr(-8),
      endDate: dateStr(30),
      team: ["Nick", "Alex"],
    },
    {
      name: "Apex Compliance Tool — Maintenance",
      description: "Post-delivery maintenance and support for Apex Financial's compliance workflow automation tool.",
      status: "active",
      client: "Apex Financial",
      engagementId: eng["Compliance Workflow Tool"],
      startDate: dateStr(-20),
      endDate: dateStr(70),
      team: ["Nick"],
    },
    {
      name: "Vantage Patient Intake — Maintenance",
      description: "Ongoing maintenance for Vantage Health's patient intake automation system. Monthly check-ins and bug fixes.",
      status: "active",
      client: "Vantage Health",
      engagementId: eng["Patient Intake Automation"],
      startDate: dateStr(-35),
      endDate: dateStr(330),
      team: ["Nick"],
    },
    {
      name: "STRVX Internal Dashboard",
      description: "Internal CRM and operations dashboard for tracking engagements, pipeline, tasks, and financials.",
      status: "in_progress",
      client: "Internal",
      startDate: dateStr(-30),
      team: ["Nick", "Alex"],
    },
  ];
  const insertedProjects = await db
    .insert(schema.projects)
    .values(projectsData)
    .returning();
  log("projects", insertedProjects.length);

  const proj = Object.fromEntries(
    insertedProjects.map((p) => [p.name, p.id])
  ) as Record<string, string>;

  // Project members
  const projectMembersData = [
    { projectId: proj["AI Ops Dashboard — v1"], userId: nick.id, role: "lead" },
    { projectId: proj["AI Ops Dashboard — v1"], userId: alex.id, role: "engineer" },
    { projectId: proj["AI Ops Dashboard — v1"], userId: nick.id, role: "engineer" },
    { projectId: proj["Dr. Bob Nelson — Website & Dashboard"], userId: nick.id, role: "lead" },
    { projectId: proj["Dr. Bob Nelson — Website & Dashboard"], userId: alex.id, role: "engineer" },
    { projectId: proj["Dr. Bob Nelson — Website & Dashboard"], userId: nick.id, role: "engineer" },
    { projectId: proj["Apex Compliance Tool — Maintenance"], userId: nick.id, role: "lead" },
    { projectId: proj["Vantage Patient Intake — Maintenance"], userId: nick.id, role: "lead" },
    { projectId: proj["STRVX Internal Dashboard"], userId: nick.id, role: "lead" },
    { projectId: proj["STRVX Internal Dashboard"], userId: alex.id, role: "engineer" },
  ];
  const insertedMembers = await db
    .insert(schema.projectMembers)
    .values(projectMembersData)
    .returning();
  log("project_members", insertedMembers.length);

  // ── 13. Calendar Events ────────────────────────────────
  console.log("Seeding calendar events...");
  const calendarEventsData = [
    {
      title: "Sprint Review — AI Ops Dashboard",
      type: "client_call",
      date: dateStr(1),
      startHour: "10",
      durationHours: "1",
      client: "The Stability Group",
      zoomLink: "https://zoom.us/j/123456789",
      engagementId: eng["AI Ops Dashboard"],
      projectId: proj["AI Ops Dashboard — v1"],
      createdBy: nick.id,
    },
    {
      title: "Bob Nelson — Content Review",
      type: "client_call",
      date: dateStr(3),
      startHour: "14",
      durationHours: "0.5",
      client: "Dr. Bob Nelson",
      zoomLink: "https://zoom.us/j/987654321",
      engagementId: eng["Speaker Dashboard & Website Redesign"],
      projectId: proj["Dr. Bob Nelson — Website & Dashboard"],
      createdBy: nick.id,
    },
    {
      title: "Meridian Labs — Proposal Follow-up",
      type: "client_call",
      date: dateStr(2),
      startHour: "11",
      durationHours: "0.5",
      client: "Meridian Labs",
      engagementId: eng["Research Data Pipeline"],
      createdBy: nick.id,
    },
    {
      title: "Harbor Freight — Technical Assessment",
      type: "client_call",
      date: dateStr(5),
      startHour: "15",
      durationHours: "1",
      client: "Harbor Freight Co",
      zoomLink: "https://zoom.us/j/456789123",
      engagementId: eng["Fleet Tracking AI Integration"],
      createdBy: nick.id,
    },
    {
      title: "Team Standup",
      type: "internal",
      date: dateStr(0),
      startHour: "9",
      durationHours: "0.25",
      createdBy: nick.id,
    },
    {
      title: "Weekly Pipeline Review",
      type: "internal",
      date: dateStr(1),
      startHour: "16",
      durationHours: "0.5",
      createdBy: nick.id,
    },
    {
      title: "Vantage Health — Quarterly Review",
      type: "client_call",
      date: dateStr(8),
      startHour: "13",
      durationHours: "1",
      client: "Vantage Health",
      engagementId: eng["Patient Intake Automation"],
      projectId: proj["Vantage Patient Intake — Maintenance"],
      createdBy: nick.id,
    },
    {
      title: "Prism Analytics — Counter-offer Discussion",
      type: "client_call",
      date: dateStr(1),
      startHour: "11",
      durationHours: "0.5",
      client: "Prism Analytics",
      engagementId: eng["Automated Reporting Module"],
      createdBy: nick.id,
    },
    {
      title: "Content Planning — LinkedIn & Twitter",
      type: "internal",
      date: dateStr(4),
      startHour: "10",
      durationHours: "1",
      createdBy: nick.id,
    },
    {
      title: "SOW Deadline — Meridian Pipeline",
      type: "deadline",
      date: dateStr(7),
      startHour: "17",
      durationHours: "0",
      client: "Meridian Labs",
      engagementId: eng["Research Data Pipeline"],
      createdBy: nick.id,
    },
  ];
  const insertedEvents = await db
    .insert(schema.calendarEvents)
    .values(calendarEventsData)
    .returning();
  log("calendar_events", insertedEvents.length);

  // ── 14. Tasks ──────────────────────────────────────────
  console.log("Seeding tasks...");
  const tasksData = [
    // AI Ops Dashboard tasks
    { title: "Implement Slack webhook integration for alerts", description: "Connect to Slack API, allow users to configure alert channels and thresholds.", status: "in_progress", priority: "high", assigneeId: alex.id, engagementId: eng["AI Ops Dashboard"], projectId: proj["AI Ops Dashboard — v1"], dueDate: dateStr(4) },
    { title: "Build cost breakdown chart component", description: "Recharts bar chart showing daily/weekly/monthly AI costs by model and department.", status: "todo", priority: "high", assigneeId: alex.id, engagementId: eng["AI Ops Dashboard"], projectId: proj["AI Ops Dashboard — v1"], dueDate: dateStr(6) },
    { title: "Set up CloudWatch metrics ingestion cron", description: "Lambda function running every 5 minutes to pull CloudWatch metrics into our DB.", status: "done", priority: "high", assigneeId: nick.id, engagementId: eng["AI Ops Dashboard"], projectId: proj["AI Ops Dashboard — v1"], dueDate: dateStr(-3), completedAt: daysAgo(5) },
    { title: "Design anomaly detection data model", description: "Schema for storing anomaly scores, thresholds, and alert history for phase 2.", status: "todo", priority: "normal", assigneeId: nick.id, engagementId: eng["AI Ops Dashboard"], projectId: proj["AI Ops Dashboard — v1"], dueDate: dateStr(12) },

    // Dr. Bob Nelson tasks
    { title: "Build testimonials carousel with video support", description: "Swipeable carousel supporting both text and embedded video testimonials.", status: "in_progress", priority: "high", assigneeId: alex.id, engagementId: eng["Speaker Dashboard & Website Redesign"], projectId: proj["Dr. Bob Nelson — Website & Dashboard"], dueDate: dateStr(5) },
    { title: "Integrate Sanity CMS for blog content", description: "Set up Sanity studio, configure schemas for blog posts, and build preview/publish workflow.", status: "todo", priority: "normal", assigneeId: nick.id, engagementId: eng["Speaker Dashboard & Website Redesign"], projectId: proj["Dr. Bob Nelson — Website & Dashboard"], dueDate: dateStr(8) },
    { title: "Speaking engagement calendar — responsive design", description: "Calendar view showing upcoming/past speaking engagements with location, date, and topic filters.", status: "in_progress", priority: "high", assigneeId: alex.id, engagementId: eng["Speaker Dashboard & Website Redesign"], projectId: proj["Dr. Bob Nelson — Website & Dashboard"], dueDate: dateStr(3) },

    // Maintenance tasks
    { title: "Fix timezone bug in Vantage PDF reports", description: "Patient intake PDFs showing wrong appointment times for Pacific timezone users.", status: "done", priority: "urgent", assigneeId: nick.id, engagementId: eng["Patient Intake Automation"], projectId: proj["Vantage Patient Intake — Maintenance"], dueDate: dateStr(-5), completedAt: daysAgo(6) },
    { title: "Update Apex compliance rules for Q2 regulations", description: "New SEC filing requirements effective April 1. Update rule engine and notification templates.", status: "todo", priority: "high", assigneeId: nick.id, engagementId: eng["Compliance Workflow Tool"], projectId: proj["Apex Compliance Tool — Maintenance"], dueDate: dateStr(2) },

    // Internal dashboard tasks
    { title: "Add drag-and-drop to pipeline kanban", description: "Use dnd-kit to enable drag-and-drop stage changes on the engagement pipeline board.", status: "in_progress", priority: "normal", assigneeId: alex.id, projectId: proj["STRVX Internal Dashboard"], dueDate: dateStr(7) },
    { title: "Build outreach analytics dashboard", description: "Charts showing prospect conversion rates by industry, touch count correlations, and rep performance.", status: "todo", priority: "normal", assigneeId: nick.id, projectId: proj["STRVX Internal Dashboard"], dueDate: dateStr(14) },
    { title: "Implement invoice PDF generation", description: "Generate downloadable PDF invoices with line items, STRVX branding, and payment terms.", status: "todo", priority: "normal", assigneeId: alex.id, projectId: proj["STRVX Internal Dashboard"], dueDate: dateStr(10) },

    // Standalone tasks
    { title: "Prepare case study: Apex Financial compliance tool", description: "Write up the Apex engagement as a case study for the website and LinkedIn. Include metrics on 70% reduction in manual compliance tasks.", status: "todo", priority: "normal", assigneeId: nick.id, dueDate: dateStr(7) },
    { title: "Review and update Calendly booking page", description: "Update Calendly availability, add new meeting types, and refresh the booking page branding.", status: "done", priority: "low", assigneeId: nick.id, dueDate: dateStr(-10), completedAt: daysAgo(12) },
    { title: "Set up monitoring for Vantage Health uptime", description: "Configure BetterStack or similar for 99.9% uptime monitoring on the patient intake system.", status: "todo", priority: "normal", assigneeId: nick.id, dueDate: dateStr(5) },
  ];
  const insertedTasks = await db
    .insert(schema.tasks)
    .values(tasksData)
    .returning();
  log("tasks", insertedTasks.length);

  // ── 15. Invoices ───────────────────────────────────────
  console.log("Seeding invoices...");
  const invoicesData = [
    {
      invoiceNumber: "STRVX-2026-001",
      engagementId: eng["Compliance Workflow Tool"],
      clientName: "Apex Financial",
      amount: "18000",
      taxRate: "0",
      status: "paid",
      issuedDate: dateStr(-25),
      dueDate: dateStr(-10),
      paidDate: dateStr(-8),
      lineItems: JSON.stringify([
        { description: "Compliance Workflow Tool — Full Build", amount: 16000 },
        { description: "Deployment & Configuration", amount: 2000 },
      ]),
      notes: "Payment received via wire transfer.",
    },
    {
      invoiceNumber: "STRVX-2026-002",
      engagementId: eng["Patient Intake Automation"],
      clientName: "Vantage Health",
      amount: "2000",
      taxRate: "0",
      status: "paid",
      issuedDate: dateStr(-5),
      dueDate: dateStr(10),
      paidDate: dateStr(-2),
      lineItems: JSON.stringify([
        { description: "Monthly Maintenance — March 2026", amount: 2000 },
      ]),
      notes: "Auto-billed monthly maintenance.",
    },
    {
      invoiceNumber: "STRVX-2026-003",
      engagementId: eng["AI Ops Dashboard"],
      clientName: "The Stability Group",
      amount: "17500",
      taxRate: "0",
      status: "sent",
      issuedDate: dateStr(-2),
      dueDate: dateStr(28),
      lineItems: JSON.stringify([
        { description: "AI Ops Dashboard — Milestone 1 (50% deposit)", amount: 17500 },
      ]),
      notes: "50% deposit invoice. Remaining 50% due on delivery.",
    },
    {
      invoiceNumber: "STRVX-2026-004",
      engagementId: eng["Speaker Dashboard & Website Redesign"],
      clientName: "Dr. Bob Nelson",
      amount: "14000",
      taxRate: "0",
      status: "sent",
      issuedDate: dateStr(-1),
      dueDate: dateStr(29),
      lineItems: JSON.stringify([
        { description: "Website Redesign & Speaker Dashboard — Milestone 1 (50%)", amount: 14000 },
      ]),
      notes: "50% deposit. Maintenance billing starts upon delivery.",
    },
    {
      invoiceNumber: "STRVX-2026-005",
      engagementId: eng["Patient Intake Automation"],
      clientName: "Vantage Health",
      amount: "2000",
      taxRate: "0",
      status: "draft",
      issuedDate: dateStr(0),
      dueDate: dateStr(30),
      lineItems: JSON.stringify([
        { description: "Monthly Maintenance — April 2026", amount: 2000 },
      ]),
      notes: "Draft for next month's maintenance billing.",
    },
    {
      invoiceNumber: "STRVX-2026-006",
      engagementId: eng["Compliance Workflow Tool"],
      clientName: "Apex Financial",
      amount: "500",
      taxRate: "0",
      status: "overdue",
      issuedDate: dateStr(-35),
      dueDate: dateStr(-20),
      lineItems: JSON.stringify([
        { description: "Additional configuration — Q1 regulatory update", amount: 500 },
      ]),
      notes: "Follow up needed. Small amount, may have been overlooked.",
    },
    {
      invoiceNumber: "STRVX-2026-007",
      engagementId: eng["Speaker Dashboard & Website Redesign"],
      clientName: "Dr. Bob Nelson",
      amount: "1500",
      taxRate: "0",
      status: "draft",
      issuedDate: dateStr(30),
      dueDate: dateStr(60),
      lineItems: JSON.stringify([
        { description: "Monthly Maintenance — May 2026", amount: 1500 },
      ]),
      notes: "First maintenance invoice. Scheduled for after delivery.",
    },
  ];
  const insertedInvoices = await db
    .insert(schema.invoices)
    .values(invoicesData)
    .returning();
  log("invoices", insertedInvoices.length);

  // ── 16. Expenses ───────────────────────────────────────
  console.log("Seeding expenses...");
  const expensesData = [
    { description: "Vercel Pro — Team Plan", amount: "60", category: "hosting", date: dateStr(-1), recurring: true, vendor: "Vercel", notes: "Monthly hosting for client projects and internal tools." },
    { description: "Supabase Pro", amount: "25", category: "hosting", date: dateStr(-1), recurring: true, vendor: "Supabase", notes: "Database hosting for dashboard and client apps." },
    { description: "Claude API — March usage", amount: "340", category: "software", date: dateStr(-5), recurring: false, vendor: "Anthropic", notes: "AI API costs for client projects and internal tools." },
    { description: "Figma Professional", amount: "15", category: "software", date: dateStr(-10), recurring: true, vendor: "Figma", notes: "Design tool for mockups and prototypes." },
    { description: "Apollo.io — Starter Plan", amount: "49", category: "software", date: dateStr(-15), recurring: true, vendor: "Apollo.io", notes: "Lead enrichment and outreach for prospecting." },
    { description: "Google Workspace — 3 seats", amount: "54", category: "software", date: dateStr(-1), recurring: true, vendor: "Google", notes: "Email, calendar, and docs for the team." },
    { description: "SF Tech Meetup — Event Sponsorship", amount: "250", category: "marketing", date: dateStr(-12), recurring: false, vendor: "SF Tech Meetup", notes: "Sponsored the March networking event. Good lead gen — met Ryan Cooper." },
    { description: "Zoom Pro", amount: "15", category: "software", date: dateStr(-1), recurring: true, vendor: "Zoom", notes: "Video calls with clients." },
    { description: "LinkedIn Premium — Nick", amount: "60", category: "marketing", date: dateStr(-3), recurring: true, vendor: "LinkedIn", notes: "Premium for outreach, InMail, and content analytics." },
    { description: "Client lunch — Jesse Martinez", amount: "85", category: "travel", date: dateStr(-8), recurring: false, vendor: "Restaurant", notes: "Lunch meeting with Jesse to discuss AI Ops Dashboard phase 2 scope." },
  ];
  const insertedExpenses = await db
    .insert(schema.expenses)
    .values(expensesData)
    .returning();
  log("expenses", insertedExpenses.length);

  // ── 17. Goals ──────────────────────────────────────────
  console.log("Seeding goals...");
  const goalsData = [
    {
      name: "Q2 Revenue Target",
      description: "Close $150K in new revenue by end of Q2 2026.",
      targetValue: "150000",
      currentValue: "83000",
      unit: "usd",
      deadline: "2026-06-30",
    },
    {
      name: "Active Client Count",
      description: "Have 8 active clients (build or maintain stage) by end of Q2.",
      targetValue: "8",
      currentValue: "4",
      unit: "clients",
      deadline: "2026-06-30",
    },
    {
      name: "Prospect Pipeline",
      description: "Maintain active pipeline across all channels.",
      targetValue: "20",
      currentValue: "12",
      unit: "engagements",
      deadline: "2026-06-30",
    },
    {
      name: "Monthly Recurring Revenue",
      description: "Reach $5,000/month in maintenance MRR.",
      targetValue: "5000",
      currentValue: "3500",
      unit: "usd",
      deadline: "2026-06-30",
    },
    {
      name: "Content Marketing — Posts per Month",
      description: "Publish 8+ marketing posts per month across LinkedIn and Twitter.",
      targetValue: "8",
      currentValue: "5",
      unit: "posts",
      deadline: "2026-04-30",
    },
  ];
  const insertedGoals = await db
    .insert(schema.goals)
    .values(goalsData)
    .returning();
  log("goals", insertedGoals.length);

  // ── 18. Marketing Posts ────────────────────────────────
  console.log("Seeding marketing posts...");

  // ── 19. Documents ──────────────────────────────────────
  console.log("Seeding documents...");
  const documentsData = [
    {
      title: "SOW — AI Ops Dashboard (The Stability Group)",
      content: "# Statement of Work\n\n## Project: AI Operations Dashboard\n**Client:** The Stability Group\n**Contact:** Jesse Martinez, CEO\n**Date:** March 2026\n\n## Scope\nBuild a real-time AI operations dashboard providing:\n- Model performance monitoring across 12 production models\n- Cost tracking and alerting (daily, weekly, monthly breakdowns)\n- Slack integration for anomaly alerts\n- Department-level views and access controls\n\n## Timeline\n- Sprint 1 (Week 1-2): Auth, layout, data ingestion\n- Sprint 2 (Week 3-4): Charts, alerts, Slack integration\n- Sprint 3 (Week 5-6): Testing, refinements, deployment\n\n## Budget\n$35,000 fixed price\n- 50% deposit on contract signing\n- 50% on delivery\n\n## Phase 2 (Optional)\nAnomaly detection ML pipeline — scoped separately.",
      folder: "proposals",
      authorId: nick.id,
    },
    {
      title: "SOW — Speaker Dashboard & Website (Dr. Bob Nelson)",
      content: "# Statement of Work\n\n## Project: Website Redesign & Speaker Dashboard\n**Client:** Dr. Bob Nelson\n**Date:** March 2026\n\n## Scope\n- Modern website redesign (Next.js + Sanity CMS)\n- Speaker engagement management dashboard\n- Calendar, testimonials (video + text), media kit\n- Blog with rich content editing\n\n## Maintenance\n$1,500/month includes:\n- Content updates (up to 10/month)\n- Bug fixes and security patches\n- Monthly analytics report\n\n## Budget\n$28,000 fixed price + $1,500/mo maintenance",
      folder: "proposals",
      authorId: nick.id,
    },
    {
      title: "STRVX Service Offerings — 2026",
      content: "# STRVX Service Offerings\n\n## Core Services\n1. **AI Automation** — Workflow automation using LLMs, computer vision, and custom ML models\n2. **Dashboard & Analytics** — Real-time monitoring dashboards and reporting tools\n3. **Website Development** — Modern Next.js websites with CMS integration\n4. **Maintenance & Support** — Ongoing support with monthly check-ins\n\n## Pricing\n- Small projects: $8K-$15K\n- Medium projects: $15K-$30K\n- Large projects: $30K-$50K+\n- Maintenance: $1,000-$2,500/month\n\n## Tech Stack\n- Frontend: Next.js, React, TypeScript, Tailwind\n- Backend: Supabase, PostgreSQL, Drizzle ORM\n- AI: Claude API, custom models, LangChain\n- Infra: Vercel, AWS, Docker",
      folder: "internal",
      authorId: nick.id,
    },
    {
      title: "Outreach Playbook — Trade Services",
      content: "# Outreach Playbook: Trade Service Companies\n\n## Target Profile\n- HVAC, Electrical, Plumbing, Roofing, Solar\n- 10-100 employees\n- Revenue $1M-$20M\n- Pain: scheduling, dispatch, estimating, invoicing\n\n## Messaging Framework\n- Lead with pain point (time/money lost)\n- Show concrete ROI numbers\n- Reference similar company case study\n- Offer free 20-min assessment\n\n## Sequence\n1. Day 0: Cold email (pain point + case study)\n2. Day 3: LinkedIn connection + message\n3. Day 7: Follow-up email (different angle)\n4. Day 14: Phone call\n5. Day 21: Final email (scarcity/urgency)\n\n## Key Stats for Messaging\n- HVAC companies lose avg $150K/year on scheduling inefficiency\n- AI dispatch reduces missed appointments by 40%\n- Automated estimating saves 2-3 hours per bid",
      folder: "internal",
      authorId: nick.id,
    },
    {
      title: "Proposal Template",
      content: "# [Project Name]\n\n## Executive Summary\n[1-2 paragraphs on what we'll build and why it matters]\n\n## Scope of Work\n### Deliverables\n- [Deliverable 1]\n- [Deliverable 2]\n- [Deliverable 3]\n\n### Out of Scope\n- [Explicitly excluded items]\n\n## Timeline\n| Phase | Duration | Deliverable |\n|-------|----------|-------------|\n| Phase 1 | X weeks | ... |\n| Phase 2 | X weeks | ... |\n\n## Investment\n- Total: $XX,XXX\n- Payment: 50% deposit, 50% on delivery\n- Maintenance: $X,XXX/month (optional)\n\n## Terms\n- Code ownership transfers to client on final payment\n- 90-day warranty on all delivered code\n- Changes to scope require written agreement",
      folder: "templates",
      authorId: nick.id,
    },
    {
      title: "Meeting Notes — Q1 Retro",
      content: "# Q1 2026 Retrospective\n**Date:** March 28, 2026\n**Attendees:** Nick, Alex\n\n## What Went Well\n- Closed Apex Financial and Vantage Health — both very happy clients\n- Built strong referral pipeline (David Kim -> Nathan Torres, Carlos Mendez -> Kevin Nguyen)\n- Internal dashboard shipping fast\n\n## What Could Improve\n- Need better project estimation — Vantage project ran 2 weeks over\n- Outreach cadence inconsistent — too many cold prospects sitting untouched\n- Documentation could be better (SOWs, internal processes)\n\n## Action Items\n- [ ] Nick: Create project estimation checklist and set up weekly outreach review\n- [ ] Alex: Document component library for reuse across projects\n\n## Q2 Focus\n- Land 2-3 more maintenance contracts for MRR\n- Push harder on trade services vertical\n- Ship internal dashboard v1 and dogfood it",
      folder: "internal",
      authorId: nick.id,
    },
  ];
  const insertedDocs = await db
    .insert(schema.documents)
    .values(documentsData)
    .returning();
  log("documents", insertedDocs.length);

  // ── Summary ────────────────────────────────────────────
  console.log("\n--- Seed Complete ---");
  console.log(`
  Users:             3
  Companies:         ${insertedCompanies.length}
  Contacts:         ${insertedContacts.length}
  Engagements:      ${insertedEngagements.length}
  Stage History:    ${insertedStageHistory.length}
  Interactions:     ${insertedInteractions.length}
  Next Actions:     ${insertedNextActions.length}
  Projects:         ${insertedProjects.length}
  Project Members:  ${insertedMembers.length}
  Calendar Events:  ${insertedEvents.length}
  Tasks:            ${insertedTasks.length}
  Invoices:         ${insertedInvoices.length}
  Expenses:         ${insertedExpenses.length}
  Goals:            ${insertedGoals.length}
  Documents:        ${insertedDocs.length}
  `);
}

main()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
