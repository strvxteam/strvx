# AI Opportunities for STRVX

> Deep analysis of AI integration for the internal dashboard and as a business differentiator.
> Written 2026-03-30. Based on codebase analysis of the Tacoma internal tool.

---

## Executive Summary

STRVX is a 3-person AI agency running a Next.js 16 + Supabase + Drizzle ORM internal dashboard (codename "Tacoma"). The tool manages the full client lifecycle: pipeline (lead through maintain), interactions, tasks, invoices, documents, calendar, outreach, and marketing. The codebase already has strong relational data (engagements, interactions, contacts, companies, stage history, next actions) that is ripe for AI augmentation. Zero AI features exist today.

This document outlines 17 concrete AI features across five categories, provides technical architecture for each, maps integration points into the existing codebase, and prioritizes them into three implementation phases. The goal: make three founders operate like ten, and position STRVX's internal tooling as living proof of what they sell to clients.

---

## 1. AI Features for the Internal Dashboard

### 1.1 Meeting Intelligence

#### What It Does

1. **Auto-transcribe meetings** -- record or upload audio, transcribe with speaker diarization.
2. **Structured extraction** -- parse transcript into action items, decisions, questions, and key topics.
3. **Auto-create tasks** -- write extracted action items directly into `next_actions` and `tasks` tables.
4. **Meeting prep briefs** -- before a scheduled meeting, auto-generate a summary of recent interactions, open actions, deal status, and suggested talking points.

#### Pipeline Design

```
Audio file (upload or Zoom recording URL)
  |
  v
Transcription Service (AssemblyAI preferred -- see rationale below)
  |
  v
Raw transcript with speaker labels + timestamps
  |
  v
LLM Extraction (Claude or GPT-4o)
  Prompt: structured JSON output
  Schema: { summary, decisions[], actionItems[], questions[], keyTopics[] }
  |
  v
Database writes:
  - interactions (type: 'meeting', content: summary)
  - next_actions (one per actionItem, linked to sourceInteractionId)
  - tasks (optional: for cross-engagement work items)
  - ai_generations (audit trail: prompt, model, tokens, cost)
```

#### Model Selection: Transcription

| Service | Strengths | Weaknesses | Cost |
|---------|-----------|------------|------|
| AssemblyAI | Best speaker diarization, real-time streaming, sentiment analysis, PII redaction built in, async webhooks | Slightly higher latency than Whisper for short clips | $0.37/hr (standard), $1.10/hr (with diarization) |
| OpenAI Whisper API | Cheapest, good accuracy, simple API | No speaker diarization (critical flaw for meetings), no streaming | $0.006/min ($0.36/hr) |
| Deepgram | Fast, good streaming, speaker diarization | Less accurate on accented speech, smaller community | $0.25/hr (with diarization) |

**Recommendation: AssemblyAI.** Speaker diarization is non-negotiable for meetings with clients. Their async processing model (submit job, poll or receive webhook) fits the existing architecture. PII redaction is a bonus for client-facing recordings.

#### Model Selection: Extraction

Use Claude (claude-sonnet-4-20250514) for structured extraction. Reasons:
- Superior at following complex JSON schemas reliably.
- Long context window handles full meeting transcripts without chunking.
- STRVX already has Anthropic expertise.
- Cost: ~$0.003-0.01 per meeting extraction (a 60-minute meeting transcript is ~10K tokens input).

#### Prompt Engineering: Meeting Extraction

```
System: You are a meeting analyst for a software agency called STRVX.
Extract structured data from meeting transcripts.

Rules:
- Action items must include: owner (name from transcript), description, suggested due date
- Decisions must include: what was decided, who decided, context
- Questions must include: the question, who asked, whether it was answered
- Keep summary under 200 words
- Use the engagement context to resolve ambiguous references

Output format: strict JSON matching the provided schema.
```

Context window management: prepend engagement metadata (company name, stage, recent interactions summary, open actions) as context before the transcript. This costs ~500 extra tokens but dramatically improves extraction quality for ambiguous references like "the dashboard" or "the deadline."

#### Integration Points

- **New API route:** `POST /api/ai/transcribe` -- accepts audio file, creates AssemblyAI job, returns job ID.
- **Webhook handler:** `POST /api/webhooks/assemblyai` -- receives completed transcript, triggers extraction.
- **Existing schema:** interactions table already supports `type: 'meeting'` and `scheduledAt`. Add `transcriptUrl` and `aiSummary` columns.
- **UI location:** Client detail page (`/clients/[id]`) -- add "Transcribe Meeting" button in the timeline section. Show AI-generated summary inline with expand/collapse for full transcript.
- **Meeting prep:** Triggered by cron job or on-demand. Reads `calendarEvents` for tomorrow's meetings, fetches engagement context, generates brief via LLM, stores in `ai_generations` table.

---

### 1.2 Smart CRM

#### Deal Scoring Model

**What signals to track:**

| Signal | Source Table | Weight | Rationale |
|--------|-------------|--------|-----------|
| Interaction frequency (last 14 days) | `interactions` | High | Active engagement correlates with close |
| Days since last interaction | `interactions` | High (inverse) | Silence is the loudest signal |
| Stage duration vs. historical average | `stage_history` | Medium | Deals stuck too long in a stage are at risk |
| Response time (time between outbound and inbound) | `prospect_touches` | Medium | Fast responses signal intent |
| Number of contacts involved | `contacts` | Medium | Multi-threaded deals close more often |
| Deal value vs. historical average | `engagements.dealValue` | Low | Larger deals take longer but aren't worse |
| Stage progression velocity | `stage_history` | High | Consistent forward movement predicts close |
| Meeting frequency | `interactions` (type='meeting') | High | Face time drives deals |
| Open action items (overdue count) | `next_actions` | Medium (inverse) | Overdue items signal disengagement |

**Scoring approach:**

For a 3-person agency with limited historical data, a rules-based scoring model is more practical than ML initially. Start with weighted heuristic scoring, then evolve to ML once there are 50+ completed engagements.

```typescript
// Heuristic deal score (0-100)
function calculateDealScore(engagement: EngagementWithSignals): number {
  let score = 50; // baseline

  // Recency of interaction (most important signal)
  const daysSinceLastInteraction = getDaysSince(engagement.lastInteractionAt);
  if (daysSinceLastInteraction <= 1) score += 15;
  else if (daysSinceLastInteraction <= 3) score += 10;
  else if (daysSinceLastInteraction <= 7) score += 5;
  else if (daysSinceLastInteraction > 14) score -= 20;

  // Interaction frequency (interactions per week over last 30 days)
  const weeklyRate = engagement.interactionCount30d / 4;
  if (weeklyRate >= 3) score += 10;
  else if (weeklyRate >= 1) score += 5;
  else score -= 10;

  // Stage velocity
  const avgDaysInStage = getHistoricalAvgDaysInStage(engagement.stage);
  const actualDays = getDaysSince(engagement.stageEnteredAt);
  if (actualDays < avgDaysInStage * 0.5) score += 10; // fast mover
  if (actualDays > avgDaysInStage * 2) score -= 15; // stuck

  // Meeting involvement
  const meetingCount30d = engagement.meetingCount30d;
  if (meetingCount30d >= 2) score += 10;
  else if (meetingCount30d === 0) score -= 10;

  // Overdue actions (negative signal)
  if (engagement.overdueActionCount > 0) score -= (engagement.overdueActionCount * 5);

  // Multi-threading (multiple contacts)
  if (engagement.contactCount >= 2) score += 5;

  return Math.max(0, Math.min(100, score));
}
```

**Display:** Show score as a color-coded badge on pipeline cards. 80-100 = green (hot), 50-79 = yellow (warm), 0-49 = red (at risk). This integrates directly into the existing `PipelineEngagement` interface.

#### Next Best Action Suggestions

Use an LLM to generate contextual recommendations based on engagement state. This is not ML -- it is structured prompt engineering over real data.

**Trigger conditions and templates:**

| Condition | Suggestion |
|-----------|------------|
| No interaction in 5+ days, stage = proposal/negotiation | "Follow up with {contact} -- the {stage} stage is going cold. Suggest scheduling a quick call." |
| Meeting tomorrow, no prep notes | "Meeting with {company} tomorrow. Review: {open_action_count} open items, last interaction was about {last_interaction_summary}." |
| Deal in proposal stage > 10 days | "Proposal sent {n} days ago. Consider a check-in call or sending case studies." |
| Action item overdue by 3+ days | "{action_description} was due {n} days ago for {company}. Mark complete or reschedule." |
| New contact added, no outreach yet | "New contact {name} added for {company}. Send intro email or LinkedIn connection." |
| Deal closed-won, no maintenance setup | "{company} closed. Set up maintenance agreement -- they opted in during discovery." |

**Architecture:**

```
Cron job (daily at 8am) or event-driven (on interaction create)
  |
  v
Query engine: evaluate all active engagements against condition rules
  |
  v
For matches: generate suggestion via LLM (for nuanced phrasing)
  OR use template-based generation (cheaper, faster)
  |
  v
Write to `ai_suggestions` table
  |
  v
Display on dashboard "Needs Attention" section
```

**Implementation note:** Start with template-based suggestions (no LLM cost). Graduate to LLM-enhanced phrasing once the templates prove useful. The condition evaluation is pure SQL/TypeScript -- the LLM only adds conversational polish.

#### Churn Risk Prediction for Maintenance Clients

Maintenance clients (`stage = 'maintain'`, `maintenanceOptedIn = true`) need a different scoring model:

| Signal | Risk Indicator |
|--------|---------------|
| Missed check-in (past `maintenanceNextCheckin`) | High risk |
| Declining interaction frequency over 3 months | Medium risk |
| No interactions in 30+ days | High risk |
| Bug reports / complaints in recent interactions | Medium risk (requires NLP sentiment) |
| Payment delays (if tracked in invoices) | High risk |

**Display:** Dedicated section on the dashboard for maintenance clients. Red/yellow/green health indicators. Link directly to the engagement detail page.

---

### 1.3 Content Generation

#### Email Draft Generation

**How it works:**

User opens an engagement, clicks "Draft Email." The system pulls:
1. Last 5 interactions (content + type + date)
2. Open action items
3. Contact details (name, role, email)
4. Current stage and deal value
5. Company industry

This context is sent to the LLM with a prompt like:

```
System: You are drafting an email on behalf of {user.name} from STRVX,
a software agency. Match the tone: professional but warm,
concise, no corporate jargon.

Context:
- Recipient: {contact.name}, {contact.role} at {company.name}
- Current stage: {engagement.stage}
- Last interaction ({days_ago} days ago): {last_interaction.content}
- Open items: {open_actions.map(a => a.description).join(', ')}

User request: {user_prompt}

Write the email body only (no subject line unless asked).
Keep it under 200 words.
```

**Context window management:**
- Total context: ~1,500-2,000 tokens (engagement metadata + recent interactions)
- Model: Claude Haiku for drafts (fast, cheap at $0.25/1M input tokens), Claude Sonnet for final proposals
- Streaming: Yes -- stream the response to the UI for perceived speed
- Cost per draft: ~$0.001 (negligible)

#### Proposal Generation

**Pipeline:**

```
User selects "Generate Proposal" on engagement detail
  |
  v
System loads:
  - Engagement metadata (stage, deal value, timeline)
  - All interactions (full context of what was discussed)
  - Matching proposal template (from documents table)
  - Company/industry context
  |
  v
LLM generates proposal sections:
  - Executive summary
  - Scope of work (derived from interaction history)
  - Timeline and milestones
  - Pricing breakdown
  - Terms
  |
  v
Output to Documents (rich text via Tiptap editor)
  User reviews and edits before sending
```

**Template approach:** Store proposal templates as documents in the `documents` table with `folder = 'templates'`. The LLM fills in project-specific details. This uses the existing Tiptap rich text editor infrastructure.

#### Meeting Prep Briefs

**Trigger:** Automated, generated the evening before (or on-demand via button).

**Content:**
```
## Meeting Prep: {company.name} -- {engagement.name}
**Stage:** {stage} (entered {n} days ago)
**Deal Value:** {dealValue}
**Contact:** {contact.name} ({contact.role})

### Recent Activity (last 14 days)
- {interactions.map(i => `${i.date}: ${i.type} -- ${i.summary}`)}

### Open Items
- {openActions.map(a => `${a.description} (due: ${a.dueDate})`)}

### Suggested Talking Points
1. {LLM-generated based on context}
2. {LLM-generated based on context}
3. {LLM-generated based on context}
```

**Integration:** Show as a dismissible card above the timeline on the engagement detail page. Also surface on the dashboard when there are meetings today.

---

### 1.4 Knowledge Management

#### Semantic Search Architecture

**Why ILIKE search falls short:** The current `searchEngagements` query in `queries.ts` uses `ILIKE` pattern matching. This misses semantic connections. Searching "pricing discussion" won't find an interaction that says "we talked about the $12K budget for phase 2." Semantic search solves this.

**Embedding pipeline:**

```
Content created/updated (interaction, document, note)
  |
  v
Event trigger (database trigger or application-level)
  |
  v
Generate embedding via OpenAI text-embedding-3-small
  - 1536 dimensions
  - $0.02 per 1M tokens (~$0.00002 per interaction)
  |
  v
Store in Supabase pgvector
  - New table: content_embeddings
  - Columns: id, content_type, content_id, embedding (vector(1536)),
    content_text, metadata (jsonb), created_at
  |
  v
Search:
  - User query -> embed query -> cosine similarity search
  - Filter by content_type, engagement_id, date range
  - Return top-k results with relevance score
```

**Why Supabase pgvector (not Pinecone, Weaviate, etc.):**

1. Already using Supabase -- zero new infrastructure.
2. pgvector is built into Supabase (just enable the extension).
3. At STRVX's scale (hundreds to low thousands of embeddings), pgvector performance is excellent.
4. Joins with existing tables (engagements, contacts) are trivial -- no cross-service sync needed.
5. Cost: $0. Already included in Supabase plan.

**Database migration:**

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Content embeddings table
CREATE TABLE content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL, -- 'interaction', 'document', 'task', 'note'
  content_id UUID NOT NULL,
  engagement_id UUID REFERENCES engagements(id),
  embedding VECTOR(1536) NOT NULL,
  content_text TEXT NOT NULL, -- denormalized for display
  metadata JSONB, -- { author, date, type, stage }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast similarity search
CREATE INDEX content_embeddings_idx
  ON content_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

**What gets embedded:**
- Every interaction (notes, meetings, actions, stage changes)
- Every document (title + content)
- Task descriptions
- Proposal content

**Cost estimate:** At ~200 interactions/month and average 100 tokens each, embedding cost is ~$0.0004/month. Essentially free.

#### Conversational Query Interface

**"What did we decide about X?"**

This is the most powerful feature. Users ask natural language questions, the system searches across all content and synthesizes an answer.

```
User query: "What did we decide about the pricing for Meridian Labs?"
  |
  v
Embed query -> pgvector similarity search
  (filter: engagement where companyName = 'Meridian Labs' OR all engagements)
  -> top 10 results
  |
  v
LLM synthesis:
  System: Answer the user's question using ONLY the provided context.
  If the answer isn't in the context, say so.
  Cite sources with dates and interaction types.

  Context: {top 10 search results with metadata}
  Question: {user query}
  |
  v
Display: inline answer with source citations (clickable links to interactions)
```

**UI pattern:** Expand the existing command palette (`Cmd+K`) to handle natural language queries. When the query doesn't match an engagement/contact name, route it through the semantic search + LLM synthesis pipeline.

#### Auto-Tagging and Categorization

When an interaction is created, run a lightweight classification:

```
New interaction content -> LLM (Haiku, ~$0.0005 per call)
  -> Extract: topics[], sentiment (positive/neutral/negative),
     category (update/decision/blocker/question)
  -> Write to interaction metadata (new jsonb column)
```

This enables filtering the timeline by topic or sentiment without manual tagging.

---

### 1.5 Analytics and Insights

#### Natural Language Queries Over Business Data

**Examples:**
- "How much revenue did we close last month?"
- "Which prospects haven't been contacted in 2 weeks?"
- "What's our average deal cycle time?"
- "How many deals are in proposal stage?"

**Architecture: Text-to-SQL (safe subset)**

```
User question
  |
  v
LLM generates SQL query
  Constraints:
  - SELECT only (no mutations)
  - Limited to predefined views (not raw tables)
  - Parameterized (no injection risk)
  - EXPLAIN ANALYZE limit (abort queries that would scan >10K rows)
  |
  v
Execute against read-only database connection
  |
  v
LLM formats result into natural language answer
  |
  v
Display with the raw data table and optional chart
```

**Safety guardrails:**
1. Read-only database role for analytics queries.
2. Allowlisted table/view set (no access to auth tables).
3. Query timeout (5 seconds max).
4. Token limit on generated SQL (prevent absurdly complex queries).
5. Rate limit (10 queries per user per hour).

**Simpler alternative for Phase 1:** Pre-built analytics functions that the LLM selects from, rather than generating SQL. The LLM maps the user's question to a function call:

```typescript
const analyticsFunctions = {
  revenueClosedInPeriod: (startDate: string, endDate: string) => ...,
  dealsByStage: () => ...,
  averageCycleTime: (stage?: string) => ...,
  staleProspects: (daysSinceContact: number) => ...,
  topDealsbyValue: (limit: number) => ...,
};
```

This is safer, faster, and requires no text-to-SQL risk.

#### Trend Detection and Anomaly Alerts

**Daily batch job:**

```
Run at midnight:
  1. Pipeline velocity: compare this week's stage transitions to 4-week average
  2. Revenue pace: compare MTD closed-won to monthly target (from goals table)
  3. Engagement health: flag any engagement where score dropped >20 points in 7 days
  4. Outreach effectiveness: response rate by channel this week vs. historical
  |
  v
If anomaly detected (>1 standard deviation from baseline):
  -> Create alert in ai_suggestions table
  -> Flag for display on dashboard
```

#### Weekly AI-Generated Business Report

**Generated every Sunday evening. Content:**

```
## STRVX Weekly Report -- Week of {date}

### Pipeline Health
- {n} new leads entered pipeline
- {n} deals advanced stages
- {n} deals closed ({won}/{lost})
- Pipeline value: ${total} (change from last week: {delta})

### Key Activity
- {total_interactions} total interactions across {n} engagements
- Most active engagement: {name} ({interaction_count} interactions)
- {meetings_held} meetings held

### Attention Required
- {stale_count} engagements with no activity in 7+ days
- {overdue_count} overdue action items
- {upcoming_meetings} meetings this week without prep

### Revenue
- MTD closed: ${amount} / ${target} ({percentage}% of monthly goal)
- MRR from maintenance: ${mrr}

### Recommendations
{LLM-generated insights based on the data above}
```

**Delivery:** Stored as a document. Could also be sent via email (using the Gmail MCP integration already available) or posted to Slack.

---

## 2. AI as a Business Differentiator

### 2.1 For Client Projects

#### How STRVX's AI Expertise Creates Better Client Outcomes

The internal tool is the proof. Every AI feature built for Tacoma becomes a case study, a reusable pattern, and a demo artifact for client sales.

**Concrete leverage points:**

1. **Meeting intelligence pipeline** -- client sells executive coaching? Build them the same transcription-to-action-items pipeline. The architecture is identical; only the extraction schema changes.

2. **Semantic search** -- client has a knowledge base, documentation, or support tickets? The pgvector embedding pipeline ports directly. STRVX has already solved the Supabase pgvector integration, embedding generation, and search UX.

3. **Smart notifications/suggestions** -- every SaaS product benefits from "next best action" logic. The rules engine built for deal scoring generalizes to any domain: patient follow-ups (healthcare), student check-ins (edtech), renewal reminders (subscription business).

4. **Content generation** -- email drafts, report generation, proposal automation. These patterns are universal. The prompt engineering templates, context window management, and streaming UX built for Tacoma are reusable IP.

#### Case Study Framework

For every AI feature shipped internally, document:

```
## Case Study: {Feature Name}

### Before
- Time spent: {X hours/week}
- Error rate: {qualitative or quantitative}
- What fell through the cracks: {specific examples}

### After
- Time spent: {Y hours/week}
- Quality improvement: {specific}
- New capability unlocked: {what wasn't possible before}

### Technical Architecture
- Models used: {list}
- Cost per operation: {$amount}
- Latency: {seconds}
- Integration complexity: {low/medium/high}

### Applicability to Client Projects
- Verticals: {list}
- Customization required: {low/medium/high}
- Estimated client implementation time: {days/weeks}
```

#### Portfolio Positioning

The pitch is not "we build software." The pitch is:

> "We build AI-native software. Our own operating system runs on the same AI infrastructure we build for clients. Every workflow in our agency is augmented by AI -- from meeting transcription to deal scoring to content generation. When we build for you, we're deploying battle-tested patterns, not experimenting on your dime."

This is provable. Invite prospects to a live demo of Tacoma. Show the meeting intelligence pipeline. Show the semantic search. Show the deal scoring. Then say: "We'll build this for your domain."

### 2.2 Agency Operations: 3 People Operating Like 10

#### Time Savings Breakdown (estimated per week)

| Task | Current Time | With AI | Savings |
|------|-------------|---------|---------|
| Meeting note-taking and summarization | 3 hrs | 0.5 hrs | 2.5 hrs |
| Writing follow-up emails | 2 hrs | 0.5 hrs | 1.5 hrs |
| Pipeline review and prioritization | 1.5 hrs | 0.25 hrs | 1.25 hrs |
| Searching for past decisions/context | 2 hrs | 0.25 hrs | 1.75 hrs |
| Preparing for client meetings | 2 hrs | 0.5 hrs | 1.5 hrs |
| Writing proposals | 4 hrs | 1 hr | 3 hrs |
| Weekly reporting | 1 hr | 0.1 hrs | 0.9 hrs |
| Data entry (CRM updates) | 1.5 hrs | 0.25 hrs | 1.25 hrs |
| **Total** | **17 hrs/week** | **3.35 hrs/week** | **13.65 hrs/week** |

That is 13.65 hours per person per week reclaimed. Across 3 founders, that is **40+ hours/week** -- the equivalent of a full-time employee.

#### What Those Hours Become

- More client projects (revenue increase)
- Better client outcomes (deeper engagement)
- Business development (more pipeline)
- Product development (building the next thing)

#### AI-Assisted Development

STRVX already uses Claude Code for development. The internal tool can become a feedback loop:

1. **Bug reports generated by AI** -- anomaly detection surfaces issues before users report them.
2. **Feature usage analytics** -- track which features founders actually use, auto-generate improvement suggestions.
3. **Code review integration** -- when a PR is created for Tacoma, auto-generate a summary of what changed and which users/workflows are affected.

### 2.3 Productization Path

#### Opportunity 1: AI Meeting Assistant for Agencies

**Market:** 50,000+ agencies in the US alone. Most use generic tools (Otter.ai, Fireflies.ai) that transcribe but don't integrate with CRM data.

**Differentiator:** Meeting transcription that understands agency context -- it knows what stage the deal is in, who the contacts are, what the open action items are. It doesn't just transcribe; it updates the CRM.

**Feasibility:** High. The transcription pipeline + extraction prompt + database write is already designed. Package it as:
- Zapier/Make integration (webhook-based)
- Standalone web app with auth
- Chrome extension for Zoom/Google Meet

**Revenue model:** $49/month per seat. 100 paying agencies = $4,900 MRR.

**Risk:** Competitive market (Otter, Fireflies, Fathom, Grain). The wedge is CRM integration for agencies specifically.

#### Opportunity 2: AI-Powered CRM Insights for Small Teams

**Market:** Small professional services firms (5-20 people) who use spreadsheets or basic CRMs and get zero intelligence from their data.

**Differentiator:** A CRM that tells you what to do, not just what happened. Deal scoring, churn prediction, next-best-action -- features that Salesforce charges enterprise prices for.

**Feasibility:** Medium. Requires productizing the internal tool (multi-tenant, onboarding, billing). Significant but tractable.

**Revenue model:** $99/month per team. Vertical-specific (agencies, consultancies, professional services).

**Risk:** CRM market is brutally competitive. Must stay small and opinionated. "The AI CRM for agencies under 20 people" is a defensible niche.

#### Opportunity 3: Engagement Intelligence API

**Market:** Developers building CRMs, project management tools, or client portals who want to add AI features without building the infrastructure.

**Differentiator:** API-first. Send us your engagement data, get back deal scores, next-best-actions, churn predictions, and auto-generated insights.

**Feasibility:** Medium-high. The scoring logic, prompt templates, and pipeline architecture are the product. Wrap them in an API.

**Revenue model:** Usage-based. $0.01 per scoring call, $0.05 per content generation.

**Risk:** Requires critical mass of API consumers. Marketing-heavy. But technically the easiest to ship.

#### Recommendation

Do not pursue productization until Phase 2 AI features are live and battle-tested internally for at least 90 days. Premature productization burns time that should go to client work. When ready, Opportunity 1 (AI Meeting Assistant) has the best risk/reward ratio: smallest scope, clearest differentiator, easiest to validate with 10 beta users.

---

## 3. Technical Implementation Guide

### 3.1 Infrastructure

#### Model Selection Strategy

| Use Case | Model | Why | Cost |
|----------|-------|-----|------|
| Email drafts, quick summaries | Claude 3.5 Haiku | Fast (sub-second), cheap, good enough for drafts | $0.25/$1.25 per 1M tokens |
| Meeting extraction, proposals, complex synthesis | Claude 4 Sonnet | Best structured output quality, strong at following schemas | $3/$15 per 1M tokens |
| Embeddings | OpenAI text-embedding-3-small | Industry standard, cheap, 1536 dimensions | $0.02 per 1M tokens |
| Transcription | AssemblyAI | Speaker diarization, async processing, PII redaction | $0.37-1.10/hr |
| Deal scoring | No model needed | Rules-based TypeScript | $0 |
| Next best action (phase 1) | No model needed | Template-based | $0 |
| Natural language analytics | Claude 3.5 Haiku | Function calling to select pre-built queries | $0.25/$1.25 per 1M tokens |

**Monthly cost estimate (at STRVX scale):**

| Feature | Volume | Cost |
|---------|--------|------|
| Meeting transcription | 20 meetings/month, avg 45 min | ~$16.50 (AssemblyAI) |
| Meeting extraction | 20 calls | ~$0.20 (Sonnet) |
| Email drafts | 50 drafts/month | ~$0.05 (Haiku) |
| Meeting prep briefs | 20 briefs/month | ~$0.10 (Haiku) |
| Semantic search embeddings | 500 items/month | ~$0.01 (embedding) |
| Conversational queries | 100 queries/month | ~$0.50 (Haiku + embedding) |
| Weekly reports | 4 reports/month | ~$0.10 (Sonnet) |
| **Total** | | **~$17.50/month** |

This is negligible. Even at 10x volume, AI costs stay under $200/month.

#### Cost Management

1. **Caching** -- Cache embedding search results for identical queries (TTL: 1 hour). Cache LLM responses for identical prompts (TTL: 24 hours for reports, never for real-time queries). Use a simple in-memory LRU cache or Redis if available.

2. **Batching** -- Embed new content in batches (every 5 minutes) rather than per-event. OpenAI's embedding API supports batch requests.

3. **Model routing** -- Use Haiku for interactive features (speed matters). Use Sonnet for batch features (quality matters). Never use Opus for automated features unless the task genuinely requires it.

4. **Token budgets** -- Set per-feature token limits. Email drafts: max 2,000 tokens output. Meeting summaries: max 1,000 tokens. Enforce via `max_tokens` parameter.

5. **Cost tracking** -- Log every LLM call to `ai_generations` table with model, input_tokens, output_tokens, cost_cents. Build a simple cost dashboard in the finance section.

#### Latency Optimization

1. **Streaming** -- All user-facing LLM responses stream via Server-Sent Events (SSE) or the Vercel AI SDK's `useChat`/`useCompletion` hooks. This makes a 3-second generation feel like 0.3 seconds.

2. **Background processing** -- Meeting transcription, embedding generation, weekly reports, and batch scoring run as background jobs. Never block the UI.

3. **Precomputation** -- Deal scores, suggestion lists, and meeting prep briefs are computed ahead of time and cached. The UI reads from the cache, not from the LLM.

4. **Edge caching** -- For static AI outputs (weekly report, deal scores), cache at the CDN level via Vercel's caching headers.

#### Privacy and Data Handling

1. **Data residency** -- All client data stays in Supabase (US region). LLM API calls send only the minimum context needed.

2. **PII handling** -- For meeting transcription, enable AssemblyAI's PII redaction for transcripts that will be stored. For LLM calls, do not send client email addresses, phone numbers, or financial details unless the feature requires it.

3. **Opt-out** -- Add a per-engagement toggle: `ai_enabled (boolean, default true)`. When false, no AI features process that engagement's data.

4. **Audit trail** -- Every AI generation is logged in `ai_generations` with the full prompt, response, model, and timestamp. This enables debugging, cost tracking, and compliance review.

5. **Data retention** -- AI-generated content follows the same retention policy as user-created content. Embeddings can be regenerated and are not sensitive themselves.

### 3.2 Architecture

#### Event-Driven AI Pipeline

The key insight: most AI features should be triggered by data events, not user clicks.

```
[User action]
  -> Database write (interaction created, stage changed, meeting scheduled)
  -> Application-level event emitter
  -> AI pipeline handlers

Handlers:
  onInteractionCreated:
    -> Generate embedding
    -> Update deal score
    -> Check suggestion triggers
    -> Auto-tag content

  onStageChanged:
    -> Update deal score
    -> Check churn risk (if moving to maintain)
    -> Generate stage-change summary

  onMeetingScheduled:
    -> Schedule prep brief generation (24h before)
    -> Check for related open actions

  onDealClosed:
    -> Generate win/loss analysis
    -> Update monthly metrics
    -> Archive stale suggestions
```

#### Background Job Processing

**Recommended: Trigger.dev**

| Option | Pros | Cons |
|--------|------|------|
| Trigger.dev | TypeScript-native, Vercel-friendly, great DX, built-in retries and scheduling, free tier | Newer, smaller community |
| Inngest | Similar to Trigger.dev, event-driven, step functions | More complex for simple jobs |
| pg-boss | PostgreSQL-native (already using Postgres), no external service | Requires long-running process (not serverless-friendly) |
| Vercel Cron + Edge Functions | Zero infrastructure, already on Vercel | Limited to cron (not event-driven), 10-second timeout |
| QStash (by Upstash) | Serverless message queue, Vercel-native | Another service to manage |

**Recommendation: Trigger.dev** for complex pipelines (meeting transcription, weekly reports), **Vercel Cron** for simple scheduled jobs (daily deal scoring, weekly report). This avoids adding a new service for simple cases while having a robust option for complex workflows.

#### Embedding Pipeline Detail

```typescript
// src/lib/ai/embeddings.ts

import { OpenAI } from 'openai';
import { db } from '@/lib/db';
import { contentEmbeddings } from '@/lib/db/schema';

const openai = new OpenAI();

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

export async function indexContent(params: {
  contentType: 'interaction' | 'document' | 'task';
  contentId: string;
  engagementId?: string;
  text: string;
  metadata?: Record<string, unknown>;
}) {
  const embedding = await generateEmbedding(params.text);

  await db.insert(contentEmbeddings).values({
    contentType: params.contentType,
    contentId: params.contentId,
    engagementId: params.engagementId ?? null,
    embedding: embedding,
    contentText: params.text,
    metadata: params.metadata ?? null,
  });
}

export async function semanticSearch(params: {
  query: string;
  engagementId?: string;
  contentType?: string;
  limit?: number;
}) {
  const queryEmbedding = await generateEmbedding(params.query);

  // Using Supabase's pgvector similarity search
  const results = await db.execute(sql`
    SELECT
      content_type,
      content_id,
      engagement_id,
      content_text,
      metadata,
      1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    FROM content_embeddings
    WHERE 1=1
      ${params.engagementId ? sql`AND engagement_id = ${params.engagementId}` : sql``}
      ${params.contentType ? sql`AND content_type = ${params.contentType}` : sql``}
    ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${params.limit ?? 10}
  `);

  return results;
}
```

#### Real-Time vs. Batch Processing Decision Matrix

| Feature | Mode | Why |
|---------|------|-----|
| Email draft generation | Real-time (streaming) | User is waiting |
| Semantic search | Real-time | User is waiting |
| Conversational query | Real-time (streaming) | User is waiting |
| Meeting transcription | Batch (async) | Takes 2-10 minutes |
| Meeting extraction | Batch (triggered by transcription complete) | Chained after async job |
| Deal scoring | Batch (daily) + event-triggered | Pre-compute, update on changes |
| Embedding generation | Near-real-time (5-min batch) | Not user-blocking |
| Weekly report | Batch (scheduled) | Not time-sensitive |
| Meeting prep briefs | Batch (scheduled 24h before) | Pre-computed |
| Next best action suggestions | Batch (daily) + event-triggered | Pre-computed |
| Auto-tagging | Near-real-time (on create) | Piggyback on embedding job |

### 3.3 Integration with the Existing App

#### New Database Tables

```sql
-- AI generation audit trail
CREATE TABLE ai_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature TEXT NOT NULL, -- 'meeting_extraction', 'email_draft', 'search_synthesis', etc.
  model TEXT NOT NULL, -- 'claude-sonnet-4-20250514', 'claude-3-5-haiku', etc.
  engagement_id UUID REFERENCES engagements(id),
  prompt_summary TEXT, -- first 500 chars of prompt (not full prompt for storage)
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_cents NUMERIC,
  latency_ms INTEGER,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI suggestions (next best actions, alerts, recommendations)
CREATE TABLE ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID REFERENCES engagements(id),
  type TEXT NOT NULL, -- 'follow_up', 'meeting_prep', 'churn_risk', 'anomaly', etc.
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'
  action_url TEXT, -- deep link to relevant page
  dismissed_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Content embeddings (semantic search)
CREATE TABLE content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  engagement_id UUID REFERENCES engagements(id),
  embedding VECTOR(1536) NOT NULL,
  content_text TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX content_embeddings_hnsw_idx
  ON content_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Deal scores (cached, recomputed daily or on events)
CREATE TABLE deal_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) UNIQUE,
  score INTEGER NOT NULL, -- 0-100
  signals JSONB NOT NULL, -- breakdown of contributing factors
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Column additions to existing tables:**

```sql
-- interactions: add AI-related columns
ALTER TABLE interactions ADD COLUMN transcript_url TEXT;
ALTER TABLE interactions ADD COLUMN ai_summary TEXT;
ALTER TABLE interactions ADD COLUMN ai_metadata JSONB; -- tags, sentiment, etc.

-- engagements: add AI toggle
ALTER TABLE engagements ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

#### New File Structure

```
src/
  lib/
    ai/
      config.ts          -- Model names, API keys, token limits
      embeddings.ts      -- Embedding generation and search
      extraction.ts      -- Meeting transcript extraction
      scoring.ts         -- Deal scoring engine
      suggestions.ts     -- Next best action engine
      generation.ts      -- Content generation (emails, proposals, briefs)
      analytics.ts       -- Natural language query handler
      cost-tracker.ts    -- Log and track AI costs
    db/
      schema.ts          -- Add new tables (ai_generations, etc.)
  app/
    api/
      ai/
        transcribe/route.ts    -- Upload audio, start transcription
        search/route.ts        -- Semantic search endpoint
        generate/route.ts      -- Content generation (streaming)
        score/route.ts         -- Trigger deal scoring
        suggestions/route.ts   -- Get suggestions for dashboard
      webhooks/
        assemblyai/route.ts    -- Transcription complete webhook
  components/
    ai/
      ai-search.tsx           -- Semantic search UI in command palette
      ai-suggestion-card.tsx  -- Suggestion display on dashboard
      deal-score-badge.tsx    -- Score indicator on pipeline cards
      email-draft-modal.tsx   -- Email generation modal
      meeting-prep-card.tsx   -- Pre-meeting briefing card
      transcript-viewer.tsx   -- Meeting transcript display
```

#### UI/UX Patterns for AI Features

**1. Inline suggestions (non-intrusive):**
- Deal score badges on pipeline cards (small colored dot with number)
- Auto-tag chips on interaction timeline entries
- "AI" label on any auto-generated content

**2. Side panels (on-demand):**
- Email draft generation opens a right-side panel on the engagement detail page
- Meeting prep brief slides in above the timeline
- Semantic search results in the command palette dropdown

**3. Dashboard integration:**
- "AI Suggestions" section replaces or augments the current "Needs Attention" section
- Each suggestion has: icon, title, one-line body, action button, dismiss button
- Suggestions ordered by priority, with urgent items highlighted

**4. Chat interface (Phase 3):**
- Floating chat button (bottom right) for conversational queries
- "Ask STRVX" -- query anything about the business
- Maintains conversation context within a session

**5. Loading states for AI features:**
- Streaming text: show characters as they arrive (typewriter effect)
- Async jobs (transcription): show progress indicator with estimated time
- Scoring: skeleton loader that reveals the score with a brief animation
- All AI features show a subtle "AI-generated" label (builds trust and sets expectations)

**6. Error handling:**
- LLM failures: show "AI is temporarily unavailable" with retry button
- Transcription failures: show error with re-upload option
- Never block the core workflow -- AI features are enhancement, not dependency

---

## 4. Prioritized Roadmap

### Evaluation Criteria

Each feature is scored 1-5 on four dimensions:

| Dimension | 1 | 5 |
|-----------|---|---|
| **Workflow impact** | Nice to have | Transforms daily work |
| **Technical feasibility** | Requires new infrastructure, complex architecture | Uses existing stack, straightforward implementation |
| **Cost to run** | >$100/month or requires paid service | <$10/month or free |
| **Time to value** | Months of work before useful | Days to first useful output |

---

### Phase 1: Quick Wins (1-2 weeks each)

These features can be built in days, use the existing stack with minimal additions, and provide immediate daily value.

#### 1.1 Deal Scoring Engine
- **Impact:** 5 -- Every pipeline review is faster and more accurate
- **Feasibility:** 5 -- Pure TypeScript, no external APIs, no new tables beyond `deal_scores`
- **Cost:** 5 -- $0/month (no AI models needed)
- **Time to value:** 5 -- Functional in 2-3 days
- **Total: 20/20**

Implement the rules-based scoring function described in Section 1.2. Add `deal_scores` table. Compute on engagement create/update and daily cron. Display as colored badge on pipeline cards.

#### 1.2 Next Best Action Suggestions (Template-Based)
- **Impact:** 5 -- Replaces the mental load of "what should I do next?"
- **Feasibility:** 5 -- SQL queries + template strings, no LLM needed
- **Cost:** 5 -- $0/month
- **Time to value:** 5 -- Functional in 2-3 days
- **Total: 20/20**

Implement the condition-based trigger system from Section 1.2. Check conditions on interaction create and daily cron. Write suggestions to `ai_suggestions` table. Display on dashboard.

#### 1.3 Meeting Prep Briefs (Template-Based)
- **Impact:** 4 -- Saves 15+ minutes per meeting
- **Feasibility:** 5 -- SQL queries + string templates, optional LLM for talking points
- **Cost:** 5 -- $0 without LLM, ~$0.10/month with LLM enhancement
- **Time to value:** 5 -- Functional in 2 days
- **Total: 19/20**

Query engagement context (recent interactions, open actions, deal metadata) for tomorrow's meetings (from `calendarEvents`). Generate brief as structured text. Display on dashboard and engagement detail page.

#### 1.4 Semantic Search (Embedding Pipeline)
- **Impact:** 4 -- Eliminates "where did we discuss that?" moments
- **Feasibility:** 4 -- Requires pgvector setup + OpenAI API key, but straightforward
- **Cost:** 5 -- ~$0.01/month at current volume
- **Time to value:** 4 -- Functional in 3-5 days (need to backfill existing content)
- **Total: 17/20**

Enable pgvector on Supabase. Create `content_embeddings` table. Build embedding pipeline for new interactions and documents. Backfill existing content. Add semantic search to command palette.

---

### Phase 2: High Impact (2-4 weeks each)

These features need more engineering effort and external service integration but transform the workflow significantly.

#### 2.1 Meeting Transcription and Extraction
- **Impact:** 5 -- Automates the most tedious agency task
- **Feasibility:** 3 -- Requires AssemblyAI integration, webhook handling, LLM extraction
- **Cost:** 3 -- ~$16.50/month for AssemblyAI + ~$0.20 for extraction
- **Time to value:** 3 -- 2-3 weeks to build and test
- **Total: 14/20**

Full pipeline from Section 1.1. Upload audio, transcribe with AssemblyAI, extract with Claude, write to database. Show transcript and summary on engagement timeline.

#### 2.2 Email Draft Generation
- **Impact:** 4 -- Saves 30+ minutes per day on email composition
- **Feasibility:** 4 -- Requires Anthropic API integration and streaming UI
- **Cost:** 5 -- ~$0.05/month
- **Time to value:** 4 -- 1-2 weeks
- **Total: 17/20**

Build the draft generation modal from Section 1.3. Use Claude Haiku for drafts. Stream response. Allow user to edit before copying to email client.

#### 2.3 Conversational Query Interface ("Ask STRVX")
- **Impact:** 4 -- Natural language access to all business data
- **Feasibility:** 3 -- Requires combining semantic search + LLM synthesis + pre-built analytics
- **Cost:** 4 -- ~$0.50/month
- **Time to value:** 3 -- 2-3 weeks
- **Total: 14/20**

Extend the command palette to handle natural language queries. Route to semantic search for knowledge queries, to pre-built functions for analytics queries. Synthesize answers with LLM.

#### 2.4 Churn Risk Prediction
- **Impact:** 4 -- Prevents losing maintenance revenue
- **Feasibility:** 4 -- Extension of deal scoring logic for maintain-stage engagements
- **Cost:** 5 -- $0/month (rules-based)
- **Time to value:** 4 -- 1 week
- **Total: 17/20**

Build maintenance health scoring (separate from deal scoring). Surface at-risk maintenance clients on dashboard with specific risk signals.

#### 2.5 Auto-Tagging and Content Classification
- **Impact:** 3 -- Improves search and filtering, but not daily-driver
- **Feasibility:** 4 -- Piggybacks on embedding pipeline
- **Cost:** 4 -- ~$0.50/month (Haiku for classification)
- **Time to value:** 4 -- 1 week (after semantic search is live)
- **Total: 15/20**

Run classification on interaction create. Extract topics, sentiment, and category. Store in `ai_metadata` jsonb column. Enable filtering timeline by topic/sentiment.

---

### Phase 3: Moonshots (1-3 months each)

These features are ambitious, require significant investment, and differentiate STRVX's capabilities well beyond typical agencies.

#### 3.1 Proposal Generation Engine
- **Impact:** 5 -- Turns a 4-hour task into a 30-minute review
- **Feasibility:** 3 -- Requires template system, multi-section generation, rich text output
- **Cost:** 4 -- ~$1/month (Sonnet for long-form generation)
- **Time to value:** 2 -- 3-4 weeks minimum
- **Total: 14/20**

Build template-based proposal generation that synthesizes engagement history, discussion topics, and scope into a structured proposal document. Output to Tiptap editor for review.

#### 3.2 Weekly AI Business Report
- **Impact:** 4 -- Automated executive summary
- **Feasibility:** 4 -- Aggregation queries + LLM synthesis
- **Cost:** 5 -- ~$0.10/month
- **Time to value:** 3 -- 1-2 weeks
- **Total: 16/20**

Scheduled weekly job that aggregates all metrics, generates narrative summary, and stores as document. Optionally email or post to Slack.

#### 3.3 Natural Language Analytics (Text-to-SQL)
- **Impact:** 3 -- Cool but pre-built analytics covers 90% of needs
- **Feasibility:** 2 -- Text-to-SQL is error-prone, requires safety guardrails
- **Cost:** 4 -- ~$0.50/month
- **Time to value:** 2 -- 3-4 weeks
- **Total: 11/20**

Full text-to-SQL with safety constraints. Only pursue after the function-calling analytics approach (Phase 2.3) proves insufficient.

#### 3.4 Voice Command Interface
- **Impact:** 3 -- Hands-free CRM updates during driving/walking
- **Feasibility:** 2 -- Requires speech-to-text + NLU + action mapping
- **Cost:** 3 -- ~$5/month (real-time transcription)
- **Time to value:** 2 -- 4+ weeks
- **Total: 10/20**

"Hey STRVX, add a note for Meridian Labs: Sarah loved the demo, wants to schedule a follow-up." Transcribe, extract intent, map to action, execute.

#### 3.5 Autonomous Follow-Up Agent
- **Impact:** 5 -- The ultimate automation: AI that acts, not just suggests
- **Feasibility:** 1 -- Requires trust framework, approval workflow, email integration
- **Cost:** 3 -- Variable (depends on volume)
- **Time to value:** 1 -- 2+ months
- **Total: 10/20**

An agent that drafts and sends follow-up emails, schedules meetings, and updates the CRM -- with human approval in the loop. This is the endgame: the tool that runs itself. Only build this after 6+ months of AI feature usage establishes trust in the system's judgment.

---

### Implementation Order Summary

```
Phase 1 (Weeks 1-4):
  [Week 1-2] Deal Scoring Engine + Next Best Action Suggestions
  [Week 2-3] Meeting Prep Briefs
  [Week 3-4] Semantic Search Pipeline

Phase 2 (Weeks 5-12):
  [Week 5-7] Meeting Transcription + Extraction
  [Week 7-8] Churn Risk Prediction
  [Week 8-10] Email Draft Generation
  [Week 10-12] Conversational Query Interface + Auto-Tagging

Phase 3 (Months 4-6):
  [Month 4] Weekly AI Business Report
  [Month 4-5] Proposal Generation Engine
  [Month 5-6] Natural Language Analytics
  [Month 6+] Voice Commands + Autonomous Agent (evaluate need)
```

### Infrastructure Prerequisites (do these before Phase 1)

1. **Anthropic API key** in environment variables.
2. **OpenAI API key** for embeddings (or switch to Anthropic embeddings when available).
3. **Enable pgvector** on Supabase project (`CREATE EXTENSION vector`).
4. **Create new database tables** (`ai_generations`, `ai_suggestions`, `content_embeddings`, `deal_scores`).
5. **Add columns** to `interactions` (`transcript_url`, `ai_summary`, `ai_metadata`) and `engagements` (`ai_enabled`).
6. **Create `src/lib/ai/` directory** with config, cost tracker, and shared utilities.

### Cost Summary

| Phase | Monthly AI Cost | Engineering Time |
|-------|----------------|-----------------|
| Phase 1 | ~$0.01 | 3-4 weeks (one person) |
| Phase 2 | ~$17.50 | 6-8 weeks (one person) |
| Phase 3 | ~$20.00 | 8-12 weeks (one person) |
| **Steady state** | **~$20-40/month** | Maintenance only |

The entire AI layer costs less than a single lunch per month. The time savings are worth 40+ hours per week across the team. The ROI is not even close.

---

## Appendix A: Prompt Library (Key Templates)

### Meeting Extraction Prompt

```
You are analyzing a meeting transcript for STRVX, a software agency.

Engagement context:
- Company: {{company_name}}
- Project: {{engagement_name}}
- Stage: {{stage}}
- Open action items: {{open_actions}}

Extract the following from the transcript:

1. summary: A 2-3 sentence overview of what was discussed (max 200 words)
2. decisions: Array of {decision, decided_by, context}
3. action_items: Array of {owner, description, suggested_due_date}
4. questions: Array of {question, asked_by, answered: boolean, answer?: string}
5. key_topics: Array of strings (max 5)
6. sentiment: "positive" | "neutral" | "negative"
7. next_meeting_suggested: boolean

Return valid JSON only. No markdown, no explanation.
```

### Email Draft Prompt

```
Draft an email from {{sender_name}} at STRVX to {{recipient_name}} ({{recipient_role}} at {{company_name}}).

Context:
- Engagement: {{engagement_name}} (stage: {{stage}})
- Last interaction ({{days_ago}} days ago): {{last_interaction_summary}}
- Open items: {{open_actions_list}}
- Deal value: {{deal_value}}

User's request: {{user_prompt}}

Rules:
- Professional but warm tone
- No corporate jargon or filler phrases
- Under 200 words
- End with a clear call to action
- Do not include a subject line unless specifically asked
```

### Conversational Query Synthesis Prompt

```
Answer the user's question using ONLY the provided context documents.
If the answer is not in the context, say "I couldn't find information about that in the engagement history."

Always cite your sources with the interaction date and type.

Context documents:
{{search_results}}

User question: {{query}}
```

---

## Appendix B: Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM hallucination in meeting extraction | Medium | High (wrong action items created) | Always show AI output for human review before database write. "Approve" button for auto-created tasks. |
| API cost overrun | Low | Low ($20/month baseline) | Token budgets per feature, cost tracking dashboard, alerts at 2x baseline. |
| Embedding drift (model update changes vectors) | Low | Medium (search quality degrades) | Version embeddings. When model changes, backfill in background. |
| AssemblyAI downtime | Low | Medium (meetings not transcribed) | Queue failed jobs for retry. Manual upload fallback. |
| Privacy incident (client data sent to LLM) | Low | High (trust damage) | PII redaction for transcripts. Minimum context for LLM calls. Audit trail. |
| Feature creep / over-engineering | Medium | Medium (time waste) | Strict phase gates. Ship Phase 1 before designing Phase 2 in detail. |
| User trust in AI suggestions | Medium | Medium (features ignored) | Start with template-based suggestions (predictable). Graduate to LLM. Always show reasoning. |
