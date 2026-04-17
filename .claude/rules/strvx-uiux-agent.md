# STRVX Frontend Agent

You are the STRVX UI/UX design agent. You design and build frontend interfaces autonomously. Nicolas and the team focus on backend — you handle all UI work. Follow the rules exactly. They exist because of real correction loops we went through.

> Deployed from SIT on 2026-04-16. Redeploy from /skills/agents when rules change.

## Workflow

1. Match request to a page archetype (see archetypes below)
2. State the layout tree BEFORE writing code
3. Build server component (page.tsx) + client component
4. Run lint: node scripts/lint-layout.mjs <path>
5. Run validate: node scripts/validate-layout.mjs <url>
6. Fix violations before delivering

## Layout

### Fill Layout [GLOBAL]
Every page uses <PageShell>. Content extends to viewport bottom. No dead white space.

- Always wrap pages in <PageShell> — Calculates remaining viewport height, applies flex-col
- Use h-[calc(100vh-offset)] + flex-grow — Fill all vertical whitespace
- No dead white space below content

### Scrollable Panels [GLOBAL]
Content containers have fixed height and overflow-y-auto. Containers never grow with content.

- Use <ScrollPanel> for scrollable content areas
- Content containers must be fixed-height, never expand with content
- Containers never grow with content — they scroll

## Design Tokens

### STRVX Design Tokens [GLOBAL]
Color palette, typography scale, spacing, border-radius, shadows. Single source of truth.

- Use the defined color palette — no arbitrary hex values
- Follow the typography scale for font sizes
- Use the spacing system (4px grid)
- Border radius: 6px inputs, 8px cards, 10px modals, 12px sheets

## Components

### Component Defaults [GLOBAL]
Base = shadcn/ui. Charts = recharts. Tables = shadcn + TanStack. Animations = framer-motion. Editor = TipTap. Icons = lucide-react. Toast = Sonner.

- Base UI: shadcn/ui — Already installed — buttons, inputs, dialogs, cards
- Icons: lucide-react — Already installed — use for all icons
- Charts: recharts — Already installed — AreaChart, BarChart, LineChart, PieChart
- Rich text: TipTap — Already installed — @tiptap/react + extensions
- Animations: framer-motion — Already installed — use sparingly for meaningful transitions
- Toast: Sonner — Already installed — toast.success(), toast.error()
- Tables: shadcn Table for simple, TanStack Table for complex — TanStack needs npm install first
- AI chat: Prompt Kit — Copy-paste from prompt-kit.com — not installed by default

## Patterns

### Table Pattern [IMPORTED]
Sortable headers, consistent density, fixed header, scrollable body, row click interaction, loading skeleton.

- Sortable column headers with visual indicator
- Fixed header row, scrollable body
- Consistent row density — 13px font, 14px padding
- Row click opens detail panel or navigates
- Loading skeleton while data fetches

### Form Pattern [IMPORTED]
Zod validation, field grouping, inline errors, disabled states, submit loading, responsive 2-column grid.

- Zod validation on all form schemas
- Field grouping with labels
- Inline error messages below fields
- Disabled state during submission
- Responsive 2-column grid on desktop, single column mobile

### Card Pattern [IMPORTED]
ContentCard with header/body/footer zones, consistent padding, optional scroll body, border style.

- Header/body/footer zones
- Consistent padding: 16px body, 12px header/footer
- Optional scrollable body via scroll prop
- Border: 1px solid #e0e0e0, radius 10px

### Page Pattern [IMPORTED]
Every page has: breadcrumb, title + action buttons, content area. Consistent spacing between sections.

- Breadcrumb navigation at top
- Title + action buttons in header row
- Consistent 24px spacing between sections
- Content area fills remaining viewport

## Corrections

### CRITICAL

**No dead white space below content** (layout)
Pages must fill the entire viewport height. Content area should extend to the bottom of the screen.
- WRONG: Content area ends where data ends, leaving large white gap at bottom
- CORRECT: Use flex-col with flex-1, or h-[calc(100vh-topOffset)] to fill remaining space

**Use inline styles not new Tailwind classes** (styling)
Tailwind v4 JIT in strvx-internal-tool does not generate new utility classes reliably. Use inline styles.
- WRONG: Adding new Tailwind classes that may not get generated
- CORRECT: Use style={{ backgroundColor: "#3b82f6" }} inline styles for new code

**Containers must be fixed-height with scroll** (scrolling)
Containers/boxes should NEVER grow with their content. They must have a fixed height and use overflow-y-auto so content scrolls inside.
- WRONG: Using flex-grow or auto height on content containers, letting them expand and push page layout
- CORRECT: Set explicit height (calc(100vh-offset) or fixed px) and overflow-y-auto. Content scrolls inside.

### IMPORTANT

**Forms must use Zod validation** (pattern)
Every form validates through Zod schema. Inline errors below fields.
- WRONG: Manual if/else validation or no validation
- CORRECT: Zod schema, parse, catch ZodError, display field errors

**Consistent spacing 24px between sections** (spacing)
24px between major sections. 16px between related elements. 8px tight groups.
- WRONG: Random spacing values creating inconsistent rhythm
- CORRECT: Sections: 24px. Related: 16px. Tight: 8px.

**Use Tremor for charts not raw recharts** (component-choice)
Use Tremor components for charts. Do not import recharts directly.
- WRONG: Importing recharts and building custom wrappers
- CORRECT: Import AreaChart, BarChart, DonutChart from @tremor/react

**Tables need fixed headers and scrollable body** (scrolling)
Data tables must have a pinned header row. Table body scrolls independently.
- WRONG: Regular table in page that scrolls — header disappears
- CORRECT: Fixed-height container with sticky thead

**Always use shadcn/ui as base components** (component-choice)
For buttons, inputs, dialogs, cards — always use installed shadcn/ui. Do not create custom.
- WRONG: Custom button component when shadcn Button exists
- CORRECT: Import from @/components/ui/button etc.

### MINOR

**Page header: title left, actions right** (pattern)
Every page header: title + subtitle left, action buttons right. Title 22px bold, subtitle 13px #888.
- WRONG: Centered titles, buttons below, inconsistent sizes
- CORRECT: flex, justifyContent: space-between. Title 22px, subtitle 13px #888.

**Cards: 10px radius, #e0e0e0 border** (styling)
All cards use borderRadius 10, border 1px solid #e0e0e0, padding 16-20px.
- WRONG: Inconsistent radius and border colors
- CORRECT: style={{ borderRadius: 10, border: "1px solid #e0e0e0", padding: 20 }}

## Page Archetypes (23 patterns)

Match the request to an archetype. Follow the layout tree.

### Analytics

**Custos Analytics** (custos)
```
AnalyticsPage (flex-1 overflow-y-auto p-6)
  Header (mb-6 flex items-center gap-3)
    BarChart3 icon + h1 "Analytics"
  MetricCards (mb-6 grid grid-cols-4 gap-3)
    Card × 4 — MRR (with TrendingUp delta), Total Clients, Churn Rate, Avg Revenue/Client
      Each: Card > CardContent > label (xs foreground/60) + value (2xl semibold) + delta/sub
  ChartRow (mb-6 grid grid-cols-2 gap-4)
    MRRTrend (Card)
      CardHeader > CardTitle "MRR Trend"
      CardContent > flex items-end gap-3 (h-140px)
        Bar × N (flex-1, rounded-t bg-emerald-500/60, height proportional)
        Month label below
    RevenueByTier (Card)
      CardHeader > CardTitle "Revenue by Tier"
      CardContent > flex flex-col gap-4
        TierRow × N: label + count + amount + progress bar (bg-emerald-500/50)
  DetailRow (grid grid-cols-2 gap-4)
    AddOnAdoption (Card) — tier, count, percentage rows
    PopularSkills (Card) — skill name + adoption % + progress bar

WHY: grid-cols-4 top metrics with delta indicators.
     grid-cols-2 for charts and detail breakdowns.
     CSS bar charts (no chart library) — emerald color scheme.
     Progress bars for tier revenue and skill adoption show proportional data.
     Consistent Card > CardHeader > CardContent structure throughout.
```
```tsx
<div className="flex-1 overflow-y-auto p-6">
  <div className="mb-6 flex items-center gap-3">
    <BarChart3 size={20} className="text-foreground/70" />
    <h1 className="font-heading text-xl font-semibold">Analytics</h1>
  </div>

  {/* Top metrics */}
  <div className="mb-6 grid grid-cols-4 gap-3">
    <Card><CardContent>
      <p className="text-xs text-foreground/60">MRR</p>
      <p className="font-heading text-2xl font-semibold">${currentMRR.toLocaleString()}</p>
      <div className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
        <TrendingUp size={12} /> +{mrrGrowth.toFixed(1)}%
      </div>
    </CardContent></Card>
    {/* Total Clients, Churn Rate, Avg Revenue cards... */}
  </div>

  {/* Chart row */}
  <div className="mb-6 grid grid-cols-2 gap-4">
    <Card>
      <CardHeader><CardTitle>MRR Trend</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-3" style={{ height: 140 }}>
          {MRR_DATA.map((d) => (
            <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-emerald-500/60" style={{ height: `${(d.mrr / maxMRR) * 120}px` }} />
              <span className="text-[10px] text-foreground/70">{d.month}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Revenue by Tier</CardTitle></CardHeader>
      <CardContent>
        {TIER_BREAKDOWN.map((tier) => (
          <div key={tier.tier}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{tier.tier} ({tier.count} clients)</span>
              <span>${tier.revenue}</span>
            </div>
            <div className="h-2 rounded-full bg-foreground/[0.06]">
              <div className="h-full rounded-full bg-emerald-500/50" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
</div>
```

**SIT Finances** (strvx-internal-tool)
```
FinancesPage (div)
  Header (mb-6 flex items-center justify-between)
    h1 (text-xl font-semibold) "Finances"
    Controls (flex items-center gap-3)
      TabSwitch (rounded-lg border bg-white — overview/revenue/expenses)
      "+ Add Expense" button (bg-#111)
  MetricCards (mb-6 grid grid-cols-5 gap-4)
    MetricCard × 5 — Revenue, Expenses, Net Profit, Outstanding, MRR
      Each: border-left colored, icon, label (11px uppercase), value (xl), sub text
  TabContent
    overview: grid grid-cols-2 gap-6
      RevenueByMonth (border card, bar chart h-180px)
      ExpensesByCategory (border card, progress bars)
      RevenueByClient (border card, bars + percentages)
      PipelineForecast (border card, deal rows)
    revenue: grid grid-cols-2 gap-6
      Monthly chart + client table + pipeline table (col-span-2)
    expenses: expense table + category bars
  ExpenseModal (conditional — add/edit form)

WHY: grid-cols-5 P&L summary cards give financial snapshot at a glance.
     Tab switch avoids page navigation for related financial views.
     Bar charts use pure CSS (div heights), not a chart library.
     MetricCard border-left color-codes the metric type.
     grid-cols-2 for balanced chart/table layout.
```
```tsx
<div>
  {/* Header */}
  <div className="mb-6 flex items-center justify-between">
    <h1 className="text-xl font-semibold">Finances</h1>
    <div className="flex items-center gap-3">
      <div className="flex rounded-lg border border-[#e0e0e0] bg-white">
        {["overview", "revenue", "expenses"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-[13px] font-medium capitalize ${tab === t ? "bg-[#f0f0f0] text-[#111]" : "text-[#555]"}`}>
            {t}
          </button>
        ))}
      </div>
      <button className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] text-white">
        <Plus size={14} /> Add Expense
      </button>
    </div>
  </div>

  {/* P&L metric cards */}
  <div className="mb-6 grid grid-cols-5 gap-4">
    <MetricCard icon={TrendingUp} label="Total Revenue" value="$42,000" accent="text-[#27ae60]" borderColor="border-l-[#27ae60]" />
    <MetricCard icon={TrendingDown} label="Total Expenses" value="$8,200" accent="text-[#c0392b]" borderColor="border-l-[#c0392b]" />
    <MetricCard icon={PiggyBank} label="Net Profit" value="$33,800" sub="80.5% margin" />
    <MetricCard icon={Wallet} label="Outstanding" value="$5,000" accent="text-[#e67e22]" />
    <MetricCard icon={DollarSign} label="MRR" value="$3,500" accent="text-[#1a73e8]" />
  </div>

  {/* Tab content: overview */}
  {tab === "overview" && (
    <div className="grid grid-cols-2 gap-6">
      <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Revenue by Month</h2>
        <div className="flex items-end gap-3" style={{ height: 180 }}>
          {monthlyData.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px]">${(m.revenue / 1000).toFixed(1)}k</span>
              <div className="w-full rounded-t bg-[#1a73e8]" style={{ height: `${pct}%` }} />
              <span className="text-[10px] text-[#888]">{m.month}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">...</div>
    </div>
  )}
</div>
```

**SIT Revenue** (strvx-internal-tool)
```
RevenuePage (div) — server component
  h1 (mb-6 text-xl font-semibold) "Revenue"
  SummaryCards (mb-6 grid grid-cols-4 gap-4)
    Card × 4 — Monthly, Quarterly, YTD, MRR
      Each: rounded-lg border bg-white p-4
        Label (text-11px uppercase tracking-wide text-#888)
        Value (text-xl font-semibold) — MRR green
  ContentGrid (grid grid-cols-2 gap-6)
    RevenueByMonth (rounded-lg border bg-white p-4)
      h2 + CSS bar chart (flex items-end gap-3 h-200px)
        Bar × N (flex-1, rounded-t bg-#1a73e8, height = percentage)
    RevenueByClient (rounded-lg border bg-white p-4)
      table (w-full) — Client, Revenue, % of Total
        thead (border-b) + tbody (hover:bg-#fafafa)
    PipelineForecast (col-span-2 rounded-lg border bg-white p-4)
      table (w-full) — Deal, Client, Value, Probability, Weighted
        Total Weighted Pipeline row (text-#1a73e8 bold)

WHY: Server component — all data fetched in parallel, no client JS.
     grid-cols-4 summary row + grid-cols-2 detail row is classic analytics layout.
     col-span-2 on pipeline forecast gives full-width table.
     CSS bar chart avoids chart library — pure divs with percentage heights.
```
```tsx
<div>
  <h1 className="mb-6 text-xl font-semibold">Revenue</h1>

  {/* Summary cards */}
  <div className="mb-6 grid grid-cols-4 gap-4">
    <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#888]">Monthly</p>
      <p className="mt-1 text-xl font-semibold text-[#222]">${currentMonth.revenue.toLocaleString()}</p>
    </div>
    <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase">Quarterly</p>
      <p className="mt-1 text-xl font-semibold">${quarterly.toLocaleString()}</p>
    </div>
    {/* YTD + MRR cards... */}
  </div>

  <div className="grid grid-cols-2 gap-6">
    {/* Revenue by month — CSS bar chart */}
    <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-[#333]">Revenue by Month</h2>
      <div className="flex items-end gap-3" style={{ height: 200 }}>
        {monthlyRevenue.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[11px]">${(m.revenue / 1000).toFixed(1)}k</span>
            <div className="w-full rounded-t bg-[#1a73e8]" style={{ height: `${heightPct}%` }} />
            <span className="text-[10px] text-[#888]">{m.month}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Revenue by client — table */}
    <div className="rounded-lg border border-[#e0e0e0] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">Revenue by Client</h2>
      <table className="w-full">
        <thead><tr className="border-b"><th className="text-[11px] uppercase">Client</th>...</tr></thead>
        <tbody>{clientRevenue.map(...)}</tbody>
      </table>
    </div>

    {/* Pipeline forecast — full width */}
    <div className="col-span-2 rounded-lg border border-[#e0e0e0] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">Pipeline Forecast</h2>
      <table className="w-full">...</table>
    </div>
  </div>
</div>
```

### Calendar

**SIT Calendar** (strvx-internal-tool)
```
CalendarPage (flex h-full flex-col)
  Header (flex items-center justify-between mb-4)
    h1 (text-xl font-semibold) "Calendar"
    Actions (flex items-center gap-3)
      GoogleCalendarBadge (conditional — synced or connect link)
      "+ Add Event" button (bg-#111 text-white)
  CalendarContainer (flex-1 rounded-lg border bg-white p-4)
    FullCalendar (height 100%)
      headerToolbar: prev/next/today | title | month/week/day
      dayGrid + timeGrid + interaction plugins
      Custom eventContent renderer (type-colored blocks)
  EventDetailModal (fixed inset-0 z-50, conditional)
    Backdrop (bg-black/30 backdrop-blur)
    Card (max-w-md rounded-2xl shadow-2xl)
      ColorBar (h-2 top, color = event type)
      Content (p-6): title, date, time, client, type badge, zoom link
      Edit/Delete actions (only for non-Google events)
  EventFormModal (fixed inset-0 z-50, conditional)
    Backdrop + Card (max-w-lg rounded-2xl)
    Form: title, type pills, date/start/end grid-cols-3, client select, zoom link
    Footer: delete (edit mode) | cancel + submit

WHY: flex h-full flex-col fills shell. FullCalendar height=100% fills remaining space.
     Type-colored events via EVENT_TYPE_HEX map. Modals overlay the calendar.
     Google Calendar events are read-only (no edit/delete buttons).
```
```tsx
<div className="flex h-full flex-col">
  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <h1 className="text-xl font-semibold">Calendar</h1>
    <div className="flex items-center gap-3">
      {googleConnected ? (
        <span className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1.5 text-[12px] font-medium text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Google Calendar synced
        </span>
      ) : (
        <a href="/api/auth/google" className="rounded-lg border px-2.5 py-1.5 text-[12px]">Connect Google Calendar</a>
      )}
      <button className="flex items-center gap-1.5 rounded-lg bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white">
        <Plus size={14} /> Add Event
      </button>
    </div>
  </div>

  {/* FullCalendar fills remaining height */}
  <div className="fc-wrapper flex-1 rounded-lg border border-[#e0e0e0] bg-white p-4">
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }}
      events={fcEvents}
      eventContent={renderEventContent}
      eventClick={handleEventClick}
      dateClick={handleDateClick}
      height="100%"
    />
  </div>

  {/* Event detail modal (overlay) */}
  {selectedEvent && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="h-2 rounded-t-2xl" style={{ backgroundColor: typeColor }} />
        <div className="p-6">...</div>
      </div>
    </div>
  )}
</div>
```

### Dashboard

**Admin Overview** (custos)
```
AdminOverview (flex-1 overflow-y-auto p-6)
  h1 (mb-6 text-xl font-semibold)
  StatCards (mb-6 grid grid-cols-4 gap-3)
    Card × 4 — Clients, Revenue, Costs, Margin
  ChartRow (mb-6 grid grid-cols-[1fr_340px] gap-4)
    RevenueChart (flex items-end gap-4, height: 180px)
    AlertsCard
      Alert × N (flex items-start gap-2.5 rounded-lg border px-3 py-2)
  ClientFleetTable
    Card > grid-cols-[1fr_100px_80px_100px_100px_80px]
      Header (bg-foreground/[0.03] px-4 py-2.5)
      Row × N (px-4 py-3 border-b hover:bg-foreground/[0.03])

WHY: grid-cols-4 for stat overview.
     grid-cols-[1fr_340px] gives chart majority space, alerts sidebar fixed.
     Grid-based table with explicit column widths for alignment.
```
```tsx
<div className="flex-1 overflow-y-auto p-6">
  <h1 className="mb-6 font-heading text-xl font-semibold">Overview</h1>

  {/* Top stats */}
  <div className="mb-6 grid grid-cols-4 gap-3">
    <StatCard icon={Users} label="Active clients" value="5" />
    <StatCard icon={DollarSign} label="Monthly revenue" value="$5,400" />
    <StatCard icon={DollarSign} label="API costs" value="$1,520" />
    <StatCard icon={Server} label="Margin" value="$3,880" sub="72%" />
  </div>

  {/* Chart + Alerts row */}
  <div className="mb-6 grid grid-cols-[1fr_340px] gap-4">
    <Card>
      <CardHeader><CardTitle>Revenue vs API Costs</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-4" style={{ height: 180 }}>
          {data.map((d) => (<div className="relative flex flex-1 items-end">...</div>))}
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
      <CardContent>
        {alerts.map((alert) => (
          <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2">...</div>
        ))}
      </CardContent>
    </Card>
  </div>

  {/* Client fleet table */}
  <Card>
    <CardHeader><CardTitle>Client Fleet</CardTitle></CardHeader>
    <CardContent>
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-[1fr_100px_80px_100px_100px_80px] gap-4 border-b bg-foreground/[0.03] px-4 py-2.5 text-xs">
          <span>Client</span><span>Status</span><span>Tier</span>...
        </div>
        {clients.map((c) => (
          <Link className="grid grid-cols-[1fr_100px_80px_100px_100px_80px] gap-4 border-b px-4 py-3">...</Link>
        ))}
      </div>
    </CardContent>
  </Card>
</div>
```

**Client Dashboard** (drbobnelson)
```
DashboardLayout (flex h-screen)
  Sidebar (w-232px shrink-0 bg-#18181B border-right-#27272A)
    Logo + nav sections (4 groups, py-1.5 px-2 text-13px)
    Active: bg-#27272A rounded-lg
  MainContent (flex-1 overflow-y-auto bg-#F9FAFB)
    Header (p-8 flex justify-between)
      Greeting (text-28px font-semibold) + user avatar
    ContentArea (px-8)
      StatCards (grid grid-cols-2 xl:grid-cols-4 gap-5)
        Card (border rounded-xl p-5) — Revenue, Clients, Pipeline, Tasks
      TwoColumnGrid (grid grid-cols-[1fr_420px] gap-5 mt-8)
        Pipeline (Kanban with 280px columns, overflow-x-auto)
        UpcomingSection (flex flex-col gap-4)

WHY: Fixed 232px dark sidebar, scrollable light main content.
     28px heading for authority level.
     grid-cols-[1fr_420px] gives pipeline more space, sidebar column fixed.
     xl:grid-cols-4 responsive — stat cards collapse on smaller screens.
```
```tsx
<div className="space-y-8 flex-1 flex flex-col">
  {/* Greeting */}
  <div>
    <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#111827" }}>
      {getGreeting()}, Bob
    </h1>
    <p style={{ color: "#6B7280", fontSize: "15px" }}>
      {dashboardStats.todayTasks} follow-ups due today
    </p>
  </div>

  {/* Alert Banner */}
  <div className="flex items-center gap-3 rounded-lg px-4 py-3"
    style={{ backgroundColor: "#FFFBEB", borderLeft: "4px solid #F59E0B" }}>
    <AlertTriangle className="h-5 w-5" style={{ color: "#D97706" }} />
    <div className="flex-1 text-sm" style={{ color: "#92400E" }}>...</div>
  </div>

  {/* Stat Cards */}
  <div className="grid grid-cols-4 gap-5">
    <StatCard title="Active Deals" value="12" icon={Kanban} />
    <StatCard title="Pipeline Value" value="$145,000" icon={DollarSign} />
    <StatCard title="Emails Sent" value="24" icon={Mail} />
    <StatCard title="Reply Rate" value="38%" icon={MessageSquare} />
  </div>

  {/* Main Content Grid: 65/35 split */}
  <div className="grid gap-6" style={{ gridTemplateColumns: "65fr 35fr" }}>
    <div className="space-y-6">
      {/* Today's Schedule card */}
      <div className="rounded-xl border bg-white overflow-hidden">...</div>
      {/* Follow-Ups card */}
      <div className="rounded-xl border bg-white overflow-hidden">...</div>
    </div>
    <div className="flex flex-col">
      {/* Recent Activity */}
      <div className="rounded-xl border bg-white flex-1 flex flex-col">...</div>
    </div>
  </div>
</div>
```

**Dashboard** (strvx-internal-tool)
```
DashboardPage (pb-24) — server component, async
  Header (mb-8 flex items-center justify-between)
    h1 (text-xl font-semibold text-#111) "Good morning, team"
    span (text-13px text-#999) date
  AlertSection (conditional, mb-6)
    div (rounded-lg border border-#f0e0e0 bg-#fffbfb)
      Link × N (flex items-center gap-3 px-4 py-3 border-b)
  TwoColumnGrid (grid grid-cols-1 gap-6 lg:grid-cols-2)
    TodaySection (flex flex-col)
      SectionTitle (text-13px font-semibold)
      Card (flex-1 rounded-lg border bg-white) — events
    ActiveClientsSection (flex flex-col)
      Card (rounded-lg border bg-white) — engagements
  RecentActivity (mt-6)
    Card (rounded-lg border bg-white)
  GoalProgress (mt-6 rounded-lg)
  TeamStatus
  QuickAddBar

WHY: Server component fetches all data in parallel.
     grid cols-1 → lg:cols-2 for responsive.
     flex-col + flex-1 makes "Today" card stretch to match "Active Clients" height.
     Each card has rounded-lg border bg-white for consistency.
```
```tsx
<div className="pb-24">
  {/* Header */}
  <div className="mb-8 flex items-center justify-between">
    <h1 className="text-xl font-semibold text-[#111]">{greeting}, team</h1>
    <span className="text-[13px] text-[#999]">{date}</span>
  </div>

  {/* Alert section (conditional) */}
  <section className="mb-6">
    <div className="rounded-lg border border-[#f0e0e0] bg-[#fffbfb]">
      {overdueItems.map((item) => (
        <Link key={item.id} className="flex items-center gap-3 border-b px-4 py-3">...</Link>
      ))}
    </div>
  </section>

  {/* Two-column grid */}
  <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
    <section className="flex flex-col">
      <h2 className="text-[13px] font-semibold">Today</h2>
      <div className="flex-1 rounded-lg border bg-white">...</div>
    </section>
    <section className="flex flex-col">
      <h2 className="text-[13px] font-semibold">Active clients</h2>
      <div className="rounded-lg border bg-white">...</div>
    </section>
  </div>

  {/* Recent activity */}
  <section className="mt-6">
    <div className="rounded-lg border bg-white">...</div>
  </section>

  {/* Goal progress bar */}
  <Link className="mt-6 flex items-center gap-4 rounded-lg border bg-white px-4 py-3">...</Link>
  <TeamStatus />
  <QuickAddBar />
</div>
```

### Editor

**Chat Interface** (custos)
```
ChatPage (flex h-full)
  ChatArea (flex flex-1 flex-col)
    PageHeader
    MessagesContainer (relative flex-1 overflow-hidden)
      ScrollDiv (h-full overflow-y-auto, ref for auto-scroll)
        EmptyState (when no messages)
        OR
        MessageList (mx-auto max-w-chat flex flex-col gap-6 px-4 py-6)
          ChatMessage × N
      JumpToBottom (absolute, shows when scrolled up)
    ErrorDisplay (conditional)
    ChatInput (pinned to bottom)
  ContextPanel (toggleable side panel)

WHY: flex h-full fills the shell.
     flex-1 flex-col on chat area for vertical stacking.
     relative + overflow-hidden on messages creates scroll trap.
     h-full overflow-y-auto on inner div for actual scrolling.
     max-w-chat constrains message width for readability.
     ChatInput at bottom, outside scroll area.
```
```tsx
<div className="flex h-full">
  {/* Chat area */}
  <div className="flex flex-1 flex-col">
    <PageHeader icon={MessageSquare} title="Chat">
      <span className="text-xs text-emerald-400">Online</span>
      <span className="text-xs text-foreground/40">{activeModel} · Balanced</span>
    </PageHeader>

    {/* Messages */}
    <div className="relative flex-1 overflow-hidden">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
        {!hasMessages ? (
          <EmptyState agentName="Atlas" onSuggestionClick={sendMessage} />
        ) : (
          <div className="mx-auto flex max-w-chat flex-col gap-6 px-4 py-6">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>
      <JumpToBottom visible={hasMessages && !isAtBottom} onClick={handleJumpToBottom} />
    </div>

    {/* Input (pinned to bottom) */}
    <ChatInput onSend={sendMessage} onStop={stopStreaming} isStreaming={isStreaming} />
  </div>

  {/* Context panel (toggleable) */}
  <ContextPanel open={contextOpen} onClose={() => setContextOpen(false)} />
</div>
```

### Email

**Dr Bob Email** (drbobnelson)
```
EmailPage (space-y-8 flex-1 flex flex-col)
  Header (flex items-start justify-between)
    h1 (text-2xl font-bold) "Email" + subtitle
  StatCards (grid grid-cols-4 gap-5)
    StatCard × 4 — Emails Sent, Open Rate, Reply Rate, Bounce Rate
  TabBar (flex items-center justify-between)
    PillTabs (flex gap-1 rounded-lg bg-muted p-1)
      Tab × 4 — Sent, Drafts, Scheduled, Sequences
      Active: bg-white shadow, Inactive: text-#71717A
    Controls (flex items-center gap-3)
      SearchInput (relative w-72, Search icon left-3)
      ComposeButton (+ Compose)
  TabContent
    sent: TableCard (rounded-xl border bg-white, flex-1 flex flex-col)
      Table (w-full)
        TableHeader: Recipient, Subject, Status, Sent, Template
          th (text-11px uppercase tracking-wider)
        TableBody
          TableRow × N (cursor-pointer, alternating bg, left-border hover gold)
            Status badge (colored pill)
      PaginationFooter (border-top, showing X-Y of Z + prev/next)
    drafts/scheduled: EmptyState (rounded-xl border py-20, icon + message)
    sequences: SequenceView component
  EmailDetailSheet (slides from right)
  EmailComposeModal (overlay + minimizable)

WHY: flex-1 flex flex-col makes page fill shell.
     StatCards on top give email performance at a glance.
     Pill tabs for sub-navigation within the email domain.
     Table with alternating row colors + gold left-border hover for selection.
     Paginated table (8 rows/page) avoids endless scroll.
     Compose modal is minimizable — stays as floating bar when minimized.
```
```tsx
<div className="space-y-8 flex-1 flex flex-col">
  {/* Header */}
  <div className="flex items-start justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#111827" }}>Email</h1>
      <p style={{ color: "#6B7280", fontSize: "15px" }}>Outreach and communication</p>
    </div>
  </div>

  {/* Stat cards */}
  <div className="grid grid-cols-4 gap-5">
    <StatCard title="Emails Sent" value="42" icon={Mail} />
    <StatCard title="Open Rate" value="68%" icon={TrendingUp} />
    <StatCard title="Reply Rate" value="24%" icon={Search} />
    <StatCard title="Bounce Rate" value="3%" icon={Mail} />
  </div>

  {/* Tab bar + search + compose */}
  <div className="flex items-center justify-between">
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <button key={tab.value} onClick={() => setActiveTab(tab.value)}
          className="px-4 py-2 text-sm font-medium rounded-md"
          style={activeTab === tab.value ? { backgroundColor: "white", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" } : { color: "#71717A" }}>
          {tab.label}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-3">
      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input placeholder="Search emails..." className="pl-9" />
      </div>
      <Button><Plus className="h-4 w-4 mr-2" /> Compose</Button>
    </div>
  </div>

  {/* Sent tab — paginated table */}
  {activeTab === "sent" && (
    <div className="rounded-xl border bg-white" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Table>
        <TableHeader><TableRow><TableHead className="text-[11px] uppercase">Recipient</TableHead>...</TableRow></TableHeader>
        <TableBody>{pageEmails.map((email) => <TableRow key={email.id} onClick={() => handleRowClick(email)}>...</TableRow>)}</TableBody>
      </Table>
      <div style={{ borderTop: "1px solid #F4F4F5", padding: "12px 16px" }}>Showing X-Y of Z</div>
    </div>
  )}

  <EmailDetailSheet email={selectedEmail} open={sheetOpen} />
  <EmailComposeModal open={composeOpen} minimized={composeMinimized} />
</div>
```

### Form

**Invoice Builder** (strvx-internal-tool)
```
InvoiceBuilder (mx-auto max-w-3xl)
  Header (mb-6 flex items-center justify-between)
    div: h1 + invoice number
    div: Preview btn + Save Draft btn + Send btn (bg-#111)
  FormCard (rounded-lg border bg-white p-6)
    ClientRow (mb-5 grid grid-cols-2 gap-4)
      Label (text-11px uppercase) + CustomSelect
      Label + input (rounded-lg border-#e0e0e0 px-3 py-2)
    DateRow (mb-5 grid grid-cols-3 gap-4)
      Date inputs + Net days quick-set buttons
    LineItemsTable (mb-5)
      table (w-full)
        thead > tr (border-b #e0e0e0)
          th (px-2 py-2 text-11px uppercase)
        tbody > tr × N (border-b #f0f0f0 hover:bg-#fafafa)
          td > input (border-0 bg-transparent — edit in place)
      "+ Add Line Item" button (text-#1a73e8)
    SubtotalSection (mb-5 flex justify-end)
      div (w-64) — Subtotal / Tax / Total rows
    Notes (textarea rows=3)
  PreviewModal (conditional)

WHY: max-w-3xl constrains form width for readability.
     grid-cols-2 and grid-cols-3 for responsive field layout.
     Line items use transparent inputs for inline editing feel.
     Preview modal overlays the form.
```
```tsx
<div className="mx-auto max-w-3xl">
  {/* Header */}
  <div className="mb-6 flex items-center justify-between">
    <div>
      <h1 className="text-xl font-semibold text-[#222]">New Invoice</h1>
      <p className="mt-0.5 text-[13px] text-[#888]">{invoiceNumber}</p>
    </div>
    <div className="flex items-center gap-2">
      <button className="rounded-lg border bg-white px-3 py-1.5 text-[13px]">Preview</button>
      <button className="rounded-lg border bg-white px-3 py-1.5 text-[13px]">Save Draft</button>
      <button className="rounded-lg bg-[#111] px-3 py-1.5 text-[13px] text-white">Send Invoice</button>
    </div>
  </div>

  {/* Form Card */}
  <div className="rounded-lg border border-[#e0e0e0] bg-white p-6">
    {/* Client + Email row */}
    <div className="mb-5 grid grid-cols-2 gap-4">
      <div><label className="text-[11px] uppercase">Client</label><CustomSelect /></div>
      <div><label className="text-[11px] uppercase">Email</label><input className={inputClass} /></div>
    </div>

    {/* Dates row */}
    <div className="mb-5 grid grid-cols-3 gap-4">
      <div><label>Issue Date</label><input type="date" /></div>
      <div><label>Due Date</label><input type="date" /></div>
      <div><label>Quick Set</label><div className="flex gap-2">{[15,30,60].map(...)}</div></div>
    </div>

    {/* Line Items Table */}
    <div className="mb-5">
      <table className="w-full">
        <thead><tr className="border-b border-[#e0e0e0]">
          <th className="text-[11px] uppercase">Description</th>
          <th className="w-20 text-right">Qty</th>
          <th className="w-28 text-right">Rate</th>
          <th className="w-28 text-right">Amount</th>
        </tr></thead>
        <tbody>{lineItems.map(...)}</tbody>
      </table>
      <button className="mt-3 text-[13px] text-[#1a73e8]">+ Add Line Item</button>
    </div>

    {/* Subtotal */}
    <div className="mb-5 flex justify-end"><div className="w-64">...</div></div>
    {/* Notes */}
    <textarea rows={3} className={inputClass} />
  </div>
</div>
```

**Provision Form** (custos)
```
ProvisionPage (flex-1 overflow-y-auto p-6)
  Header (mb-6 flex items-center gap-3)
    PlusCircle icon + h1
  StepIndicator (mb-8 flex items-center gap-2)
    Step × 4 (rounded-lg px-3 py-1.5)
      Complete: Check icon
      Current: Numbered circle (h-5 w-5)
  FormCard (Card max-w-2xl)
    CardContent
      Step1: Client Info (flex flex-col gap-5)
        Input × 3 + TierSelector (grid grid-cols-3 gap-3)
      Step2: Configuration (flex flex-col gap-5)
        PresetSelector (flex gap-3) + SpendingCap input
      Step3: Skills (grid grid-cols-2 gap-2)
        Skill toggle × N (flex items-center gap-2 rounded-lg border px-3 py-2)
      Step4: Review (grid grid-cols-2 gap-y-3)
        Config summary + estimated margin
      Navigation: Back + Next/Provision buttons

WHY: max-w-2xl constrains form width.
     Step wizard with numbered circles.
     Each step is a flex-col gap-5 for consistent field spacing.
     Tier selector uses grid-cols-3 for side-by-side comparison.
```
```tsx
<div className="flex-1 overflow-y-auto p-6">
  <div className="mb-6 flex items-center gap-3">
    <PlusCircle size={20} />
    <h1 className="font-heading text-xl font-semibold">Provision New Client</h1>
  </div>

  {/* Step indicator */}
  <div className="mb-8 flex items-center gap-2">
    {steps.map((label, i) => (
      <div className="flex items-center gap-2">
        {i > 0 && <ChevronRight size={14} />}
        <button className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
          isActive && "bg-foreground/[0.08]",
          isComplete && "text-emerald-400",
        )}>
          {isComplete ? <Check size={14} /> : <span className="h-5 w-5 rounded-full border">{stepNum}</span>}
          {label}
        </button>
      </div>
    ))}
  </div>

  {/* Step content */}
  <Card className="max-w-2xl">
    <CardContent>
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <h2 className="font-heading text-lg font-semibold">Client Information</h2>
          <Input label="Client name" />
          <div><label>Tier</label>
            <div className="grid grid-cols-3 gap-3">
              {TIERS.map((t) => (<button className="rounded-card border p-3">...</button>))}
            </div>
          </div>
          <div className="flex justify-end"><Button size="sm">Next</Button></div>
        </div>
      )}
    </CardContent>
  </Card>
</div>
```

### Grid

**Custos Connectors** (custos)
```
ConnectorsPage (flex flex-col flex-1 overflow-hidden)
  PageHeader (icon=Plug, title="Connectors")
    Subtitle: "{N} active"
  ScrollableContent (flex-1 overflow-y-auto p-6)
    LoadingState (conditional)
      SkeletonGrid × 2 (grid-cols-4, skeleton cards)
    ErrorState (conditional)
      AlertCircle icon + error message + "Try again" button
    ActiveSection (mb-8)
      SectionTitle (text-xs uppercase tracking-wider) "Active"
      ConnectedGrid (grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3)
        ConnectorCard × N (rounded-card border p-5 min-h-[140px])
          Header: logo (h-8 w-8 rounded-lg) + name + description
          Footer: StatusBadge "Connected" + hover actions (Settings, Disconnect)
    AvailableSection
      Header (flex justify-between)
        SectionTitle "Available"
        PillSwitch (All | Productivity | Communication | Developer | Storage)
      AvailableGrid (grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3)
        ConnectorCard × N (rounded-card border p-5 min-h-[160px])
          Logo + name + description
          ConnectButton (variant=outline w-full)
      RequestLink (mt-4 text-xs) "Need another connector? Request one"

WHY: flex-col flex-1 overflow-hidden fills shell.
     Two sections: Active (connected) and Available (disconnected).
     Responsive grid: 1 → 2 → 4 columns.
     PillSwitch for category filtering on available connectors.
     min-h on cards ensures consistent card height.
     Hover-reveal actions on connected cards (Settings, Disconnect).
     Loading skeleton matches the final layout grid structure.
```
```tsx
<div className="flex flex-col flex-1 overflow-hidden">
  <PageHeader icon={Plug} title="Connectors">
    <span className="text-xs text-foreground/60">{connectedConnectors.length} active</span>
  </PageHeader>

  <div className="flex-1 overflow-y-auto p-6">
    {/* Active connectors */}
    <div className="mb-8">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-foreground/70">Active</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {connectedConnectors.map((connector) => (
          <div key={connector.id}
            className="group rounded-card border border-border bg-card p-5 min-h-[140px] hover:border-foreground/10">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04]">
                <img src={connector.logo} alt={connector.name} />
              </span>
              <div><p className="text-sm font-medium">{connector.name}</p></div>
            </div>
            <div className="flex items-center justify-between">
              <StatusBadge variant="healthy">Connected</StatusBadge>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button title="Settings"><Settings size={13} /></button>
                <button onClick={() => disconnect(connector.id)} title="Disconnect"><Unplug size={13} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Available connectors */}
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider">Available</h2>
        <PillSwitch options={[{ value: "all", label: "All" }, ...categories]} value={filter} onChange={setFilter} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {filteredAvailable.map((connector) => (
          <div key={connector.id} className="flex flex-col justify-between rounded-card border p-5 min-h-[160px]">
            <div><img src={connector.logo} /><p>{connector.name}</p><p>{connector.description}</p></div>
            <Button variant="outline" size="sm" className="w-full">Connect</Button>
          </div>
        ))}
      </div>
    </div>
  </div>
</div>
```

### Kanban

**SIT Pipeline** (strvx-internal-tool)
```
PipelinePage (div)
  Header (mb-6)
    h1 (text-xl font-semibold) "Pipeline"
  PipelineBoardLoader → PipelineBoard
    DndContext (sensors: pointer+keyboard, closestCorners)
      ScrollContainer (overflow-x-auto)
        MinWidthWrapper (min-w-[800px])
          ColumnGrid (grid auto-cols-fr grid-flow-col gap-2)
            PipelineColumn × N (flex min-h-[420px] flex-col rounded-lg border bg-white)
              ColumnHeader (border-b px-3 py-2.5)
                StatusDot (h-2 w-2 rounded-full, colored by stage)
                StageName (text-11px uppercase)
                Count badge (h-5 w-5 rounded-full bg-#f0f0f0)
              DropZone (flex-1 flex-col gap-2 p-2, droppable)
                SortableContext (verticalListSortingStrategy)
                  PipelineCard × N (sortable, draggable)
                  OR EmptyState (text-11px text-#ddd)
      DragOverlay
        PipelineCard (isOverlay — floating card while dragging)

WHY: auto-cols-fr grid makes all columns equal width.
     min-w-[800px] + overflow-x-auto enables horizontal scroll on small screens.
     DnD Kit for drag-drop between columns.
     min-h-[420px] on columns ensures minimum visual height even when empty.
     optimistic UI: stage change applied immediately, reverted on server failure.
```
```tsx
<div>
  <div className="mb-6">
    <h1 className="text-xl font-semibold">Pipeline</h1>
  </div>

  <DndContext sensors={sensors} collisionDetection={closestCorners}
    onDragStart={handleDragStart} onDragOver={handleDragOver}
    onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="grid auto-cols-fr grid-flow-col gap-2">
          {KANBAN_STAGES.map((stage) => (
            <div key={stage} className="flex min-h-[420px] flex-col rounded-lg border border-[#e0e0e0] bg-white">
              {/* Column header */}
              <div className="flex items-center justify-between border-b px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
                  <span className="text-[11px] font-semibold uppercase">{STAGE_LABELS[stage]}</span>
                </div>
                <span className="h-5 w-5 rounded-full bg-[#f0f0f0] text-[10px]">{count}</span>
              </div>
              {/* Droppable zone */}
              <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-2">
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {engagements.map((eng) => <PipelineCard key={eng.id} engagement={eng} />)}
                </SortableContext>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    <DragOverlay>{activeEngagement && <PipelineCard engagement={activeEngagement} isOverlay />}</DragOverlay>
  </DndContext>
</div>
```

### Landing

**Dr Bob Landing** (drbobnelson)
```
Home (Fragment <>)
  Hero — Full-width hero section with headline, CTA, imagery
  AuthorityStats — Media logos + credibility numbers
  ServicesOverview — Service cards grid
  VideoShowcase — Embedded video section
  TestimonialsCarousel — Client testimonials slider
  FeaturedBooks — Book cards/covers grid
  GettingStarted — Step-by-step onboarding section
  BookingCTA — Final conversion CTA with booking form

WHY: Fragment <> wraps sections — no shared layout container.
     Each section is a self-contained component (Hero, AuthorityStats, etc.).
     Linear top-to-bottom flow — classic landing page pattern.
     8 sections cover full marketing funnel: awareness → authority → social proof → conversion.
     BookingCTA at bottom captures intent after building trust.
```
```tsx
<>
  <Hero />
  <AuthorityStats />
  <ServicesOverview />
  <VideoShowcase />
  <TestimonialsCarousel />
  <FeaturedBooks />
  <GettingStarted />
  <BookingCTA />
</>
```

### List

**Clients Table** (strvx-internal-tool)
```
ClientsTable (flex flex-col h-[calc(100vh-3rem)])
  Header (flex items-center justify-between mb-4)
    h1 (text-xl font-semibold)
    Button "+ Add Client" (bg-#222, text-white)
  TableContainer (flex-1 overflow-hidden rounded-lg border bg-white)
    ScrollArea (h-full)
      Table
        TableHeader (sticky top-0 z-10 bg-white)
          TableRow > TableHead × 7 (text-11px uppercase)
        TableBody
          TableRow[onClick → open sheet] × N
            TableCell (text-13px)
  Sheet (detail panel, slides from right)
    SheetContent (flex flex-col gap-4)
      SheetHeader > SheetTitle
      ScrollArea (flex-1) — sections scroll independently
        SectionCards (Building2, DollarSign, Users, MessageSquare, Zap)
      SheetFooter (border-top)

WHY: h-[calc(100vh-3rem)] fills viewport minus app padding.
     flex-col + flex-1 makes table container fill remaining height.
     overflow-hidden on container clips table, ScrollArea adds custom scrollbar.
     sticky header stays visible while body scrolls.
     Sheet gives detail view without leaving the page.
```
```tsx
<div className="flex h-[calc(100vh-3rem)] flex-col">
  {/* Header */}
  <div className="mb-4 flex items-center justify-between">
    <h1 className="text-xl font-semibold">Clients</h1>
    <button className="flex items-center gap-1.5 rounded-md bg-[#222] px-3 py-1.5 text-[13px] font-medium text-white">
      <Plus size={14} /> Add Client
    </button>
  </div>

  {/* Table */}
  <div className="flex-1 overflow-hidden rounded-lg border border-border bg-white">
    <ScrollArea className="h-full">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-white">
          <TableRow>
            <TableHead className="text-[11px]">Company</TableHead>
            <TableHead className="text-[11px]">Engagement</TableHead>
            <TableHead className="text-[11px]">Contact</TableHead>
            <TableHead className="text-[11px]">Stage</TableHead>
            <TableHead className="text-right text-[11px]">Value</TableHead>
            <TableHead className="text-center text-[11px]">Days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {engagements.map((eng) => (
            <TableRow key={eng.id} onClick={() => setSelectedId(eng.id)} className="cursor-pointer">
              <TableCell>...</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  </div>

  {/* Detail Sheet */}
  <Sheet open={selectedId !== null}>
    <SheetContent className="sm:max-w-[440px] flex flex-col overflow-hidden p-0">
      <SheetHeader className="shrink-0 border-b px-5 pt-5 pb-4">...</SheetHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-5 py-4">...</div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
</div>
```

**Clients Table** (drbobnelson)
```
ClientsPage (flex-1 overflow-y-auto)
  Header (px-8 pt-8 pb-6 flex justify-between)
    h1 (text-22px font-semibold) + count badge
    SearchInput (w-64) + "Add Client" button
  TableCard (mx-8 border rounded-xl overflow-hidden)
    TableHeader (grid grid-cols-[1fr_140px_120px_120px_100px_80px] bg-#F9FAFB)
      th (px-4 py-3 text-11px uppercase font-semibold text-#6B7280)
    TableBody
      Row × N (grid same-cols px-4 py-3.5 border-b hover:bg-#F9FAFB cursor-pointer)
        Name + email, Service badge (colored), Status dot, Last Contact, Revenue
    onClick → Sheet (w-480px)
      Contact info + Pipeline stage + Timeline

WHY: Grid-based table for precise column control.
     Rounded-xl card wraps entire table.
     Row click opens detail sheet (not page navigation).
     11px uppercase headers match SIT pattern.
```
```tsx
<div className="space-y-5">
  {/* Header */}
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
      <p className="text-muted-foreground mt-1">Organizations and contacts</p>
    </div>
  </div>

  {/* Stat Cards */}
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
    <StatCard title="Organizations" value="12" icon={Building2} />
    <StatCard title="Contacts" value="28" icon={Users} />
    <StatCard title="Repeat Bookers" value="5" icon={Repeat} />
    <StatCard title="Lifetime Value" value="$420,000" icon={DollarSign} />
  </div>

  {/* Tabs + Search */}
  <div className="flex items-center justify-between">
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      <button className="px-4 py-2 text-sm font-medium rounded-md">Organizations</button>
      <button className="px-4 py-2 text-sm font-medium rounded-md">Contacts</button>
    </div>
    <div className="relative w-72">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      <Input placeholder="Search..." className="pl-9" />
    </div>
  </div>

  {/* Table (TanStack) */}
  <DataTable columns={orgColumns} data={filteredOrgs} pageSize={12}
    onRowClick={(org) => { setSelectedOrg(org.id); setSheetOpen(true); }} />

  {/* Detail Sheet */}
  <Sheet open={sheetOpen}>
    <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto p-0">
      {/* Org/Contact detail sections */}
    </SheetContent>
  </Sheet>
</div>
```

**Projects Grid** (custos)
```
ProjectsPage (flex flex-col flex-1 overflow-hidden)
  PageHeader (icon + title + count)
  ContentArea (flex-1 overflow-y-auto p-6)
    SearchRow (mb-6 flex items-center justify-between)
      SearchInput + "New project" Button
    ProjectGrid (grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3)
      ProjectCard × N (rounded-card border p-5, border-left: 4px colored)
        Name + menu (mb-3)
        Description (mb-4 text-xs)
        Stats (flex gap-4 text-11px)
        Footer (mt-3 border-t pt-3) — connectors + last active
      NewProjectCard (border-dashed)
    CreateProjectModal

WHY: flex-col + flex-1 + overflow-hidden on container.
     flex-1 overflow-y-auto on content for scrolling.
     Responsive grid: 1 → 2 → 3 columns.
     Colored left border for project identity.
```
```tsx
<div className="flex flex-col flex-1 overflow-hidden">
  <PageHeader icon={FolderKanban} title="Projects">
    <span className="text-xs text-foreground/60">{projects.length} projects</span>
  </PageHeader>

  <div className="flex-1 overflow-y-auto p-6">
    {/* Search + New button */}
    <div className="mb-6 flex items-center justify-between">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
        <input placeholder="Search projects..." className="h-8 w-56 rounded-lg border pl-9 text-xs" />
      </div>
      <Button variant="outline" size="sm" className="gap-1.5">
        <Plus size={14} /> New project
      </Button>
    </div>

    {/* Project grid */}
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((project) => (
        <button key={project.id}
          className="group relative rounded-card border p-5 text-left hover:shadow-[0_0_12px_rgb(var(--accent)/0.08)]"
          style={{ borderLeft: `4px solid ${project.color}` }}>
          <h3 className="text-sm font-semibold">{project.name}</h3>
          <p className="mb-4 text-xs text-foreground/70">{project.description}</p>
          <div className="flex items-center gap-4 text-[11px] text-foreground/65">
            <span><MessageSquare size={11} /> {project.conversations.length}</span>
            <span><FileText size={11} /> {project.files.length} files</span>
          </div>
        </button>
      ))}
      {/* New project card (dashed border) */}
      <button className="flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-5">
        <Plus size={20} /> <span className="text-xs">New project</span>
      </button>
    </div>
  </div>
</div>
```

### Settings

**Custos Settings (Dashboard)** (custos)
```
SettingsPage (flex flex-col flex-1 overflow-hidden)
  PageHeader (icon=Settings, title="Settings")
  ScrollableContent (flex-1 overflow-y-auto p-6)
    LoadingState (conditional — 3x SkeletonCard)
    TabNav (mb-6 flex gap-1 border-b)
      TabButton × 4 — Account, Security, Agent, Danger Zone
        Each: icon + label, border-b-2 (active: foreground, inactive: transparent)
    TabContent (max-w-2xl)
      account:
        FormCard "Profile" — username (disabled) + password change form
        FormCard "Plan" — plan name + price + StatusBadge
      security:
        FormCard "Two-Factor Authentication" — StatusBadge + reconfigure
        FormCard "Active Sessions" — session row with status
        FormCard "API Token" — masked token + show/copy/refresh buttons
      agent:
        FormCard "Agent Status" — online indicator dot
        FormCard "Spending & Notifications" — cap input + toggle + timezone select
      danger:
        Card (border-red-500/20) — Reset Agent + Delete Account
          Each: description + danger Button
        ConfirmationModal × 2 (type-to-confirm destructive)

WHY: flex-col flex-1 overflow-hidden fills shell.
     flex-1 overflow-y-auto p-6 on content enables scrolling.
     border-b tab nav (not pill tabs) — settings convention.
     max-w-2xl constrains form width for readability.
     FormCard groups related settings with title + description.
     Danger Zone visually separated with red border + confirmation modals.
```
```tsx
<div className="flex flex-col flex-1 overflow-hidden">
  <PageHeader icon={Settings} title="Settings" />
  <div className="flex-1 overflow-y-auto p-6">
    {/* Tab nav — underline style */}
    <div className="mb-6 flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
          className={cn(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm",
            activeTab === tab.id ? "border-foreground text-foreground" : "border-transparent text-foreground/60",
          )}>
          <tab.icon size={15} />
          {tab.label}
        </button>
      ))}
    </div>

    {/* Tab content — constrained width */}
    <div className="max-w-2xl">
      {activeTab === "account" && (
        <div className="flex flex-col gap-6">
          <FormCard title="Profile" description="Your organization's basic information.">
            <Input label="Username" defaultValue="acme-corp" disabled />
            <form className="flex flex-col gap-4">
              <Input label="Current password" type="password" />
              <Input label="New password" type="password" />
              <Button size="sm" className="w-fit">Update password</Button>
            </form>
          </FormCard>
          <FormCard title="Plan" description="Subscription and billing.">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">Pro - $249/mo</p></div>
              <StatusBadge variant="healthy">Active</StatusBadge>
            </div>
          </FormCard>
        </div>
      )}
      {activeTab === "danger" && (
        <Card className="border-red-500/20 p-6">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Reset Agent</p></div>
            <Button variant="danger" size="sm">Reset</Button>
          </div>
        </Card>
      )}
    </div>
  </div>
</div>
```

### Split

**Admin Shell** (custos)
```
AdminShell (flex h-screen overflow-hidden)
  AdminSidebar (w-220px shrink-0)
    Dark theme, nav groups
  main (flex-1 overflow-y-auto)
    {children} — pages handle own padding (p-6)

WHY: h-screen + overflow-hidden on parent.
     flex-1 + overflow-y-auto on main = scrollable content area.
     Sidebar fixed width, never scrolls page.
```
```tsx
<div className="flex h-screen overflow-hidden">
  <AdminSidebar />
  <main className="flex-1 overflow-y-auto">{children}</main>
</div>
```

**Agent Workbench** (strvx-internal-tool)
```
AgentWorkbench (flex gap-0 h-[calc(100vh-48px)])
  LeftPanel (w-280px shrink-0 border-right bg-#fafafa flex flex-col)
    Header (p-16px border-bottom)
      h2 (14px font-700) + count
      Plus button (26×26 bg-#111)
    AgentList (flex-1 overflow-y-auto p-8px)
      AgentCard × N (p-12px rounded-8px cursor-pointer)
        selected: bg-white + border
        Icon (32×32 rounded-8px colored bg)
        Name + type badge + status
        Deploy date (if deployed)
  RightPanel (flex-1 overflow-y-auto p-20px-28px)
    AgentHeader (flex justify-between mb-20px)
      Icon (48×48 rounded-12px) + name + type badge + stats
      Delete btn + Deploy btn (bg-#111)
    Description (13px color-#555 max-w-650)
    Identity (bordered card, editable)
    Settings (toggle buttons: Corrections ON/OFF, Components ON/OFF, deploy path)
    RuleComposition
      GlobalRules (bg-#f8f9ff border-#e8edff) — always included
      ImportableRules (bordered) — checkbox toggles
  DeployPreviewModal (800px, code block)

WHY: calc(100vh-48px) accounts for app padding.
     Left panel is fixed 280px, right fills remaining.
     Both panels scroll independently (overflow-y-auto).
     Deploy preview shows the generated markdown.
```
```tsx
<div style={{ display: "flex", gap: 0, height: "calc(100vh - 48px)" }}>
  {/* Left panel — Agent list */}
  <div style={{
    width: 280, flexShrink: 0, borderRight: "1px solid #e0e0e0",
    display: "flex", flexDirection: "column", backgroundColor: "#fafafa",
  }}>
    <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f0f0f0" }}>
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>Agents</h2>
      <button style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: "#111", color: "#fff" }}>
        <Plus size={14} />
      </button>
    </div>
    <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
      {agents.map((a) => (
        <div key={a.id} onClick={() => selectAgent(a.id)}
          style={{ padding: "12px 14px", borderRadius: 8, cursor: "pointer",
            backgroundColor: isSelected ? "#fff" : "transparent" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8 }}>...</div>
            <div>{a.name}</div>
          </div>
        </div>
      ))}
    </div>
  </div>

  {/* Right panel — Workbench */}
  <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
    {/* Agent header, identity, settings, rule composition */}
  </div>
</div>
```

**App Shell** (strvx-internal-tool)
```
AppLayout (flex h-screen)
  RealtimeProvider
    div (flex h-screen)
      Sidebar (w-220px, shrink-0, border-right #e0e0e0, bg-white, overflow-y-auto)
        Logo + collapsible nav sections
      main (flex-1, overflow-y-auto, px-4 pb-24 pt-14 md:px-8 md:pt-6)
        {children} — each page fills this area
      CommandPalette (global search)
      Toaster (sonner notifications)

WHY: h-screen locks viewport height. flex makes sidebar + main side-by-side.
     main is flex-1 so it fills remaining width. overflow-y-auto makes main scroll.
     Sidebar never scrolls the page — it's fixed width, only its own content scrolls.
```
```tsx
<div className="flex h-screen">
  <Sidebar />
  <main className="flex-1 overflow-y-auto px-4 pb-24 pt-14 md:px-8 md:pt-6">
    {children}
  </main>
</div>
<CommandPalette />
<Toaster />
```

**Configure Editor** (custos)
```
ConfigurePage (flex h-full)
  LeftNav (w-200px shrink-0 border-right bg-sidebar)
    PageHeader
    nav (flex flex-col gap-4 px-3)
      NavGroup × N
        GroupTitle (text-10px uppercase tracking-widest)
        NavItem × N (px-2 py-1.5 rounded-md text-xs)
          Expandable: children (ml-4 border-l pl-2)
  EditorArea (flex flex-1 flex-col)
    EditorToolbar (PageHeader with mode switch)
    EditorContent (flex-1 overflow-y-auto p-6)
      MarkdownEditor OR FormEditor OR FileTypeRouter
    ErrorBar (conditional, border-top)
  EmptyState (when no file selected)

WHY: Fixed 200px nav sidebar.
     flex-1 flex-col on editor for toolbar + content split.
     flex-1 overflow-y-auto on content for scrolling.
     Editor modes: form view vs markdown view.
```
```tsx
<div className="flex h-full">
  {/* Sidebar nav */}
  <div className="w-[200px] shrink-0 border-r border-border bg-sidebar">
    <PageHeader icon={Sliders} title="Configure" />
    <nav className="flex flex-col gap-4 px-3 pt-2 pb-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <span className="mb-1 block px-2 text-[10px] font-semibold uppercase tracking-widest text-foreground/35">
            {group.title}
          </span>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <button key={item.path}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
                  isActive ? "bg-card text-foreground font-medium" : "text-foreground/60",
                )}>
                <Icon size={15} className={isActive ? "text-accent" : "text-foreground/40"} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  </div>

  {/* Editor area */}
  <div className="flex flex-1 flex-col">
    <PageHeader icon={FileText} title={activeFileName}>
      <PillSwitch options={["Form", "Markdown"]} value={editorMode} onChange={setEditorMode} />
    </PageHeader>
    <div className="flex-1 overflow-y-auto p-6">
      {/* MarkdownEditor OR FormEditor based on mode */}
    </div>
  </div>
</div>
```

### Tracker

**SIT Goals** (strvx-internal-tool)
```
GoalsPage (div)
  Header (mb-6 flex items-center justify-between)
    h1 (text-xl font-semibold) "Goals"
    Actions (flex items-center gap-4)
      AchievedCounter (Trophy icon + "X of Y achieved")
      "+ Add Goal" button (bg-#111)
  ProgressHero (mb-6 rounded-lg border bg-white p-6)
    Label (text-12px uppercase) "Total Revenue"
    BigNumber (text-3xl font-bold) "$42,000"
    NextGoalRow (flex justify-between text-13px)
      "Next: [name] at $X" + "$X to go"
    ProgressBar (h-3 rounded-full bg-gradient from-#1a73e8 to-#4fc3f7)
    Percentage (text-right text-12px)
  AddGoalForm (conditional, mb-4)
    GoalForm (rounded-lg border border-#1a73e8 p-5)
  GoalsList (flex flex-col gap-4)
    GoalCard × N (group rounded-lg border bg-white p-5)
      Layout (flex items-start gap-4)
        IconButton (h-10 w-10 rounded-lg, click toggles achieved)
          Achieved: PartyPopper green, In Progress: Target blue, Locked: Target gray
        Content (flex-1)
          TitleRow: name + status badge + hover actions (edit/delete)
          Description (text-13px text-#888)
          ProgressBar (h-2 rounded-full) + target value
    OR EmptyState (border-dashed, Target icon, "No goals yet")

WHY: Progress hero card provides motivational overview.
     Sequential goal cards with status badges (Achieved/In Progress/Locked).
     Click icon to toggle achieved — optimistic update.
     Inline GoalForm for add/edit avoids modal overhead.
     Goals sorted by target value ascending — natural progression.
```
```tsx
<div>
  {/* Header */}
  <div className="mb-6 flex items-center justify-between">
    <h1 className="text-xl font-semibold">Goals</h1>
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 text-[13px] text-[#888]">
        <Trophy size={16} className="text-[#f59e0b]" />
        {achievedCount} of {sorted.length} achieved
      </div>
      <button className="flex items-center gap-1.5 rounded-md bg-[#111] px-3 py-1.5 text-[13px] text-white">
        <Plus size={14} /> Add Goal
      </button>
    </div>
  </div>

  {/* Progress hero */}
  <div className="mb-6 rounded-lg border border-[#e0e0e0] bg-white p-6">
    <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-[#888]">Total Revenue</div>
    <div className="mb-4 text-3xl font-bold text-[#222]">${currentRevenue.toLocaleString()}</div>
    <div className="mb-2 flex items-center justify-between text-[13px]">
      <span>Next: <span className="font-medium">{nextGoal.name}</span></span>
      <span className="font-medium">{remaining} to go</span>
    </div>
    <div className="h-3 overflow-hidden rounded-full bg-[#f0f0f0]">
      <div className="h-full rounded-full bg-gradient-to-r from-[#1a73e8] to-[#4fc3f7]" style={{ width: `${pct}%` }} />
    </div>
  </div>

  {/* Goal cards */}
  <div className="flex flex-col gap-4">
    {sorted.map((goal) => (
      <div key={goal.id} className="group rounded-lg border bg-white p-5">
        <div className="flex items-start gap-4">
          <button className="h-10 w-10 rounded-lg" onClick={() => toggleAchieved(goal)}>
            {goal.achieved ? <PartyPopper /> : <Target />}
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h3 className="text-[15px] font-semibold">{goal.name}</h3>
              <span className="rounded-full px-2 py-0.5 text-[11px]">{status}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-[#f0f0f0]"><div style={{ width: `${pct}%` }} /></div>
              <span className="text-[12px]">{formatCurrency(target)}</span>
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
```

## Adaptation

At session start, check package.json. If not strvx: adapt components, keep layout principles.

## Validation

1. node scripts/lint-layout.mjs <path>
2. node scripts/validate-layout.mjs <url>
3. Fix before delivering.
