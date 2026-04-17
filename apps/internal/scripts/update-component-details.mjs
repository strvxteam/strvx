import fs from "fs";
import postgres from "postgres";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DIRECT_URL="([^"]+)"/);
const sql = postgres(match[1], { prepare: false, connect_timeout: 15, max: 1 });

// Complete component details: key_props + when_to_use for every seeded component
// Also adds NEW components that were missing from the initial seed

const updates = {
  "shadcn-ui": {
    existing: {
      "button": { key_props: "variant (default|destructive|outline|secondary|ghost|link), size (default|sm|lg|icon), asChild, disabled", when_to_use: "Primary actions, form submissions, navigation triggers. Use variant to convey intent." },
      "card": { key_props: "className; composed of CardHeader, CardTitle, CardDescription, CardContent, CardFooter", when_to_use: "Group related content in a bordered container. Dashboard widgets, info panels, list items." },
      "dialog": { key_props: "open, onOpenChange; composed of DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter", when_to_use: "Modal confirmations, forms that need focus, detail views that overlay the page." },
      "input": { key_props: "type, placeholder, disabled, className", when_to_use: "Single-line text entry. Wrap with Label for accessibility." },
      "select": { key_props: "value, onValueChange, defaultValue, disabled; composed of SelectTrigger, SelectContent, SelectItem, SelectValue", when_to_use: "Choosing one option from a predefined list. Use Combobox for searchable lists." },
      "table": { key_props: "composed of Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption", when_to_use: "Displaying structured data in rows and columns. Pair with TanStack Table for sorting/filtering." },
      "tabs": { key_props: "defaultValue, value, onValueChange; composed of TabsList, TabsTrigger, TabsContent", when_to_use: "Switching between related content views without navigation. Dashboard sections, settings panels." },
      "badge": { key_props: "variant (default|secondary|destructive|outline)", when_to_use: "Status indicators, category labels, counts. Inline metadata next to text." },
      "sheet": { key_props: "open, onOpenChange, side (top|right|bottom|left); composed of SheetTrigger, SheetContent, SheetHeader, SheetTitle", when_to_use: "Slide-in panel for detail views, filters, mobile navigation. Use instead of Dialog for side panels." },
      "tooltip": { key_props: "delayDuration, side, align; composed of TooltipProvider, TooltipTrigger, TooltipContent", when_to_use: "Brief explanatory text on hover. Icon-only buttons, truncated text, abbreviations." },
      "dropdown-menu": { key_props: "open, onOpenChange; composed of DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator", when_to_use: "Action menus on buttons, row actions in tables, context-sensitive options." },
      "skeleton": { key_props: "className (set width/height to match content shape)", when_to_use: "Loading placeholders. Match the shape of the content being loaded." },
      "scroll-area": { key_props: "className, type (auto|always|scroll|hover), scrollHideDelay", when_to_use: "Custom scrollbar styling for scrollable containers. Fixed-height panels with overflow." },
      "separator": { key_props: "orientation (horizontal|vertical), decorative", when_to_use: "Visual divider between content sections. Use sparingly — spacing often suffices." },
      "avatar": { key_props: "composed of AvatarImage (src, alt), AvatarFallback (children)", when_to_use: "User profile photos, team member indicators. AvatarFallback shows initials when image fails." },
      "label": { key_props: "htmlFor, className", when_to_use: "Always pair with form inputs for accessibility. Links label clicks to the input." },
      "popover": { key_props: "open, onOpenChange; composed of PopoverTrigger, PopoverContent (side, align)", when_to_use: "Rich content on click — date pickers, color pickers, mini-forms. Use Tooltip for simple text." },
      "command": { key_props: "composed of CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator", when_to_use: "Command palette / search interface. Filterable list of actions or items. Powers the Combobox pattern." },
      "textarea": { key_props: "placeholder, rows, disabled, className", when_to_use: "Multi-line text input. Descriptions, notes, comments." },
      "progress": { key_props: "value (0-100), className", when_to_use: "Show completion progress. Upload progress, step progress, goal tracking." },
    },
    new_components: [
      { name: "Accordion", slug: "accordion", category: "layout", install_command: "npx shadcn@latest add accordion", import_path: "@/components/ui/accordion", key_props: "type (single|multiple), collapsible, defaultValue; AccordionItem, AccordionTrigger, AccordionContent", when_to_use: "Collapsible content sections. FAQs, settings groups, expandable details.", status: "available" },
      { name: "Alert", slug: "alert", category: "feedback", install_command: "npx shadcn@latest add alert", import_path: "@/components/ui/alert", key_props: "variant (default|destructive); AlertTitle, AlertDescription", when_to_use: "Important messages — errors, warnings, success confirmations. Not for toasts.", status: "available" },
      { name: "Alert Dialog", slug: "alert-dialog", category: "overlay", install_command: "npx shadcn@latest add alert-dialog", import_path: "@/components/ui/alert-dialog", key_props: "open, onOpenChange; AlertDialogAction, AlertDialogCancel, AlertDialogContent", when_to_use: "Destructive action confirmation. Delete, discard changes. Requires explicit user decision.", status: "available" },
      { name: "Aspect Ratio", slug: "aspect-ratio", category: "layout", install_command: "npx shadcn@latest add aspect-ratio", import_path: "@/components/ui/aspect-ratio", key_props: "ratio (default 1)", when_to_use: "Maintain aspect ratio for images/videos. Responsive media containers.", status: "available" },
      { name: "Breadcrumb", slug: "breadcrumb", category: "navigation", install_command: "npx shadcn@latest add breadcrumb", import_path: "@/components/ui/breadcrumb", key_props: "composed of BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator", when_to_use: "Page hierarchy navigation. Show current location in app structure.", status: "available" },
      { name: "Calendar", slug: "calendar", category: "input", install_command: "npx shadcn@latest add calendar", import_path: "@/components/ui/calendar", key_props: "mode (single|range|multiple), selected, onSelect, disabled", when_to_use: "Date selection. Use inside a Popover for date picker pattern.", status: "available" },
      { name: "Carousel", slug: "carousel", category: "data-display", install_command: "npx shadcn@latest add carousel", import_path: "@/components/ui/carousel", key_props: "opts (align, loop), orientation; CarouselContent, CarouselItem, CarouselPrevious, CarouselNext", when_to_use: "Sliding content panels. Image galleries, testimonials, onboarding steps.", status: "available" },
      { name: "Chart", slug: "chart", category: "chart", install_command: "npx shadcn@latest add chart", import_path: "@/components/ui/chart", key_props: "ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend", when_to_use: "Wrapper for Recharts with consistent theming. Use Tremor for simpler chart needs.", status: "available" },
      { name: "Checkbox", slug: "checkbox", category: "form", install_command: "npx shadcn@latest add checkbox", import_path: "@/components/ui/checkbox", key_props: "checked, onCheckedChange, disabled, id", when_to_use: "Boolean toggle in forms. Multi-select lists. Pair with Label.", status: "available" },
      { name: "Collapsible", slug: "collapsible", category: "layout", install_command: "npx shadcn@latest add collapsible", import_path: "@/components/ui/collapsible", key_props: "open, onOpenChange; CollapsibleTrigger, CollapsibleContent", when_to_use: "Simple show/hide toggle. Less structured than Accordion.", status: "available" },
      { name: "Combobox", slug: "combobox", category: "input", install_command: "npx shadcn@latest add combobox", import_path: "Pattern using Popover + Command", key_props: "Combines Popover + Command for searchable dropdown", when_to_use: "Searchable select dropdown. When the option list is long or needs filtering.", status: "available" },
      { name: "Context Menu", slug: "context-menu", category: "overlay", install_command: "npx shadcn@latest add context-menu", import_path: "@/components/ui/context-menu", key_props: "ContextMenuTrigger, ContextMenuContent, ContextMenuItem", when_to_use: "Right-click menus. Power-user shortcuts for table rows, canvas elements.", status: "available" },
      { name: "Data Table", slug: "data-table", category: "table", install_command: "npx shadcn@latest add table", import_path: "Pattern using Table + @tanstack/react-table", key_props: "columns, data, sorting, filtering, pagination via TanStack Table", when_to_use: "Complex data tables with sorting, filtering, pagination. The standard table pattern for strvx.", status: "available" },
      { name: "Date Picker", slug: "date-picker", category: "input", install_command: "npx shadcn@latest add calendar popover button", import_path: "Pattern using Popover + Calendar", key_props: "Combines Popover + Calendar + Button for date selection", when_to_use: "Date input field. Due dates, scheduled dates, date filters.", status: "available" },
      { name: "Drawer", slug: "drawer", category: "overlay", install_command: "npx shadcn@latest add drawer", import_path: "@/components/ui/drawer", key_props: "open, onOpenChange, direction; DrawerTrigger, DrawerContent, DrawerHeader, DrawerFooter", when_to_use: "Bottom sheet on mobile. Alternative to Dialog for touch-friendly interfaces.", status: "available" },
      { name: "Form", slug: "form", category: "form", install_command: "npx shadcn@latest add form", import_path: "@/components/ui/form", key_props: "Uses react-hook-form + zod. FormField, FormItem, FormLabel, FormControl, FormMessage", when_to_use: "Complex forms with validation. Integrates Zod schemas with react-hook-form.", status: "available" },
      { name: "Hover Card", slug: "hover-card", category: "overlay", install_command: "npx shadcn@latest add hover-card", import_path: "@/components/ui/hover-card", key_props: "openDelay, closeDelay; HoverCardTrigger, HoverCardContent", when_to_use: "Rich preview on hover. User profile cards, link previews.", status: "available" },
      { name: "Input OTP", slug: "input-otp", category: "input", install_command: "npx shadcn@latest add input-otp", import_path: "@/components/ui/input-otp", key_props: "maxLength, value, onChange; InputOTPGroup, InputOTPSlot, InputOTPSeparator", when_to_use: "One-time password / verification code input. Fixed-length numeric codes.", status: "available" },
      { name: "Menubar", slug: "menubar", category: "navigation", install_command: "npx shadcn@latest add menubar", import_path: "@/components/ui/menubar", key_props: "MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem", when_to_use: "Desktop application-style menu bar. File/Edit/View menus.", status: "available" },
      { name: "Navigation Menu", slug: "navigation-menu", category: "navigation", install_command: "npx shadcn@latest add navigation-menu", import_path: "@/components/ui/navigation-menu", key_props: "NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger, NavigationMenuContent, NavigationMenuLink", when_to_use: "Top navigation with dropdown mega-menus. Marketing sites, multi-section apps.", status: "available" },
      { name: "Pagination", slug: "pagination", category: "navigation", install_command: "npx shadcn@latest add pagination", import_path: "@/components/ui/pagination", key_props: "PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis", when_to_use: "Page navigation for paginated data. Tables, search results, lists.", status: "available" },
      { name: "Radio Group", slug: "radio-group", category: "form", install_command: "npx shadcn@latest add radio-group", import_path: "@/components/ui/radio-group", key_props: "value, onValueChange, defaultValue; RadioGroupItem", when_to_use: "Single selection from a small set of options (2-5). Use Select for larger sets.", status: "available" },
      { name: "Resizable", slug: "resizable", category: "layout", install_command: "npx shadcn@latest add resizable", import_path: "@/components/ui/resizable", key_props: "ResizablePanelGroup (direction), ResizablePanel (defaultSize), ResizableHandle", when_to_use: "Resizable split panels. Code editors, side-by-side layouts.", status: "available" },
      { name: "Slider", slug: "slider", category: "input", install_command: "npx shadcn@latest add slider", import_path: "@/components/ui/slider", key_props: "value, onValueChange, min, max, step, disabled", when_to_use: "Numeric range input. Volume, price ranges, opacity controls.", status: "available" },
      { name: "Sonner", slug: "sonner", category: "feedback", install_command: "npx shadcn@latest add sonner", import_path: "@/components/ui/sonner", key_props: "toast(message), toast.success(), toast.error(), toast.promise()", when_to_use: "Toast notifications. Success/error feedback after actions. Already installed in strvx.", status: "installed" },
      { name: "Switch", slug: "switch", category: "form", install_command: "npx shadcn@latest add switch", import_path: "@/components/ui/switch", key_props: "checked, onCheckedChange, disabled, id", when_to_use: "Toggle setting on/off. Preferences, feature flags. Use Checkbox for form multi-select.", status: "available" },
      { name: "Toggle", slug: "toggle", category: "form", install_command: "npx shadcn@latest add toggle", import_path: "@/components/ui/toggle", key_props: "pressed, onPressedChange, variant (default|outline), size", when_to_use: "Toggleable button. Bold/italic in editors, view mode switches.", status: "available" },
      { name: "Toggle Group", slug: "toggle-group", category: "form", install_command: "npx shadcn@latest add toggle-group", import_path: "@/components/ui/toggle-group", key_props: "type (single|multiple), value, onValueChange; ToggleGroupItem", when_to_use: "Group of toggles for single or multi selection. View modes, alignment options.", status: "available" },
    ],
  },
};

async function run() {
  // Update existing components with key_props and when_to_use
  for (const [libSlug, data] of Object.entries(updates)) {
    const [lib] = await sql`SELECT id FROM skill_libraries WHERE slug = ${libSlug}`;
    if (!lib) { console.log("Library not found: " + libSlug); continue; }

    if (data.existing) {
      for (const [compSlug, details] of Object.entries(data.existing)) {
        await sql`
          UPDATE skill_components
          SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use}
          WHERE library_id = ${lib.id} AND slug = ${compSlug}
        `;
      }
      console.log(`Updated ${Object.keys(data.existing).length} components in ${libSlug}`);
    }

    if (data.new_components) {
      for (const comp of data.new_components) {
        await sql`
          INSERT INTO skill_components (library_id, name, slug, category, install_command, import_path, key_props, when_to_use, status)
          VALUES (${lib.id}, ${comp.name}, ${comp.slug}, ${comp.category}, ${comp.install_command || null}, ${comp.import_path || null}, ${comp.key_props || null}, ${comp.when_to_use || null}, ${comp.status})
          ON CONFLICT (library_id, slug) DO UPDATE SET key_props = EXCLUDED.key_props, when_to_use = EXCLUDED.when_to_use
        `;
      }
      console.log(`Added ${data.new_components.length} new components to ${libSlug}`);
    }
  }

  // Update Tremor components
  const [tremor] = await sql`SELECT id FROM skill_libraries WHERE slug = 'tremor'`;
  if (tremor) {
    const tremorDetails = {
      "area-chart": { key_props: "data, index, categories, colors, valueFormatter, showLegend, showGridLines, showAnimation", when_to_use: "Time series data, trends over time. Revenue, traffic, growth metrics." },
      "bar-chart": { key_props: "data, index, categories, colors, layout (vertical|horizontal), stack", when_to_use: "Comparing quantities across categories. Monthly revenue, team performance." },
      "line-chart": { key_props: "data, index, categories, colors, curveType, connectNulls", when_to_use: "Continuous data trends. Multiple series comparison over time." },
      "donut-chart": { key_props: "data, index, category, colors, variant (donut|pie), showAnimation", when_to_use: "Part-to-whole relationships. Revenue breakdown, category distribution." },
      "bar-list": { key_props: "data (name + value), sortOrder (ascending|descending|none), showAnimation", when_to_use: "Ranked horizontal bars. Top pages, top clients, leaderboards." },
      "spark-chart": { key_props: "data, index, categories, type (area|bar|line)", when_to_use: "Tiny inline charts. KPI cards, table cells, compact dashboards." },
      "tracker": { key_props: "data (color + tooltip), className", when_to_use: "Status timeline. Uptime monitors, build status history, availability." },
      "kpi-card": { key_props: "Pattern using Card + Text + Metric + Flex", when_to_use: "Key metric display. Revenue, client count, conversion rate." },
    };
    for (const [slug, details] of Object.entries(tremorDetails)) {
      await sql`UPDATE skill_components SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use} WHERE library_id = ${tremor.id} AND slug = ${slug}`;
    }
    console.log("Updated 8 Tremor components");
  }

  // Update TanStack Table
  const [tanstack] = await sql`SELECT id FROM skill_libraries WHERE slug = 'tanstack-table'`;
  if (tanstack) {
    const tanstackDetails = {
      "data-table": { key_props: "useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, columnDef (accessorKey, header, cell)", when_to_use: "Any data table that needs sorting, filtering, or pagination. The standard for strvx tables." },
      "column-def": { key_props: "accessorKey, header, cell, enableSorting, enableHiding, filterFn, size", when_to_use: "Define table column configuration. Each column gets its own def." },
      "virtual-table": { key_props: "useVirtualizer, estimateSize, overscan, getScrollElement", when_to_use: "Tables with 1000+ rows. Virtualize to render only visible rows for performance." },
    };
    for (const [slug, details] of Object.entries(tanstackDetails)) {
      await sql`UPDATE skill_components SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use} WHERE library_id = ${tanstack.id} AND slug = ${slug}`;
    }
    console.log("Updated 3 TanStack Table components");
  }

  // Update Motion Primitives
  const [motion] = await sql`SELECT id FROM skill_libraries WHERE slug = 'motion-primitives'`;
  if (motion) {
    const motionDetails = {
      "animated-number": { key_props: "value, springOptions (stiffness, damping), className", when_to_use: "Animating number changes. KPI counters, score updates, price changes." },
      "text-effect": { key_props: "children, per (char|word|line), preset (fade|slide|blur|scale), delay, trigger", when_to_use: "Text reveal animations. Hero headlines, section titles on scroll." },
      "transition-panel": { key_props: "activeIndex, variants, transition, className", when_to_use: "Animated content switching. Tab transitions, step wizards." },
      "morphing-dialog": { key_props: "transition; MorphingDialogTrigger, MorphingDialogContent", when_to_use: "Dialog that morphs from the trigger element. Smooth card-to-detail transitions." },
      "animated-background": { key_props: "defaultValue, transition, className; AnimatedBackgroundItem", when_to_use: "Animated tab/segment indicator. Smooth background sliding between items." },
      "in-view": { key_props: "children, variants (hidden, visible), transition, viewOptions (once, margin)", when_to_use: "Trigger animation when element scrolls into view. Section reveals, lazy content." },
      "accordion": { key_props: "type, collapsible; AccordionItem, AccordionTrigger, AccordionContent", when_to_use: "Animated accordion with smooth height transitions. FAQ sections." },
      "cursor-follow": { key_props: "children, className, springConfig", when_to_use: "Element that follows cursor. Interactive hover effects, custom cursors." },
    };
    for (const [slug, details] of Object.entries(motionDetails)) {
      await sql`UPDATE skill_components SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use} WHERE library_id = ${motion.id} AND slug = ${slug}`;
    }
    console.log("Updated 8 Motion Primitives components");
  }

  // Update Plate.js
  const [plate] = await sql`SELECT id FROM skill_libraries WHERE slug = 'platejs'`;
  if (plate) {
    const plateDetails = {
      "editor": { key_props: "plugins, initialValue, onChange, editableProps, renderElement, renderLeaf", when_to_use: "Rich text editing. Document editor, notes, comments. Already installed in strvx docs." },
      "toolbar": { key_props: "ToolbarButton, ToolbarGroup, ToolbarSeparator", when_to_use: "Formatting toolbar for the editor. Bold, italic, lists, headings." },
      "mention": { key_props: "trigger (@), createMentionNode, insertMention, MentionElement", when_to_use: "@ mentions in editor. Tag team members, reference documents." },
      "table-plugin": { key_props: "createTablePlugin, TableElement, TableRowElement, TableCellElement", when_to_use: "Tables inside the rich text editor. Structured data within documents." },
      "ai-plugin": { key_props: "createAIPlugin, AIMenu, AIToolbar", when_to_use: "AI-powered writing assistance inside the editor. Auto-complete, rewrite, summarize." },
    };
    for (const [slug, details] of Object.entries(plateDetails)) {
      await sql`UPDATE skill_components SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use} WHERE library_id = ${plate.id} AND slug = ${slug}`;
    }
    console.log("Updated 5 Plate.js components");
  }

  // Update Prompt Kit
  const [pk] = await sql`SELECT id FROM skill_libraries WHERE slug = 'prompt-kit'`;
  if (pk) {
    const pkDetails = {
      "chat-container": { key_props: "className, children", when_to_use: "Wrapper for AI chat interface. Handles scroll-to-bottom, message layout." },
      "message": { key_props: "role (user|assistant), content, avatar, isLoading", when_to_use: "Individual chat message bubble. Supports markdown rendering." },
      "prompt-input": { key_props: "value, onValueChange, onSubmit, placeholder, disabled, isLoading", when_to_use: "AI prompt text input with submit button. Auto-growing textarea." },
      "markdown-renderer": { key_props: "content, className", when_to_use: "Render markdown from AI responses. Code blocks, lists, headings." },
      "streaming-text": { key_props: "text, speed, onComplete", when_to_use: "Typewriter effect for AI streaming responses. Character-by-character reveal." },
      "loading-dots": { key_props: "className, size", when_to_use: "AI thinking indicator. Three animated dots while waiting for response." },
    };
    for (const [slug, details] of Object.entries(pkDetails)) {
      await sql`UPDATE skill_components SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use} WHERE library_id = ${pk.id} AND slug = ${slug}`;
    }
    console.log("Updated 6 Prompt Kit components");
  }

  // Update Magic UI
  const [magic] = await sql`SELECT id FROM skill_libraries WHERE slug = 'magic-ui'`;
  if (magic) {
    const magicDetails = {
      "marquee": { key_props: "pauseOnHover, reverse, vertical, repeat, className", when_to_use: "Scrolling logo bars, testimonial carousels, continuous content strips." },
      "globe": { key_props: "className, config (phi, theta, markers)", when_to_use: "3D interactive globe. Hero sections showing global reach." },
      "dock": { key_props: "direction, magnification, distance; DockIcon", when_to_use: "macOS-style dock navigation. Bottom navigation with magnification effect." },
      "bento-grid": { key_props: "className, children; BentoCard (name, description, href, Icon, background)", when_to_use: "Feature showcase grid. Landing pages, product overview sections." },
      "particles": { key_props: "quantity, staticity, ease, color, size, refresh", when_to_use: "Particle background effect. Hero sections, decorative backgrounds." },
      "number-ticker": { key_props: "value, direction (up|down), delay, className", when_to_use: "Animated counting number. Statistics, metrics, achievement counters." },
      "blur-fade": { key_props: "delay, duration, yOffset, inView, className", when_to_use: "Blur + fade-in entrance animation. Content sections loading in." },
      "shine-border": { key_props: "borderRadius, borderWidth, duration, color, className", when_to_use: "Animated shining border effect. Featured cards, premium elements." },
      "ripple": { key_props: "mainCircleSize, mainCircleOpacity, numCircles", when_to_use: "Expanding ripple animation. Background decoration, call-to-action emphasis." },
    };
    for (const [slug, details] of Object.entries(magicDetails)) {
      await sql`UPDATE skill_components SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use} WHERE library_id = ${magic.id} AND slug = ${slug}`;
    }
    console.log("Updated 9 Magic UI components");
  }

  // Update Aceternity UI
  const [ace] = await sql`SELECT id FROM skill_libraries WHERE slug = 'aceternity-ui'`;
  if (ace) {
    const aceDetails = {
      "3d-card": { key_props: "CardContainer, CardBody, CardItem (translateZ, rotateX, rotateY)", when_to_use: "Interactive 3D tilt card on hover. Feature cards, portfolio items." },
      "spotlight": { key_props: "className, fill", when_to_use: "Spotlight hover effect on cards. Highlight elements on mouse move." },
      "floating-navbar": { key_props: "navItems (name, link, icon), className", when_to_use: "Floating pill-shaped navbar. Landing page navigation." },
      "infinite-scroll": { key_props: "items, direction (left|right), speed, pauseOnHover", when_to_use: "Infinite scrolling content strip. Logo bars, testimonials." },
      "lamp-effect": { key_props: "className, children", when_to_use: "Dramatic lamp/glow effect. Hero section headlines, feature reveals." },
      "text-generate": { key_props: "words, className, filter, duration", when_to_use: "Word-by-word text generation animation. AI-themed hero text." },
      "background-beams": { key_props: "className", when_to_use: "Animated beam lines background. Form backgrounds, hero sections." },
    };
    for (const [slug, details] of Object.entries(aceDetails)) {
      await sql`UPDATE skill_components SET key_props = ${details.key_props}, when_to_use = ${details.when_to_use} WHERE library_id = ${ace.id} AND slug = ${slug}`;
    }
    console.log("Updated 7 Aceternity UI components");
  }

  // Get final count
  const [total] = await sql`SELECT count(*) as count FROM skill_components`;
  const [withProps] = await sql`SELECT count(*) as count FROM skill_components WHERE key_props IS NOT NULL`;
  console.log(`\nTotal components: ${total.count}, with key_props: ${withProps.count}`);

  await sql.end();
}

run().catch(e => { console.error(e.message); sql.end(); });
