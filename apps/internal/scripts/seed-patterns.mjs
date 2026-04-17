import fs from "fs";
import postgres from "postgres";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DIRECT_URL="([^"]+)"/);
const sql = postgres(match[1], { prepare: false, connect_timeout: 15, max: 1 });

const patterns = [
  // === SIT PATTERNS ===
  {
    name: "App Shell",
    archetype: "split",
    source_project: "strvx-internal-tool",
    source_file: "src/app/(app)/layout.tsx",
    layout_tree: `AppLayout (flex h-screen)
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
     Sidebar never scrolls the page — it's fixed width, only its own content scrolls.`,
  },
  {
    name: "Clients Table",
    archetype: "list",
    source_project: "strvx-internal-tool",
    source_file: "src/app/(app)/clients/clients-table.tsx",
    layout_tree: `ClientsTable (flex flex-col h-[calc(100vh-3rem)])
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
     Sheet gives detail view without leaving the page.`,
    code_example: `// Server component (page.tsx)
const [engagements, contacts, timelines, actions, users] = await Promise.all([
  getPipelineEngagements(),
  getAllContactsByCompany(),
  getAllEngagementTimelines(),
  getAllEngagementActions(),
  getUsers(),
]);
return <ClientsTable initialEngagements={engagements} ... />;

// Client component pattern
"use client";
const [selected, setSelected] = useState(null);
// Table row onClick → setSelected → Sheet opens`,
  },
  {
    name: "Dashboard",
    archetype: "dashboard",
    source_project: "strvx-internal-tool",
    source_file: "src/app/(app)/dashboard/page.tsx",
    layout_tree: `DashboardPage (pb-24) — server component, async
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
     Each card has rounded-lg border bg-white for consistency.`,
  },
  {
    name: "Invoice Builder",
    archetype: "form",
    source_project: "strvx-internal-tool",
    source_file: "src/app/(app)/invoices/new/invoice-builder-client.tsx",
    layout_tree: `InvoiceBuilder (mx-auto max-w-3xl)
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
     Preview modal overlays the form.`,
  },
  {
    name: "Agent Workbench",
    archetype: "split",
    source_project: "strvx-internal-tool",
    source_file: "src/app/(app)/skills/agents/agent-workbench.tsx",
    layout_tree: `AgentWorkbench (flex gap-0 h-[calc(100vh-48px)])
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
     Deploy preview shows the generated markdown.`,
  },

  // === DR BOB NELSON PATTERNS ===
  {
    name: "Client Dashboard",
    archetype: "dashboard",
    source_project: "drbobnelson",
    source_file: "src/app/(client)/dashboard/page.tsx",
    layout_tree: `DashboardLayout (flex h-screen)
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
     xl:grid-cols-4 responsive — stat cards collapse on smaller screens.`,
  },
  {
    name: "Clients Table",
    archetype: "list",
    source_project: "drbobnelson",
    source_file: "src/app/(client)/clients/page.tsx",
    layout_tree: `ClientsPage (flex-1 overflow-y-auto)
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
     11px uppercase headers match SIT pattern.`,
  },

  // === CUSTOS PATTERNS ===
  {
    name: "Admin Shell",
    archetype: "split",
    source_project: "custos",
    source_file: "apps/admin/src/components/layout/app-shell.tsx",
    layout_tree: `AdminShell (flex h-screen overflow-hidden)
  AdminSidebar (w-220px shrink-0)
    Dark theme, nav groups
  main (flex-1 overflow-y-auto)
    {children} — pages handle own padding (p-6)

WHY: h-screen + overflow-hidden on parent.
     flex-1 + overflow-y-auto on main = scrollable content area.
     Sidebar fixed width, never scrolls page.`,
  },
  {
    name: "Admin Overview",
    archetype: "dashboard",
    source_project: "custos",
    source_file: "apps/admin/src/app/page.tsx",
    layout_tree: `AdminOverview (flex-1 overflow-y-auto p-6)
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
     Grid-based table with explicit column widths for alignment.`,
  },
  {
    name: "Provision Form",
    archetype: "form",
    source_project: "custos",
    source_file: "apps/admin/src/app/provision/page.tsx",
    layout_tree: `ProvisionPage (flex-1 overflow-y-auto p-6)
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
     Tier selector uses grid-cols-3 for side-by-side comparison.`,
  },
  {
    name: "Chat Interface",
    archetype: "editor",
    source_project: "custos",
    source_file: "apps/dashboard/src/app/page.tsx",
    layout_tree: `ChatPage (flex h-full)
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
     ChatInput at bottom, outside scroll area.`,
  },
  {
    name: "Projects Grid",
    archetype: "list",
    source_project: "custos",
    source_file: "apps/dashboard/src/app/projects/page.tsx",
    layout_tree: `ProjectsPage (flex flex-col flex-1 overflow-hidden)
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
     Colored left border for project identity.`,
  },
  {
    name: "Configure Editor",
    archetype: "split",
    source_project: "custos",
    source_file: "apps/dashboard/src/app/configure/page.tsx",
    layout_tree: `ConfigurePage (flex h-full)
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
     Editor modes: form view vs markdown view.`,
  },
];

async function seed() {
  console.log("Seeding " + patterns.length + " patterns...");
  for (const p of patterns) {
    await sql`
      INSERT INTO patterns (name, archetype, source_project, source_file, layout_tree, code_example, is_active)
      VALUES (${p.name}, ${p.archetype}, ${p.source_project}, ${p.source_file || null}, ${p.layout_tree}, ${p.code_example || null}, true)
    `;
    console.log("  + " + p.name + " (" + p.source_project + ", " + p.archetype + ")");
  }
  console.log("\nDone! " + patterns.length + " patterns seeded.");
  await sql.end();
}

seed().catch(e => { console.error(e.message); sql.end(); });
