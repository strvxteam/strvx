import fs from "fs";
import postgres from "postgres";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DIRECT_URL="([^"]+)"/);
if (!match) { console.error("No DIRECT_URL in .env.local"); process.exit(1); }
const sql = postgres(match[1], { prepare: false, connect_timeout: 15 });

const libraries = [
  {
    name: "shadcn/ui", slug: "shadcn-ui",
    url: "https://ui.shadcn.com", github_url: "https://github.com/shadcn-ui/ui",
    description: "Beautifully designed components built with Radix UI and Tailwind CSS. Copy-paste into your apps.",
    install_method: "shadcn-cli", license: "MIT", category: "base",
    components: [
      { name: "Button", slug: "button", category: "button", install_command: "npx shadcn@latest add button", import_path: "@/components/ui/button", status: "installed" },
      { name: "Card", slug: "card", category: "card", install_command: "npx shadcn@latest add card", import_path: "@/components/ui/card", status: "installed" },
      { name: "Dialog", slug: "dialog", category: "overlay", install_command: "npx shadcn@latest add dialog", import_path: "@/components/ui/dialog", status: "installed" },
      { name: "Input", slug: "input", category: "input", install_command: "npx shadcn@latest add input", import_path: "@/components/ui/input", status: "installed" },
      { name: "Select", slug: "select", category: "input", install_command: "npx shadcn@latest add select", import_path: "@/components/ui/select", status: "installed" },
      { name: "Table", slug: "table", category: "table", install_command: "npx shadcn@latest add table", import_path: "@/components/ui/table", status: "installed" },
      { name: "Tabs", slug: "tabs", category: "navigation", install_command: "npx shadcn@latest add tabs", import_path: "@/components/ui/tabs", status: "installed" },
      { name: "Badge", slug: "badge", category: "data-display", install_command: "npx shadcn@latest add badge", import_path: "@/components/ui/badge", status: "installed" },
      { name: "Sheet", slug: "sheet", category: "overlay", install_command: "npx shadcn@latest add sheet", import_path: "@/components/ui/sheet", status: "installed" },
      { name: "Tooltip", slug: "tooltip", category: "overlay", install_command: "npx shadcn@latest add tooltip", import_path: "@/components/ui/tooltip", status: "installed" },
      { name: "Dropdown Menu", slug: "dropdown-menu", category: "overlay", install_command: "npx shadcn@latest add dropdown-menu", import_path: "@/components/ui/dropdown-menu", status: "installed" },
      { name: "Skeleton", slug: "skeleton", category: "feedback", install_command: "npx shadcn@latest add skeleton", import_path: "@/components/ui/skeleton", status: "installed" },
      { name: "Scroll Area", slug: "scroll-area", category: "layout", install_command: "npx shadcn@latest add scroll-area", import_path: "@/components/ui/scroll-area", status: "installed" },
      { name: "Separator", slug: "separator", category: "layout", install_command: "npx shadcn@latest add separator", import_path: "@/components/ui/separator", status: "installed" },
      { name: "Avatar", slug: "avatar", category: "data-display", install_command: "npx shadcn@latest add avatar", import_path: "@/components/ui/avatar", status: "installed" },
      { name: "Label", slug: "label", category: "form", install_command: "npx shadcn@latest add label", import_path: "@/components/ui/label", status: "installed" },
      { name: "Popover", slug: "popover", category: "overlay", install_command: "npx shadcn@latest add popover", import_path: "@/components/ui/popover", status: "installed" },
      { name: "Command", slug: "command", category: "input", install_command: "npx shadcn@latest add command", import_path: "@/components/ui/command", status: "installed" },
      { name: "Textarea", slug: "textarea", category: "input", install_command: "npx shadcn@latest add textarea", import_path: "@/components/ui/textarea", status: "installed" },
      { name: "Progress", slug: "progress", category: "feedback", install_command: "npx shadcn@latest add progress", import_path: "@/components/ui/progress", status: "installed" },
    ],
  },
  {
    name: "Tremor", slug: "tremor",
    url: "https://tremor.so", github_url: "https://github.com/tremorlabs/tremor",
    description: "React components to build charts and dashboards. Built on top of Tailwind CSS and Recharts.",
    install_method: "npm", license: "Apache-2.0", category: "data",
    components: [
      { name: "Area Chart", slug: "area-chart", category: "chart", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
      { name: "Bar Chart", slug: "bar-chart", category: "chart", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
      { name: "Line Chart", slug: "line-chart", category: "chart", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
      { name: "Donut Chart", slug: "donut-chart", category: "chart", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
      { name: "Bar List", slug: "bar-list", category: "chart", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
      { name: "Spark Chart", slug: "spark-chart", category: "chart", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
      { name: "Tracker", slug: "tracker", category: "data-display", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
      { name: "KPI Card", slug: "kpi-card", category: "card", install_command: "npm i @tremor/react", import_path: "@tremor/react", status: "available" },
    ],
  },
  {
    name: "TanStack Table", slug: "tanstack-table",
    url: "https://tanstack.com/table", github_url: "https://github.com/TanStack/table",
    description: "Headless UI for building powerful tables & datagrids. Framework agnostic, type-safe, with sorting, filtering, pagination.",
    install_method: "npm", license: "MIT", category: "data",
    components: [
      { name: "Data Table", slug: "data-table", category: "table", install_command: "npm i @tanstack/react-table", import_path: "@tanstack/react-table", status: "available", tags: ["sorting", "filtering", "pagination"] },
      { name: "Column Def", slug: "column-def", category: "table", install_command: "npm i @tanstack/react-table", import_path: "@tanstack/react-table", status: "available" },
      { name: "Virtual Table", slug: "virtual-table", category: "table", install_command: "npm i @tanstack/react-table @tanstack/react-virtual", import_path: "@tanstack/react-table", status: "available", tags: ["virtual", "performance"] },
    ],
  },
  {
    name: "Motion Primitives", slug: "motion-primitives",
    url: "https://motion-primitives.com", github_url: "https://github.com/ibelick/motion-primitives",
    description: "Beautiful, accessible animation components for React. Built with Framer Motion.",
    install_method: "copy-paste", license: "MIT", category: "animation",
    components: [
      { name: "Animated Number", slug: "animated-number", category: "animation", status: "available", tags: ["counter", "number"] },
      { name: "Text Effect", slug: "text-effect", category: "text-effect", status: "available", tags: ["text", "reveal"] },
      { name: "Transition Panel", slug: "transition-panel", category: "animation", status: "available" },
      { name: "Morphing Dialog", slug: "morphing-dialog", category: "animation", status: "available" },
      { name: "Animated Background", slug: "animated-background", category: "background", status: "available" },
      { name: "In View", slug: "in-view", category: "animation", status: "available", tags: ["scroll", "intersection"] },
      { name: "Accordion", slug: "accordion", category: "layout", status: "available" },
      { name: "Cursor Follow", slug: "cursor-follow", category: "animation", status: "available" },
    ],
  },
  {
    name: "Plate.js", slug: "platejs",
    url: "https://platejs.org", github_url: "https://github.com/udecode/plate",
    description: "Rich-text editor framework for React. Plugin-based architecture with 50+ plugins.",
    install_method: "npm", license: "MIT", category: "editor",
    components: [
      { name: "Editor", slug: "editor", category: "editor", install_command: "npm i @udecode/plate", import_path: "@udecode/plate", status: "installed", tags: ["rich-text", "wysiwyg"] },
      { name: "Toolbar", slug: "toolbar", category: "editor", install_command: "npm i @udecode/plate", import_path: "@udecode/plate", status: "installed" },
      { name: "Mention Plugin", slug: "mention", category: "editor", install_command: "npm i @udecode/plate-mention", import_path: "@udecode/plate-mention", status: "available" },
      { name: "Table Plugin", slug: "table-plugin", category: "editor", install_command: "npm i @udecode/plate-table", import_path: "@udecode/plate-table", status: "available" },
      { name: "AI Plugin", slug: "ai-plugin", category: "ai", install_command: "npm i @udecode/plate-ai", import_path: "@udecode/plate-ai", status: "available" },
    ],
  },
  {
    name: "Prompt Kit", slug: "prompt-kit",
    url: "https://prompt-kit.com", github_url: "https://github.com/ibelick/prompt-kit",
    description: "AI chat UI components for React. Message bubbles, streaming text, prompt inputs, and more.",
    install_method: "copy-paste", license: "MIT", category: "ai",
    components: [
      { name: "Chat Container", slug: "chat-container", category: "layout", status: "available", tags: ["chat", "ai"] },
      { name: "Message", slug: "message", category: "data-display", status: "available", tags: ["chat", "bubble"] },
      { name: "Prompt Input", slug: "prompt-input", category: "input", status: "available", tags: ["ai", "textarea"] },
      { name: "Markdown Renderer", slug: "markdown-renderer", category: "data-display", status: "available", tags: ["markdown", "ai"] },
      { name: "Streaming Text", slug: "streaming-text", category: "text-effect", status: "available", tags: ["stream", "ai"] },
      { name: "Loading Dots", slug: "loading-dots", category: "feedback", status: "available" },
    ],
  },
  {
    name: "Magic UI", slug: "magic-ui",
    url: "https://magicui.design", github_url: "https://github.com/magicuidesign/magicui",
    description: "50+ free animated components built with React, Typescript, Tailwind CSS, and Framer Motion.",
    install_method: "copy-paste", license: "MIT", category: "animation",
    components: [
      { name: "Marquee", slug: "marquee", category: "animation", status: "available" },
      { name: "Globe", slug: "globe", category: "background", status: "available", tags: ["3d", "hero"] },
      { name: "Dock", slug: "dock", category: "navigation", status: "available" },
      { name: "Bento Grid", slug: "bento-grid", category: "layout", status: "available" },
      { name: "Particles", slug: "particles", category: "background", status: "available" },
      { name: "Number Ticker", slug: "number-ticker", category: "animation", status: "available" },
      { name: "Blur Fade", slug: "blur-fade", category: "animation", status: "available" },
      { name: "Shine Border", slug: "shine-border", category: "animation", status: "available" },
      { name: "Ripple", slug: "ripple", category: "animation", status: "available" },
    ],
  },
  {
    name: "Aceternity UI", slug: "aceternity-ui",
    url: "https://ui.aceternity.com", github_url: "https://github.com/steven-tey/aceternity-ui",
    description: "Trending animated components. Copy-paste with Tailwind CSS and Framer Motion.",
    install_method: "copy-paste", license: "MIT", category: "animation",
    components: [
      { name: "3D Card", slug: "3d-card", category: "card", status: "available", tags: ["3d", "tilt"] },
      { name: "Spotlight", slug: "spotlight", category: "background", status: "available" },
      { name: "Floating Navbar", slug: "floating-navbar", category: "navigation", status: "available" },
      { name: "Infinite Scroll", slug: "infinite-scroll", category: "animation", status: "available" },
      { name: "Lamp Effect", slug: "lamp-effect", category: "background", status: "available" },
      { name: "Text Generate", slug: "text-generate", category: "text-effect", status: "available" },
      { name: "Background Beams", slug: "background-beams", category: "background", status: "available" },
    ],
  },
  {
    name: "Origin UI", slug: "origin-ui",
    url: "https://originui.com", github_url: "https://github.com/origin-space/originui",
    description: "Beautiful UI components built with Tailwind CSS and React. Copy-paste ready.",
    install_method: "copy-paste", license: "MIT", category: "base",
    components: [
      { name: "Buttons Collection", slug: "buttons", category: "button", status: "available" },
      { name: "Inputs Collection", slug: "inputs", category: "input", status: "available" },
      { name: "Cards Collection", slug: "cards", category: "card", status: "available" },
      { name: "Notifications", slug: "notifications", category: "feedback", status: "available" },
      { name: "Sidebars", slug: "sidebars", category: "navigation", status: "available" },
      { name: "Tables Collection", slug: "tables", category: "table", status: "available" },
    ],
  },
  {
    name: "Kokonut UI", slug: "kokonut-ui",
    url: "https://kokonut.dev", github_url: "https://github.com/kokonut-labs/kokonutui",
    description: "Open-source UI library with modern, accessible components for React and Next.js.",
    install_method: "copy-paste", license: "MIT", category: "base",
    components: [
      { name: "Action Buttons", slug: "action-buttons", category: "button", status: "available" },
      { name: "Floating Cards", slug: "floating-cards", category: "card", status: "available" },
      { name: "List Items", slug: "list-items", category: "data-display", status: "available" },
      { name: "Profile Cards", slug: "profile-cards", category: "card", status: "available" },
      { name: "Text Blocks", slug: "text-blocks", category: "data-display", status: "available" },
    ],
  },
  {
    name: "Radix UI", slug: "radix-ui",
    url: "https://radix-ui.com", github_url: "https://github.com/radix-ui/primitives",
    description: "Unstyled, accessible primitives for building high-quality design systems and web apps.",
    install_method: "npm", license: "MIT", category: "base",
    components: [
      { name: "Alert Dialog", slug: "alert-dialog", category: "overlay", install_command: "npm i @radix-ui/react-alert-dialog", import_path: "@radix-ui/react-alert-dialog", status: "installed" },
      { name: "Checkbox", slug: "checkbox", category: "form", install_command: "npm i @radix-ui/react-checkbox", import_path: "@radix-ui/react-checkbox", status: "available" },
      { name: "Context Menu", slug: "context-menu", category: "overlay", install_command: "npm i @radix-ui/react-context-menu", import_path: "@radix-ui/react-context-menu", status: "available" },
      { name: "Navigation Menu", slug: "navigation-menu", category: "navigation", install_command: "npm i @radix-ui/react-navigation-menu", import_path: "@radix-ui/react-navigation-menu", status: "available" },
      { name: "Radio Group", slug: "radio-group", category: "form", install_command: "npm i @radix-ui/react-radio-group", import_path: "@radix-ui/react-radio-group", status: "available" },
      { name: "Switch", slug: "switch", category: "form", install_command: "npm i @radix-ui/react-switch", import_path: "@radix-ui/react-switch", status: "available" },
      { name: "Toggle", slug: "toggle", category: "form", install_command: "npm i @radix-ui/react-toggle", import_path: "@radix-ui/react-toggle", status: "available" },
    ],
  },
  {
    name: "HeroUI", slug: "heroui",
    url: "https://heroui.com", github_url: "https://github.com/heroui-inc/heroui",
    description: "Beautiful, fast, modern React UI library. Built on top of Tailwind CSS and React Aria.",
    install_method: "npm", license: "MIT", category: "full",
    components: [
      { name: "Autocomplete", slug: "autocomplete", category: "input", install_command: "npm i @heroui/autocomplete", import_path: "@heroui/autocomplete", status: "available" },
      { name: "Date Picker", slug: "date-picker", category: "input", install_command: "npm i @heroui/date-picker", import_path: "@heroui/date-picker", status: "available" },
      { name: "Modal", slug: "modal", category: "overlay", install_command: "npm i @heroui/modal", import_path: "@heroui/modal", status: "available" },
      { name: "Navbar", slug: "navbar", category: "navigation", install_command: "npm i @heroui/navbar", import_path: "@heroui/navbar", status: "available" },
      { name: "Pagination", slug: "pagination", category: "navigation", install_command: "npm i @heroui/pagination", import_path: "@heroui/pagination", status: "available" },
      { name: "Spinner", slug: "spinner", category: "feedback", install_command: "npm i @heroui/spinner", import_path: "@heroui/spinner", status: "available" },
    ],
  },
  {
    name: "TipTap", slug: "tiptap",
    url: "https://tiptap.dev", github_url: "https://github.com/ueberdosis/tiptap",
    description: "Headless rich-text editor framework for web. Highly extensible with a ProseMirror core.",
    install_method: "npm", license: "MIT", category: "editor",
    components: [
      { name: "Editor Core", slug: "editor-core", category: "editor", install_command: "npm i @tiptap/react @tiptap/starter-kit", import_path: "@tiptap/react", status: "installed", tags: ["rich-text"] },
      { name: "Collaboration", slug: "collaboration", category: "editor", install_command: "npm i @tiptap/extension-collaboration", import_path: "@tiptap/extension-collaboration", status: "installed" },
      { name: "Mention", slug: "mention", category: "editor", install_command: "npm i @tiptap/extension-mention", import_path: "@tiptap/extension-mention", status: "available" },
      { name: "AI Extension", slug: "ai-extension", category: "ai", install_command: "npm i @tiptap-pro/extension-ai", import_path: "@tiptap-pro/extension-ai", status: "available" },
    ],
  },
  {
    name: "21st.dev", slug: "21st-dev",
    url: "https://21st.dev", github_url: "https://github.com/21st-dev/magic-mcp",
    description: "AI-native component registry. Search and use React components directly from your AI editor.",
    install_method: "copy-paste", license: "MIT", category: "ai",
    components: [
      { name: "AI Component Search", slug: "ai-search", category: "ai", status: "available", tags: ["search", "mcp"] },
      { name: "Magic MCP", slug: "magic-mcp", category: "ai", status: "available", tags: ["mcp", "agent"] },
    ],
  },
  {
    name: "shadcn Blocks", slug: "shadcn-blocks",
    url: "https://ui.shadcn.com/blocks", github_url: "https://github.com/shadcn-ui/ui",
    description: "Pre-built page layouts and sections using shadcn/ui components. Dashboard, auth, settings templates.",
    install_method: "shadcn-cli", license: "MIT", category: "base",
    components: [
      { name: "Dashboard Layout", slug: "dashboard-layout", category: "layout", install_command: "npx shadcn@latest add dashboard-01", status: "available", tags: ["dashboard", "layout"] },
      { name: "Authentication", slug: "authentication", category: "layout", install_command: "npx shadcn@latest add login-01", status: "available", tags: ["auth", "login"] },
      { name: "Settings Page", slug: "settings-page", category: "layout", status: "available", tags: ["settings"] },
      { name: "Sidebar Layout", slug: "sidebar-layout", category: "layout", install_command: "npx shadcn@latest add sidebar-01", status: "available", tags: ["sidebar", "nav"] },
      { name: "Charts Block", slug: "charts-block", category: "chart", install_command: "npx shadcn@latest add chart-area-01", status: "available", tags: ["chart"] },
    ],
  },
];

// Also seed the 8 preset skills from the architecture plan
const presetSkills = [
  {
    name: "Fill Layout", slug: "fill-layout", type: "preset", category: "layout", priority: 1,
    description: "Every page uses <PageShell>. Content extends to viewport bottom. No dead white space.",
    rules: [
      { rule: "Always wrap pages in <PageShell>", detail: "Calculates remaining viewport height, applies flex-col" },
      { rule: "Use h-[calc(100vh-offset)] + flex-grow", detail: "Fill all vertical whitespace" },
      { rule: "No dead white space below content" },
    ],
  },
  {
    name: "Scrollable Panels", slug: "scrollable-panels", type: "preset", category: "layout", priority: 2,
    description: "Content containers have fixed height and overflow-y-auto. Containers never grow with content.",
    rules: [
      { rule: "Use <ScrollPanel> for scrollable content areas" },
      { rule: "Content containers must be fixed-height, never expand with content" },
      { rule: "Containers never grow with content — they scroll" },
    ],
  },
  {
    name: "STRVX Design Tokens", slug: "strvx-design-tokens", type: "preset", category: "design-tokens", priority: 3,
    description: "Color palette, typography scale, spacing, border-radius, shadows. Single source of truth.",
    rules: [
      { rule: "Use the defined color palette — no arbitrary hex values" },
      { rule: "Follow the typography scale for font sizes" },
      { rule: "Use the spacing system (4px grid)" },
      { rule: "Border radius: 6px inputs, 8px cards, 10px modals, 12px sheets" },
    ],
  },
  {
    name: "Component Defaults", slug: "component-defaults", type: "preset", category: "component-preference", priority: 4,
    description: "Base components = shadcn/ui. Charts = Tremor. Tables = TanStack Table + shadcn. Animations = Motion Primitives. Editors = Plate.js. AI chat = Prompt Kit.",
    rules: [
      { rule: "Base UI: shadcn/ui", detail: "Already installed — buttons, inputs, dialogs, cards" },
      { rule: "Charts: Tremor", detail: "Area, bar, line, donut charts" },
      { rule: "Tables: TanStack Table with shadcn styling", detail: "Sorting, filtering, pagination" },
      { rule: "Rich text: Plate.js", detail: "Already installed via doc editor" },
      { rule: "AI chat: Prompt Kit", detail: "Message bubbles, streaming text, prompt inputs" },
      { rule: "Animations: Motion Primitives", detail: "Use sparingly for meaningful transitions" },
    ],
  },
  {
    name: "Table Pattern", slug: "table-pattern", type: "preset", category: "pattern", priority: 5,
    description: "Sortable headers, consistent density, fixed header, scrollable body, row click interaction, loading skeleton.",
    rules: [
      { rule: "Sortable column headers with visual indicator" },
      { rule: "Fixed header row, scrollable body" },
      { rule: "Consistent row density — 13px font, 14px padding" },
      { rule: "Row click opens detail panel or navigates" },
      { rule: "Loading skeleton while data fetches" },
    ],
  },
  {
    name: "Form Pattern", slug: "form-pattern", type: "preset", category: "pattern", priority: 6,
    description: "Zod validation, field grouping, inline errors, disabled states, submit loading, responsive 2-column grid.",
    rules: [
      { rule: "Zod validation on all form schemas" },
      { rule: "Field grouping with labels" },
      { rule: "Inline error messages below fields" },
      { rule: "Disabled state during submission" },
      { rule: "Responsive 2-column grid on desktop, single column mobile" },
    ],
  },
  {
    name: "Card Pattern", slug: "card-pattern", type: "preset", category: "pattern", priority: 7,
    description: "ContentCard with header/body/footer zones, consistent padding, optional scroll body, border style.",
    rules: [
      { rule: "Header/body/footer zones" },
      { rule: "Consistent padding: 16px body, 12px header/footer" },
      { rule: "Optional scrollable body via scroll prop" },
      { rule: "Border: 1px solid #e0e0e0, radius 10px" },
    ],
  },
  {
    name: "Page Pattern", slug: "page-pattern", type: "preset", category: "pattern", priority: 8,
    description: "Every page has: breadcrumb, title + action buttons, content area. Consistent spacing between sections.",
    rules: [
      { rule: "Breadcrumb navigation at top" },
      { rule: "Title + action buttons in header row" },
      { rule: "Consistent 24px spacing between sections" },
      { rule: "Content area fills remaining viewport" },
    ],
  },
];

async function seed() {
  console.log("Seeding 15 libraries...");

  for (const lib of libraries) {
    const { components, ...libData } = lib;

    // Insert library
    const [inserted] = await sql`
      INSERT INTO skill_libraries (name, slug, url, github_url, description, install_method, license, category, is_active)
      VALUES (${libData.name}, ${libData.slug}, ${libData.url}, ${libData.github_url}, ${libData.description}, ${libData.install_method}, ${libData.license}, ${libData.category}, true)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;

    console.log(`  + ${libData.name} (${components.length} components)`);

    // Insert components
    for (const comp of components) {
      await sql`
        INSERT INTO skill_components (library_id, name, slug, category, install_command, import_path, status, tags)
        VALUES (${inserted.id}, ${comp.name}, ${comp.slug}, ${comp.category}, ${comp.install_command || null}, ${comp.import_path || null}, ${comp.status || "available"}, ${comp.tags || null})
        ON CONFLICT (library_id, slug) DO UPDATE SET name = EXCLUDED.name
      `;
    }
  }

  console.log("\nSeeding 8 preset skills...");
  for (const skill of presetSkills) {
    await sql`
      INSERT INTO skills (name, slug, description, type, category, rules, priority, is_active)
      VALUES (${skill.name}, ${skill.slug}, ${skill.description}, ${skill.type}, ${skill.category}, ${JSON.stringify(skill.rules)}, ${skill.priority}, true)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, rules = EXCLUDED.rules
    `;
    console.log(`  + ${skill.name}`);
  }

  console.log("\nDone!");
  await sql.end();
}

seed().catch((e) => { console.error("Seed failed:", e.message); sql.end(); process.exit(1); });
