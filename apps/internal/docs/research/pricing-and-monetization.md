# STRVX Pricing and Monetization Strategy

**Date:** 2026-03-30
**Status:** Research document -- living reference for pricing decisions

---

## Table of Contents

1. [Agency Pricing Models](#1-agency-pricing-models)
2. [Revenue Optimization](#2-revenue-optimization)
3. [Productization of the Tool](#3-productization-of-the-tool)
4. [Revenue Diversification](#4-revenue-diversification)
5. [Financial Modeling](#5-financial-modeling)

---

## 1. Agency Pricing Models

### 1.1 Model Comparison

| Model | Description | Best For | Risk Profile |
|-------|-------------|----------|-------------|
| **Fixed Project** | Single price for defined scope | Well-scoped MVPs, landing pages | Scope creep eats margin |
| **Retainer** | Monthly fee for ongoing access | Maintenance clients, strategic partners | Predictable but caps upside |
| **Hybrid** | Project fee + monthly retainer | AI products (build + iterate) | Best of both, harder to sell |
| **Value-Based** | Priced on business impact | High-ROI AI automations | Highest margin, requires trust |
| **Time & Materials** | Hourly/daily rate | Discovery phases, R&D | Low risk, low margin ceiling |

### 1.2 Recommended Model for STRVX: Hybrid with Value Anchoring

The schema already models this well. The `engagements` table has `dealValue` for the project component and `maintenanceMonthlyFee` for the retainer tail. The pipeline stages (`building_mvp` -> `build` -> `deliver` -> `maintain`) reflect the natural lifecycle.

**Structure each deal as:**

1. **Discovery & Scoping** (paid, not free): $3,000-$8,000 flat fee. This is the `discovery` stage. Produces a detailed spec, architecture document, and timeline. If the client proceeds, this fee rolls into the project total. If not, STRVX keeps it for the work done. Never do discovery for free -- it filters out tire-kickers and establishes the relationship as professional from day one.

2. **Project Build** (fixed price): $25,000-$150,000+ depending on complexity. This is the `build` -> `deliver` arc. AI projects command premium pricing because (a) the talent pool is shallow, (b) the business impact is outsized, and (c) clients cannot easily evaluate whether the price is "fair" against traditional software benchmarks. Use this information asymmetry ethically by anchoring on value delivered, not hours spent.

3. **Maintenance Retainer** (monthly): $2,000-$8,000/month. This is the `maintain` stage with `maintenanceOptedIn`, `maintenanceMonthlyFee`, and `maintenanceNextCheckin` fields already in the schema. Covers model monitoring, prompt tuning, data pipeline health, bug fixes, and minor feature additions. AI products genuinely require ongoing maintenance -- models drift, APIs deprecate, data distributions shift. This is not an upsell gimmick; it is a real necessity.

### 1.3 Value-Based Pricing for AI Projects

AI projects are uniquely suited to value-based pricing because the ROI is often measurable and dramatic. A chatbot that deflects 40% of support tickets has a calculable dollar value. An automation that replaces 3 hours of daily manual work has a clear payback period.

**The value-pricing framework:**

1. **Quantify the current cost** of the problem. How much does the client spend today? How many hours? How many errors? What revenue is left on the table?

2. **Estimate the improvement.** Be conservative. If you think the AI will save 50%, quote 30%. Under-promise, over-deliver.

3. **Price at 10-25% of first-year value.** If the project saves the client $500K/year, a $75K-$125K build fee is easily justified. The client gets 4-10x ROI in year one.

4. **Add performance bonuses for moonshot projects.** "Base fee of $60K, plus $20K bonus if the system achieves >95% accuracy in production." This aligns incentives and lets STRVX capture upside.

**Anchor prices to business outcomes, not to hours or features.** Never quote "80 hours at $200/hr." Quote "$45,000 to build an AI system that will reduce your manual review time by 60%, saving approximately $180,000 annually."

### 1.4 How Other AI Agencies Price Their Work (2025-2026 Benchmarks)

| Agency Type | Typical Project Range | Typical Retainer | Notes |
|-------------|----------------------|------------------|-------|
| **Boutique AI studios (2-5 people)** | $30K-$120K | $3K-$8K/mo | Comparable to STRVX |
| **Mid-size AI consultancies (10-30)** | $75K-$500K | $10K-$25K/mo | Enterprise clients, longer sales cycles |
| **Big consulting (Deloitte, Accenture)** | $500K-$5M+ | $50K-$200K/mo | Mostly strategy, outsource the build |
| **Freelance AI engineers** | $10K-$50K | $2K-$5K/mo | STRVX's competitive floor |
| **No-code AI agencies** | $5K-$30K | $500-$2K/mo | Low-end, template-based |

STRVX sits in the boutique AI studio tier. The differentiation is speed, quality, and the fact that a 3-person team with senior talent can outperform a 15-person team with junior staff. Price accordingly -- never race to the bottom against freelancers.

### 1.5 Pricing Calculator Considerations

A pricing calculator for STRVX proposals should factor in:

**Inputs:**
- Project type (MVP, full build, redesign, integration, AI automation)
- Estimated complexity (simple, moderate, complex, R&D-heavy)
- Number of AI models/integrations
- Data pipeline requirements (none, simple, complex)
- Third-party API integrations count
- Timeline pressure (normal, accelerated, urgent)
- Maintenance required (yes/no, estimated monthly hours)

**Multipliers:**
- AI complexity premium: 1.3x-2.0x over equivalent non-AI work
- Urgency premium: 1.25x for 50% timeline compression, 1.5x for more
- Regulatory/compliance premium: 1.2x-1.5x for healthcare, finance, legal
- Enterprise integration premium: 1.3x for SSO, audit logs, SLAs

**Outputs:**
- Recommended project fee (range: low/mid/high)
- Recommended monthly retainer
- Estimated ROI for client (for proposal deck)
- Break-even timeline for client

This calculator could live as a feature inside the STRVX tool itself -- tied to the `engagements` and `invoices` tables.

---

## 2. Revenue Optimization

### 2.1 Increasing Deal Sizes

**Strategy 1: Sell the outcome, not the feature list.** Instead of "We will build a chatbot," sell "We will reduce your customer support costs by 40% within 6 months." The former sounds like a $20K project. The latter sounds like a $100K investment.

**Strategy 2: Bundle discovery into larger engagements.** The paid discovery phase should naturally lead to a larger scope than the client initially imagined. During discovery, identify adjacent problems that AI can solve. Present a phased roadmap where Phase 1 is the original ask and Phases 2-4 are expansions. This increases the total contract value from $40K to $120K+ while giving the client a clear path.

**Strategy 3: Include 6-12 months of maintenance in the initial quote.** Instead of "$50K for the build," quote "$50K + $4K/mo for 12 months = $98K total." The client sees a complete solution, STRVX gets guaranteed recurring revenue, and the deal size nearly doubles. The schema already supports this with the maintenance fields.

**Strategy 4: Position AI monitoring as non-optional.** AI systems are not "set and forget." Model performance degrades, APIs change, data distributions shift. Frame maintenance not as an optional add-on but as a fundamental part of responsible AI deployment. Clients who skip maintenance will call back in 6 months with a broken system and a bad taste -- better to price it in upfront.

**Strategy 5: Offer a "strategic AI audit" as an entry point for large organizations.** Charge $10K-$25K to audit a company's operations and identify the top 5 AI opportunities ranked by ROI. This positions STRVX as a trusted advisor and creates a pipeline of follow-on projects.

### 2.2 The Upselling Path

The STRVX pipeline stages already encode the natural upselling path:

```
lead -> contacted -> discovery ($3K-$8K)
  -> proposal -> negotiation
    -> build ($25K-$150K)
      -> deliver
        -> maintain ($2K-$8K/mo, ongoing)
```

**Beyond the initial lifecycle:**

1. **MVP to Full Build:** "The MVP validated the concept. Here's the roadmap for production-grade: auth, monitoring, scaling, admin dashboard. $80K."

2. **Full Build to Expansion:** "Usage data shows your users want X and Y. Phase 2 adds those features plus performance optimization. $60K."

3. **Maintenance to Strategic Partnership:** "We've been maintaining your AI systems for 6 months. We see 3 opportunities to expand AI across your operations. Let's discuss a strategic retainer." $8K-$15K/mo.

4. **Single Project to Multi-Project:** "The sales AI worked. Your marketing team has the same data problem. We can build the marketing version for 40% less since the infrastructure exists."

5. **Client to Referral Source:** Happy clients bring new clients. Formalize this with a 5-10% referral fee or a mutual introduction program.

### 2.3 When to Say No to Clients

Saying no is a pricing decision. Every hour spent on a bad client is an hour not spent on a great one.

**Say no when:**

- **The budget is below $15K for a custom AI project.** Below this threshold, the overhead of client management, scoping, and communication eats the margin. Redirect to templates, playbooks, or partner freelancers.

- **The client wants to own the AI methodology.** STRVX's value is in its process, not just its code. Work-for-hire on commodity projects commoditizes STRVX. Retain IP rights to frameworks and internal tooling.

- **The timeline is unrealistic and the client won't pay the urgency premium.** "I need this in 2 weeks" at a normal-timeline price means 80-hour weeks and burned-out team members. Either charge 1.5x or decline.

- **The client cannot articulate the problem.** "We want AI" is not a brief. If discovery calls reveal that the client has no clear problem, no data, and no success criteria, the project will fail regardless of execution quality. Walk away or sell them a paid discovery engagement first.

- **Red flags in the sales process.** Clients who haggle aggressively on discovery fees, demand spec work for free, miss meetings, or have had 3+ agencies fail before them are telling you something. Listen.

- **The project would consume >50% of team capacity for >3 months.** Concentration risk. If that client churns or delays payment, STRVX is in trouble. Maintain portfolio diversification.

### 2.4 Optimal Client Portfolio

For a 3-person agency, the ideal portfolio at any given time:

| Slot | Type | Revenue | Capacity | Notes |
|------|------|---------|----------|-------|
| 1 | Active build (large) | $60K-$150K | 50-60% | Primary project |
| 2 | Active build (small) or discovery | $15K-$40K | 20-30% | Secondary project |
| 3-5 | Maintenance retainers | $6K-$24K/mo total | 10-20% | 3-5 clients at $2K-$8K each |
| 6 | Internal/product work | $0 (investment) | 5-10% | Tool development, content, sales |

**Target: 3-5 active revenue relationships at all times.** Never go below 2 (concentration risk) or above 7 (quality suffers).

### 2.5 Revenue Targets for a 3-Person Agency

**Baseline assumptions:**
- 3 full-time team members
- ~220 billable days per year per person (accounting for sales, admin, PTO)
- 65-75% utilization rate (industry standard for small agencies)
- Blended effective rate target: $200-$350/hr equivalent

**Annual revenue targets by stage:**

| Stage | Annual Revenue | Monthly Revenue | Notes |
|-------|---------------|-----------------|-------|
| **Survival** | $300K-$450K | $25K-$37.5K | Covers salaries + expenses, no growth |
| **Stable** | $500K-$750K | $42K-$62.5K | Comfortable margins, can invest in tooling |
| **Thriving** | $750K-$1.2M | $62.5K-$100K | Can hire #4, build product, attend events |
| **Scaling** | $1.2M-$2M | $100K-$167K | Signals readiness to grow to 5-7 people |

**The math on maintenance revenue:** If STRVX maintains 5 clients at an average of $5K/mo, that is $25K/mo or $300K/year in recurring revenue. This alone covers the "Survival" tier. Every new project build should target converting into a maintenance client, making the project revenue pure upside for growth and investment.

---

## 3. Productization of the Tool

The STRVX internal tool is a purpose-built agency management platform with CRM, pipeline, project management, outreach, invoicing, finances, goals, marketing, and document management. Based on the schema and sidebar analysis, it covers:

- **CRM:** Companies, contacts, engagements with full pipeline stages, interaction timeline, next actions
- **Outreach:** Prospect management with industry targeting, Apollo integration, touch tracking, multi-channel outreach
- **Project Management:** Projects, tasks with assignees and priorities, calendar events
- **Finance:** Invoices with line items, expenses with categories, recurring expense tracking
- **Goals:** Target tracking with current/target values and deadlines
- **Marketing:** Content calendar with platform targeting and scheduling
- **Knowledge:** Documents, templates, assets, toolbox

This is a genuinely differentiated product. Most CRM tools are built for enterprise sales teams. This is built for small creative/technical agencies.

### 3.1 SaaS Pricing Tier Analysis

**Tier Structure:**

| | Starter | Pro | Agency |
|--|---------|-----|--------|
| **Price** | $29/mo | $79/mo | $199/mo |
| **Annual** | $290/yr (save 17%) | $790/yr (save 17%) | $1,990/yr (save 17%) |
| **Users** | 1-2 | 1-5 | 1-15 |
| **Engagements** | 10 active | 50 active | Unlimited |
| **Prospects** | 100 | 1,000 | Unlimited |
| **Apollo sync** | -- | 500 contacts/mo | 5,000 contacts/mo |
| **Invoices** | 5/mo | 50/mo | Unlimited |
| **Projects** | 3 active | 15 active | Unlimited |
| **Documents** | 50 | 500 | Unlimited |
| **Calendar** | Basic | + Zoom integration | + Team calendar |
| **Goals** | 3 active | 10 active | Unlimited |
| **Marketing** | -- | Basic scheduling | Multi-platform |
| **Export** | CSV | CSV + PDF invoices | Full API access |
| **Support** | Community | Email (48hr) | Priority (4hr) |

**Why these price points:**

- **$29/mo Starter** is impulse-purchase territory for solopreneurs and freelancers. Low enough that there is no approval process needed. Positions against the free tier of Monday.com but with agency-specific features they lack.

- **$79/mo Pro** is the "sweet spot" tier where 70%+ of revenue should come from. A 3-5 person agency paying $79/mo is spending less than the cost of one team lunch. The value is obvious compared to cobbling together Notion + Pipedrive + FreshBooks + Calendly + Apollo.

- **$199/mo Agency** targets 5-15 person agencies that currently spend $500+/mo across multiple tools. The unlimited everything and API access justify the price, and these customers have the lowest churn.

### 3.2 Per-Seat vs. Flat Pricing

**Recommendation: Flat pricing with user bands (as shown above).**

Per-seat pricing ($X/user/month) has become a backlash point in SaaS. Clients resent being penalized for adding team members. It creates perverse incentives to share accounts, which ruins data integrity.

Flat pricing with generous user bands (1-2, 1-5, 1-15) simplifies the purchase decision and encourages full team adoption. The natural upgrade trigger is hitting the user limit, which is a positive signal (the agency is growing) rather than a punitive one.

If STRVX later needs per-seat economics for large agencies (20+), introduce a **Custom/Enterprise** tier at that point with negotiated per-seat pricing.

### 3.3 Feature Gating Strategy

The gating should follow a principle: **gate on scale, not on core functionality.** Every tier should feel complete for its intended user. Never cripple the core experience to force upgrades.

**Gate on scale (good):**
- Number of active engagements
- Number of prospects
- Number of invoices per month
- Number of active projects
- Storage for documents

**Gate on advanced capabilities (acceptable):**
- Apollo integration (Pro+)
- Multi-platform marketing (Agency only)
- API access (Agency only)
- Custom fields (Pro+)
- Advanced reporting/analytics (Pro+)
- Team calendar with sync (Agency)

**Never gate (bad for reputation):**
- Pipeline view / Kanban board
- Basic invoicing
- Contact management
- Task management
- Core search and filtering
- Mobile responsiveness

### 3.4 Free Tier vs. Free Trial

**Recommendation: 14-day free trial of Pro tier. No permanent free tier.**

**Against a free tier:**
- A 3-person company (STRVX, while bootstrapping the product) cannot afford to support free users who consume support resources and infrastructure costs with zero revenue
- Free tiers attract the lowest-quality users who churn fastest and complain loudest
- The tool's value is immediately apparent (it replaces 4-5 other tools) -- a trial is sufficient to demonstrate this
- Free tiers only make sense when the product has network effects or viral loops. A CRM does not

**For the 14-day trial:**
- Full access to Pro tier features
- Pre-populated with sample data so the user sees the tool's capabilities immediately
- Drip email sequence on days 1, 3, 7, 10, 13 highlighting features they haven't tried
- On day 14, downgrade to read-only mode (data preserved) -- convert or export

**Alternative consideration:** A limited free tier with 1 user, 3 engagements, and 1 project could work as a permanent "try it out" option, but only implement this after achieving product-market fit with paying customers.

### 3.5 Annual vs. Monthly Billing Optimization

**Standard approach:** Offer both, with annual billing at ~17% discount (effectively 10 months for the price of 12).

**Key tactics:**

- **Default to annual on the pricing page.** Show annual prices prominently, with monthly as a toggle. Most SaaS companies see 30-50% of customers choose annual when it is the default display.

- **Offer the first month at 50% off for monthly customers.** This reduces the barrier to entry while still capturing full price from month 2 onward.

- **For Agency tier, only offer annual.** At $199/mo, the target customer is a real business. Annual commitment at $1,990 is a rounding error in their budget and provides STRVX with cash flow predictability.

- **Net revenue optimization:** Annual billing at 17% discount still yields higher LTV than monthly because monthly churn typically exceeds the discount. If monthly churn is 8%/mo, expected LTV is ~$988 on the $79 plan. Annual billing at $790/yr guarantees that revenue regardless.

### 3.6 Competitive Pricing Analysis

| Tool | Pricing | Overlap with STRVX Tool | Gap STRVX Fills |
|------|---------|------------------------|-----------------|
| **Monday.com** | $12-$28/seat/mo | Project management, CRM | No invoicing, no outreach, no agency workflow |
| **Pipedrive** | $14-$99/seat/mo | CRM, pipeline | No project management, no invoicing, no outreach |
| **FreshBooks** | $19-$60/mo | Invoicing, expenses | No CRM, no project management |
| **HubSpot** | Free-$1,200/mo | CRM, marketing | Massive overkill for small agencies, expensive |
| **Notion** | $10-$25/seat/mo | Docs, project management | No CRM pipeline, no invoicing, no outreach |
| **Apollo.io** | $49-$119/seat/mo | Outreach, prospecting | No CRM pipeline, no project management |
| **Productive.io** | $11-$28/seat/mo | Agency management | Closest competitor, but enterprise-focused |
| **Scoro** | $26-$63/seat/mo | Agency management | Heavy, enterprise-oriented, expensive |
| **Teamwork** | $10-$25/seat/mo | Project + client mgmt | No invoicing, no outreach |

**STRVX tool's positioning advantage:** It replaces the combination of Pipedrive ($50/mo) + Monday.com ($40/mo) + FreshBooks ($30/mo) + Apollo ($50/mo) + Notion ($25/mo) = **$195/mo minimum** for a 5-person agency. The STRVX Pro tier at $79/mo is an immediate cost savings while providing a unified experience built specifically for agencies.

**Key differentiators to emphasize:**
1. Built by an agency, for agencies (not adapted from enterprise software)
2. AI-native features (eventually: AI-assisted proposal writing, automated follow-ups, predictive pipeline)
3. All-in-one: CRM + projects + finance + outreach in one tool
4. No per-seat penalty -- flat pricing encourages team adoption
5. Opinionated workflow (lead -> discovery -> build -> deliver -> maintain) that guides agencies through best practices

---

## 4. Revenue Diversification

### 4.1 Revenue Streams Matrix

| Stream | Revenue Type | Effort to Launch | Revenue Potential | Timeline |
|--------|-------------|-----------------|-------------------|----------|
| Client projects | Service | Already running | $500K-$1.5M/yr | Now |
| Maintenance retainers | Recurring service | Low (process exists) | $200K-$500K/yr | Now |
| SaaS tool | Product (recurring) | High (6-12 months) | $0 initially, $500K-$2M/yr at scale | 12-24 months |
| Templates & playbooks | Product (one-time) | Medium | $20K-$100K/yr | 3-6 months |
| Training & workshops | Service (scalable) | Medium | $50K-$200K/yr | 3-6 months |
| Affiliate/referral | Passive | Low | $10K-$50K/yr | Now |

### 4.2 Service Revenue (Client Projects) -- The Engine

This is the core. For the foreseeable future, 70-90% of STRVX revenue will come from client project work. The strategies in Section 2 are designed to maximize this.

**Target revenue mix at maturity:**
- 50-60% from project builds
- 25-35% from maintenance retainers
- 10-20% from products and other streams

The maintenance retainer component is critical because it smooths cash flow. Project revenue is lumpy (a $100K deal closes one quarter, nothing the next). Retainer revenue is predictable and compounds over time as each completed project adds another retainer client.

### 4.3 Product Revenue (SaaS Tool)

Covered in depth in Section 3. The key question is timing.

**Do not launch the SaaS product until:**
1. STRVX is using it daily and has worked out the rough edges internally (currently happening)
2. At least 2-3 beta agencies have used it and validated the workflow
3. The agency service revenue is stable enough to fund 3-6 months of product development without jeopardizing cash flow
4. Authentication, multi-tenancy, and billing infrastructure are production-ready

**Revenue trajectory for SaaS (conservative):**

| Month | Customers | MRR | Notes |
|-------|-----------|-----|-------|
| 1-3 | 5-15 | $400-$1,200 | Beta users, friends, network |
| 4-6 | 20-50 | $1,600-$4,000 | Content marketing kicks in |
| 7-12 | 50-150 | $4,000-$12,000 | Product-market fit or pivot |
| 13-24 | 150-500 | $12,000-$40,000 | Growth phase if PMF achieved |
| 25-36 | 500-2,000 | $40,000-$160,000 | Scaling, potential fundraise |

### 4.4 Templates and Playbook Marketplace

STRVX builds the same types of AI products repeatedly. The patterns, architectures, prompt libraries, and deployment playbooks are reusable intellectual property.

**Products to sell:**

1. **AI Project Scoping Template** ($49-$149): A Notion/Google Docs template that walks agencies through discovery, requirements gathering, technical scoping, and proposal generation for AI projects. Based on STRVX's actual process.

2. **AI Agency Pricing Calculator** ($99-$249): Spreadsheet or web tool that helps agencies price AI projects using the value-based framework from Section 1.3. Input the client's problem, output a recommended price range with justification.

3. **Client Onboarding Playbook** ($79-$199): Step-by-step process from signed contract to kickoff meeting to first deliverable. Templates for every email, document, and meeting agenda.

4. **Maintenance Contract Template Pack** ($99-$249): Legal templates for AI maintenance agreements, SLA definitions, monthly reporting templates, incident response procedures.

5. **AI Agency Operations Kit** ($299-$499): The full bundle. Everything above plus team workflows, project management templates, and the financial model.

**Distribution:** Gumroad, Lemon Squeezy, or the STRVX website directly. Marketing through LinkedIn content, Twitter/X threads, and SEO blog posts about agency pricing.

**Revenue estimate:** $2K-$8K/month with minimal ongoing effort once created.

### 4.5 Training and Consulting

STRVX has expertise that other agencies and companies want. Monetize the knowledge, not just the hands.

**Offerings:**

1. **"AI for Agencies" Workshop** ($500-$2,000/person): Half-day or full-day workshop teaching other agencies how to add AI capabilities to their service offering. Topics: how to scope AI projects, build vs. buy decisions, pricing, client education, technical architecture patterns.

2. **Corporate AI Literacy Training** ($5,000-$15,000/engagement): 2-4 hour sessions for leadership teams at mid-size companies. Demystify AI, identify opportunities, set realistic expectations. Often leads to project work.

3. **1:1 Agency Consulting** ($300-$500/hour): For agency founders who want personalized advice on adding AI services, pricing strategy, or technical architecture.

4. **Online Course** ($199-$499, one-time): "Building an AI Agency from Zero" -- evergreen content sold at scale. Record once, sell forever. Host on STRVX's own platform or Teachable/Maven.

### 4.6 Affiliate and Referral Revenue

Low effort, moderate upside.

**Affiliate opportunities:**
- **AI/ML platforms:** OpenAI, Anthropic, AWS, GCP, Vercel -- many have partner/referral programs with revenue share or credits
- **Dev tools:** Supabase, Vercel, Fly.io, PlanetScale -- STRVX uses these and can genuinely recommend them
- **Business tools:** Apollo.io (already integrated), Calendly, Zoom, Stripe -- referral fees on tools STRVX recommends to clients

**Referral program (for inbound leads STRVX cannot serve):**
- When STRVX turns down a project (too small, wrong fit), refer to a vetted partner agency
- Charge a 10% referral fee on the resulting contract
- Builds goodwill, creates a network, and monetizes leads that would otherwise be dead

**Estimated revenue:** $1K-$5K/month, highly variable but essentially free money on top of existing deal flow.

---

## 5. Financial Modeling

### 5.1 Unit Economics for a 3-Person Agency

**Cost structure (annual estimates):**

| Category | Low Estimate | Mid Estimate | High Estimate |
|----------|-------------|-------------|--------------|
| Salaries/draws (3 people) | $240,000 | $360,000 | $480,000 |
| Benefits/taxes (if applicable) | $0 | $40,000 | $80,000 |
| Software & tools | $6,000 | $12,000 | $18,000 |
| Infrastructure (hosting, APIs) | $3,000 | $8,000 | $15,000 |
| Office/coworking | $0 | $6,000 | $18,000 |
| Legal & accounting | $3,000 | $6,000 | $12,000 |
| Marketing & sales | $2,000 | $8,000 | $20,000 |
| Insurance | $2,000 | $4,000 | $6,000 |
| Travel & conferences | $2,000 | $6,000 | $15,000 |
| Miscellaneous (10% buffer) | $25,800 | $45,000 | $66,400 |
| **Total Annual Costs** | **$283,800** | **$495,000** | **$730,400** |

**Key metrics:**

- **Cost per billable hour:** At 65% utilization across 3 people (220 days x 8 hrs x 3 x 0.65 = 3,432 billable hours/year), the cost per hour ranges from $83 (low) to $213 (high). Mid estimate: $144/hr.

- **Target billing rate:** 2.5-3.5x cost rate for healthy margins. This yields $360-$500/hr effective rate, or $200-$350/hr for blended project pricing (accounting for non-billable project management, scoping, and communication time).

- **Gross margin target:** 55-70%. For every $1 of revenue, $0.55-$0.70 should be left after direct project costs (subcontractors, API costs, hosting for client projects).

- **Net margin target:** 25-40%. After all overhead, 25-40 cents of every dollar should be profit/retained earnings.

### 5.2 Break-Even Analysis

**Monthly break-even by cost scenario:**

| Scenario | Monthly Costs | Break-Even Revenue | Break-Even at 60% Margin |
|----------|--------------|-------------------|------------------------|
| Lean | $23,650 | $23,650/mo | $39,417/mo revenue needed |
| Mid | $41,250 | $41,250/mo | $68,750/mo revenue needed |
| Premium | $60,867 | $60,867/mo | $101,444/mo revenue needed |

**What break-even looks like in practice (mid scenario):**
- 1 active project at $50K over 3 months = $16,667/mo
- 1 smaller project at $25K over 2 months = $12,500/mo
- 3 maintenance clients at $4K/mo each = $12,000/mo
- **Total: $41,167/mo** -- break-even achieved

This is achievable and conservative. The maintenance revenue base is the safety net: once STRVX has 5+ maintenance clients, the break-even point is essentially guaranteed even during project dry spells.

### 5.3 Growth Scenarios

#### Scenario A: Stay at 3 (Lifestyle Business)

| Year | Revenue | Net Profit | Per-Person Take-Home | Notes |
|------|---------|-----------|---------------------|-------|
| 1 | $500K | $150K | ~$130K-$170K | Building reputation, 3-4 projects |
| 2 | $700K | $250K | ~$160K-$200K | Repeat clients, maintenance base growing |
| 3 | $900K | $350K | ~$190K-$230K | Premium pricing, strong pipeline |
| 4+ | $1M-$1.2M | $400K-$500K | ~$210K-$270K | Ceiling without hiring |

**Ceiling:** ~$1.2M/year with 3 people. Beyond this requires either hiring or raising prices to the point where clients demand more headcount as proof of capacity.

**Pros:** Maximum flexibility, low overhead, high per-person income, no management burden.
**Cons:** Limited project capacity, vulnerable to team member departure, hard to take on large enterprise contracts.

#### Scenario B: Grow to 5-7 (Small Agency)

| Year | Team Size | Revenue | Net Profit | Notes |
|------|-----------|---------|-----------|-------|
| 1 | 3 | $500K | $150K | Building foundation |
| 2 | 4 | $850K | $250K | First hire (junior/mid engineer) |
| 3 | 5-6 | $1.3M | $380K | Second hire, possibly designer |
| 4 | 6-7 | $1.8M | $500K | Consistent deal flow, 2 concurrent builds |

**When to make the first hire:** When monthly revenue has been consistently above $60K for 3+ months and the pipeline shows 6+ months of projected work. Never hire on a single large deal -- hire on trend.

**Who to hire first:** A mid-level full-stack engineer who can own project delivery with minimal supervision. This frees the founders for sales, architecture, and client relationships. Cost: $90K-$130K/year.

#### Scenario C: Grow to 10+ (Scaling Agency)

| Year | Team Size | Revenue | Net Profit | Notes |
|------|-----------|---------|-----------|-------|
| 1-2 | 3-4 | $500K-$850K | $150K-$250K | Foundation |
| 3 | 6-7 | $1.5M | $400K | Adding project managers |
| 4 | 8-10 | $2.5M | $600K | Multiple concurrent projects |
| 5 | 10-12 | $3.5M-$4M | $800K-$1M | Potential for product revenue too |

**This path requires:**
- A dedicated sales/BD function by team size 6
- Project management layer (cannot have founders managing every project)
- Documented processes and playbooks (the STRVX tool becomes critical infrastructure)
- Larger office or structured remote work
- Real HR/ops support by team size 8+

### 5.4 When to Hire (Revenue Thresholds)

| Hire | Revenue Trigger | Cash Reserve Needed | Role |
|------|----------------|-------------------|------|
| #4 | $60K/mo sustained, 6-month pipeline | 6 months of new salary ($45K-$65K) | Mid-level engineer |
| #5 | $100K/mo sustained | 6 months of new salary | Senior engineer or designer |
| #6 | $130K/mo sustained | 6 months of new salary | Project manager or ops |
| #7-8 | $180K/mo sustained | 3 months per hire | Specialists as needed |
| #9-10 | $250K/mo sustained | 3 months per hire | Consider sales hire |

**The cash reserve rule is non-negotiable.** Before making any hire, STRVX should have enough cash in the bank to pay that person's salary for 6 months even if revenue dropped to zero. This prevents panic-firing during a dry spell and gives enough runway to course-correct.

**Contractor bridge strategy:** Before committing to a full-time hire, bring on a contractor for 2-3 months on a specific project. If the work justifies the headcount and the person is a good fit, convert to full-time. Lower risk, faster to deploy.

### 5.5 Cash Flow Management for Project-Based Work

Project-based revenue is inherently lumpy. A $100K deal might pay $40K upfront, $30K at midpoint, and $30K on delivery -- with 2-month gaps between milestones. Meanwhile, payroll is due every two weeks.

**Cash flow rules:**

1. **Payment structure for all projects:**
   - 40% upfront (non-refundable, covers project kickoff and initial development)
   - 30% at midpoint milestone (clearly defined deliverable)
   - 30% on final delivery
   - For projects over $100K, add a 4th milestone at 25/25/25/25

2. **Maintenance retainers bill on the 1st, due on the 15th.** Always bill in advance, never in arrears. The schema's `maintenanceNextCheckin` field should also be used to trigger invoice generation.

3. **Maintain a cash reserve of 3-6 months of operating expenses.** At the mid cost scenario ($41K/mo), this means $123K-$246K in liquid reserves. Build this before taking distributions or making hires.

4. **Invoice immediately upon milestone completion.** Do not wait. Every day of delay is a day added to the collection cycle. The `invoices` table with `issuedDate` and `dueDate` should be used to track this rigorously.

5. **Net-15 payment terms standard, Net-30 maximum.** Never agree to Net-60 or Net-90. Small agencies cannot float large enterprise payment cycles. If a client insists on Net-60, price in a 5% late-payment premium.

6. **Track the "cash runway" metric weekly.** Cash in bank divided by monthly burn rate. If this drops below 3 months, freeze hiring and non-essential spending immediately.

7. **Seasonal planning.** Q4 (October-December) and Q1 (January-February) are historically slow for agency new business. Plan for this by closing larger deals in Q2-Q3 that span into Q4, and by ensuring maintenance revenue covers the minimum during slow months.

**Cash flow projection model:**

```
Monthly Cash Position =
  Opening Balance
  + Project milestone payments received
  + Maintenance retainer payments received
  + Product/template revenue
  - Payroll
  - Software & infrastructure
  - Overhead
  - Tax reserves (set aside 25-30% of profit monthly)
  = Closing Balance
```

The `expenses` table (with `recurring` flag) and `invoices` table (with `status`, `issuedDate`, `dueDate`, `paidDate`) already provide the data foundation for this model. Building a cash flow dashboard into the STRVX tool should be a priority feature.

---

## Summary: The STRVX Pricing Playbook

### Immediate Actions (This Quarter)

1. Standardize every engagement with the hybrid model: paid discovery + fixed project + maintenance retainer
2. Set a floor of $15K for any custom AI project
3. Build the pricing calculator into the internal tool (tied to engagements table)
4. Start tracking `maintenanceMonthlyFee` and `maintenanceNextCheckin` religiously for all delivered projects
5. Implement 40/30/30 payment milestones for all new contracts

### Medium-Term (Next 2-3 Quarters)

6. Create and sell 2-3 templates/playbooks ($5K-$10K/quarter passive revenue)
7. Launch the first paid workshop or training session
8. Begin beta-testing the tool with 2-3 friendly agencies
9. Formalize the referral program (inbound and outbound)

### Long-Term (6-18 Months)

10. Launch the SaaS product (if beta validates demand)
11. Build the cash reserve to 6 months before making hire #4
12. Evaluate growth scenario: stay at 3 or begin scaling
13. Consider strategic AI audit offering as a top-of-funnel product

### The One Number That Matters Most

**Monthly Recurring Revenue from maintenance retainers.** This is the foundation. Every project should convert into a retainer. The day STRVX hits $30K/mo in maintenance revenue is the day the business becomes fundamentally stable -- everything else is growth capital.
