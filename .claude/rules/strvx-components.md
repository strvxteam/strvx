# STRVX Component Reference

> 675 components across 15 libraries.
> Libraries marked [INSTALLED] can be used immediately.
> Others need `npm install` first — check before importing.
> Prefer installed libraries: shadcn/ui > Radix > TipTap > recharts > framer-motion > others

## button (10)

**Radix UI** [INSTALLED via shadcn]
- Toggle Group — Use for segmented controls, text alignment selectors, view mode toggle (`@radix-ui/react-toggle-group`)
**shadcn/ui** [INSTALLED — PREFERRED]
- Button — Use for any clickable action - form submissions, navigation triggers,  (`@/components/ui/button`)
- Button Group — Use when grouping related actions like toolbar buttons, split buttons, (`@/components/ui/button-group`)
**21st.dev** [INSTALL FIRST]
- Buttons — Use for any clickable action with a wide variety of visual styles
**HeroUI** [INSTALL FIRST]
- Button — Use for all interactive actions like form submissions, navigation trig (`import { Button } from '@heroui/react'`)
- Button Group — Use when grouping related actions together like view mode toggles, tex (`import { ButtonGroup } from '@heroui/react'`)
- Close Button — Use as the dismiss trigger in modals, drawers, alerts, and any closeab (`import { CloseButton } from '@heroui/react'`)
- Toggle Button — Use when a button needs to maintain a toggled state like bold/italic f (`import { ToggleButton } from '@heroui/react'`)
- Toggle Button Group — Use for segmented controls where users choose one or more options from (`import { ToggleButtonGroup } from '@heroui/react'`)
**Tremor** [INSTALL FIRST]
- Button — Use for primary actions, form submissions, or any interactive trigger  (`import { Button } from '@tremor/react'`)

## input (58)

**Radix UI** [INSTALLED via shadcn]
- One-Time Password Field — Use for OTP verification flows, PIN entry, or any multi-character code (`@radix-ui/react-one-time-password-field`)
- Password Toggle Field — Use for password fields that need show/hide toggle functionality with  (`@radix-ui/react-password-toggle-field`)
- Select — Use for building fully custom-styled select dropdowns with grouping, i (`@radix-ui/react-select`)
- Slider — Use for building custom range sliders with multiple thumbs, step snapp (`@radix-ui/react-slider`)
**shadcn/ui** [INSTALLED — PREFERRED]
- Calendar — Use as the calendar display inside date pickers, booking widgets, or s (`@/components/ui/calendar`)
- Combobox — Use for searchable dropdowns, tag inputs, autocomplete fields, or sele (`@/components/ui/combobox`)
- Command — Use for command palettes (Cmd+K), search interfaces, quick action menu (`@/components/ui/command`)
- Date Picker — Use for date input fields in forms, booking systems, date range filter (`@/components/ui/popover + @/components/ui/calendar`)
- Input — Use for any single-line text input in forms - email, password, search, (`@/components/ui/input`)
- _...+6 more_
**21st.dev** [INSTALL FIRST]
- Calendars — Use for date pickers, booking calendars, and schedule displays
- Checkboxes — Use for multi-select form inputs and agreement confirmations
- Date Pickers — Use for form date inputs with calendar dropdown selection
- File Uploads — Use for file upload forms with drag-and-drop and progress tracking
- Inputs — Use for text inputs, search fields, OTP inputs, and specialized form i
- _...+5 more_
**HeroUI** [INSTALL FIRST]
- Autocomplete — Use when users need to search and select from a large list of options  (`import { Autocomplete } from '@heroui/react'`)
- Calendar — Use when users need to pick a date from a visual calendar grid, like s (`import { Calendar } from '@heroui/react'`)
- Checkbox — Use for binary choices in forms like agreeing to terms, toggling setti (`import { Checkbox } from '@heroui/react'`)
- Checkbox Group — Use when users need to select multiple options from a group like filte (`import { CheckboxGroup } from '@heroui/react'`)
- Color Area — Use as part of a color picker when users need precise two-axis control (`import { ColorArea } from '@heroui/react'`)
- _...+21 more_
**Prompt Kit** [INSTALL FIRST]
- Prompt Input — Use as the primary input component where users type prompts for AI (`@/components/ui/prompt-input`)
**Tremor** [INSTALL FIRST]
- Date Picker — Use when users need to select dates or date ranges for filtering data, (`import { DatePicker, DateRangePicker } from '@tremor/react'`)
- Number Input — Use when capturing numeric values with optional stepper controls like  (`import { NumberInput } from '@tremor/react'`)
- Select — Use when users need to pick one or more options from a predefined list (`import { Select, SelectItem, SearchSelect, SearchSelectItem, MultiSelect, MultiSelectItem } from '@tremor/react'`)
- Switch — Use when toggling a boolean setting like enabling/disabling a feature, (`import { Switch } from '@tremor/react'`)
- Text Input — Use for capturing single-line text input in forms like search fields,  (`import { TextInput } from '@tremor/react'`)
- _...+1 more_

## form (33)

**Radix UI** [INSTALLED via shadcn]
- Checkbox — Use for custom-styled checkboxes with full accessibility and indetermi (`@radix-ui/react-checkbox`)
- Form — Use for forms with native browser validation, custom validation messag (`@radix-ui/react-form`)
- Label — Use to create accessible form labels that properly associate with inpu (`@radix-ui/react-label`)
- Radio Group — Use for building custom-styled radio button groups with roving tabinde (`@radix-ui/react-radio-group`)
- Switch — Use for building custom-styled toggle switches with proper ARIA switch (`@radix-ui/react-switch`)
- _...+1 more_
**shadcn/ui** [INSTALLED — PREFERRED]
- Checkbox — Use for boolean form fields, multi-select lists, terms acceptance, or  (`@/components/ui/checkbox`)
- Field — Use as the standard wrapper for all form inputs to provide consistent  (`@/components/ui/field`)
- Form — Complex forms with validation. Integrates Zod schemas with react-hook- (`@/components/ui/form`)
- Label — Use to label any form input for accessibility - always pair with Input (`@/components/ui/label`)
- Radio Group — Use for single-choice selections in forms - plan selection, payment me (`@/components/ui/radio-group`)
- _...+3 more_
**21st.dev** [INSTALL FIRST]
- Forms — Use for structured forms with validation and organized field layouts
- Sign Ins — Use for authentication login pages with email and social provider opti
- Sign Ups — Use for user registration pages with form validation
**HeroUI** [INSTALL FIRST]
- Description — Use below form inputs to provide helpful context, formatting hints, or (`import { Description } from '@heroui/react'`)
- Error Message — Use below form fields to display validation error messages when user i (`import { ErrorMessage } from '@heroui/react'`)
- Field Error — Use within form fields to automatically display context-aware validati (`import { FieldError } from '@heroui/react'`)
- Fieldset — Use when grouping related form fields together under a shared label li (`import { Fieldset } from '@heroui/react'`)
- Form — Use as the root container for all form fields to enable integrated val (`import { Form } from '@heroui/react'`)
- _...+1 more_
**shadcn Blocks** [INSTALL FIRST]
- Login 01 — Use for a minimal centered login page
- Login 02 — Use for login pages with a split layout showing branding imagery
- Login 03 — Use for login pages with a subtle background and prominent form card
- Login 04 — Use for login pages with imagery integrated into the form card
- Login 05 — Use for passwordless email-only login with magic link flow
- _...+5 more_

## card (22)

**shadcn/ui** [INSTALLED — PREFERRED]
- Card — Use for grouping related content like product cards, settings panels,  (`@/components/ui/card`)
**21st.dev** [INSTALL FIRST]
- Cards — Use for content containers, product cards, pricing cards, and feature 
**Aceternity UI** [INSTALL FIRST]
- 3D Card — Interactive 3D tilt card on hover. Feature cards, portfolio items.
- 3D Card Effect — Use when creating interactive product cards with depth and parallax ho
- Card Hover Effect — Use when building feature grids where hover state visually connects to
- Card Spotlight — Use when adding a subtle cursor-tracking spotlight effect to feature o
- Card Stack — Use when displaying testimonials or content in a rotating card stack f
- _...+8 more_
**HeroUI** [INSTALL FIRST]
- Card — Use as a container for related content blocks like product cards, user (`import { Card } from '@heroui/react'`)
**Magic UI** [INSTALL FIRST]
- Glare Hover — Use when adding a subtle light reflection effect to cards or interacti
- Magic Card — Use when creating interactive feature cards with premium hover lightin
- Neon Gradient Card — Use when creating premium cards with glowing neon borders for pricing 
- Tweet Card — Use when embedding real tweets as social proof or testimonials on land
**Tremor** [INSTALL FIRST]
- Card — Use as a container for KPI displays, chart wrappers, form sections, or (`import { Card } from '@tremor/react'`)
- KPI Card — Key metric display. Revenue, client count, conversion rate. (`@tremor/react`)

## table (29)

**shadcn/ui** [INSTALLED — PREFERRED]
- Data Table — Use for complex data tables requiring sorting, filtering, pagination,  (`@/components/ui/table`)
- Table — Use for simple data tables, price lists, comparison tables, or as the  (`@/components/ui/table`)
**TipTap** [INSTALLED]
- Table — Use when you need editable table structures in the editor (`@tiptap/extension-table`)
- TableCell — Use as a required companion to the Table extension (`@tiptap/extension-table-cell`)
- TableHeader — Use with Table extension when you need header rows or columns (`@tiptap/extension-table-header`)
- TableKit — Use as a convenience bundle for all table-related extensions (`@tiptap/extension-table-kit`)
- TableRow — Use as a required companion to the Table extension (`@tiptap/extension-table-row`)
**21st.dev** [INSTALL FIRST]
- Tables — Use for data tables, sortable grids, and Kanban boards
**HeroUI** [INSTALL FIRST]
- Table — Use when displaying structured data with built-in sorting, row selecti (`import { Table } from '@heroui/react'`)
**Plate.js** [INSTALL FIRST]
- Table — Use when you need editable tables with resizable columns and cell merg (`@udecode/plate-table`)
**TanStack Table** [INSTALL FIRST]
- Column Def — Define table column configuration. Each column gets its own def. (`@tanstack/react-table`)
- Column Faceting — Use when building faceted filter UIs that show available filter option (`import { getFacetedRowModel, getFacetedUniqueValues, getFacetedMinMaxValues } from '@tanstack/react-table'`)
- Column Filtering — Use when each column needs its own filter input like text search, rang (`import { getFilteredRowModel } from '@tanstack/react-table'`)
- Column Ordering — Use when users should be able to reorder columns by dragging headers o (`import { useReactTable } from '@tanstack/react-table'`)
- Column Pinning — Use when key columns like row identifiers or action buttons should sta (`import { useReactTable } from '@tanstack/react-table'`)
- _...+13 more_
**Tremor** [INSTALL FIRST]
- Table — Use when displaying structured tabular data like reports, user lists,  (`import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, TableFoot, TableFooterCell } from '@tremor/react'`)

## layout (39)

**Radix UI** [INSTALLED via shadcn]
- Accordion — Use when building custom accordion UIs from scratch with full control  (`@radix-ui/react-accordion`)
- Aspect Ratio — Use to maintain consistent aspect ratios for images, videos, or embedd (`@radix-ui/react-aspect-ratio`)
- Collapsible — Use for building custom expandable sections, disclosure widgets, or an (`@radix-ui/react-collapsible`)
- Scroll Area — Use for custom-styled scrollable areas that need consistent scrollbar  (`@radix-ui/react-scroll-area`)
- Separator — Use for accessible content dividers that properly communicate separati (`@radix-ui/react-separator`)
- _...+1 more_
**shadcn/ui** [INSTALLED — PREFERRED]
- Accordion — Use when you need expandable/collapsible FAQ sections, settings panels (`@/components/ui/accordion`)
- Aspect Ratio — Use when displaying images, videos, or maps that must maintain a speci (`@/components/ui/aspect-ratio`)
- Collapsible — Use for expandable sections, file trees, settings panels, or any conte (`@/components/ui/collapsible`)
- Resizable — Use for split-pane layouts, IDE-like interfaces, resizable sidebars, o (`@/components/ui/resizable`)
- Scroll Area — Use for custom-styled scrollable containers, dropdown lists, side pane (`@/components/ui/scroll-area`)
- _...+1 more_
**21st.dev** [INSTALL FIRST]
- Calls to Action — Use for conversion-focused CTA sections on landing pages
- Features — Use for product feature showcases and benefit sections on landing page
- Heroes — Use for landing page hero sections with headlines, images, and call-to
- Pricing Sections — Use for SaaS pricing pages with plan comparison and billing toggles
**Aceternity UI** [INSTALL FIRST]
- Bento Grid — Use when displaying product features in a visually dynamic skewed grid
- Container Cover — Use when creating reveal-on-scroll or hover container animations that 
- Layout Grid — Use when building interactive grid layouts where selected items expand
- Terminal — Use when displaying CLI commands or terminal output in a realistic con
- Timeline — Use when displaying chronological events, milestones, or process steps
**HeroUI** [INSTALL FIRST]
- Separator — Use when visually dividing content sections, menu items, or layout are (`import { Separator } from '@heroui/react'`)
- Surface — Use as a foundational container that provides consistent themed stylin (`import { Surface } from '@heroui/react'`)
- Toolbar — Use when grouping action buttons and controls in a horizontal or verti (`import { Toolbar } from '@heroui/react'`)
**Magic UI** [INSTALL FIRST]
- Android — Use when showcasing Android app screenshots in a realistic device fram
- Bento Grid — Use when displaying product features or capabilities in a visually dyn
- Code Comparison — Use when showing code improvements, migration guides, or before/after 
- File Tree — Use when displaying project structures, documentation navigation, or f
- iPhone — Use when presenting mobile app screenshots in a realistic iPhone frame
- _...+2 more_
**Motion Primitives** [INSTALL FIRST]
- Accordion — Use when building FAQ sections, settings panels, or any collapsible co
- Carousel — Use when building image or content carousels with gesture-based naviga
- Disclosure — Use when building simple show/hide toggle sections with smooth height 
**Plate.js** [INSTALL FIRST]
- Column — Use when you need side-by-side column layouts within the editor (`@udecode/plate-layout`)
**Prompt Kit** [INSTALL FIRST]
- Chat Container — Use as the outer wrapper for any AI chat interface with auto-scroll be (`@/components/ui/chat-container`)
**shadcn Blocks** [INSTALL FIRST]
- Dashboard 01 — Use as a complete dashboard starter with sidebar, charts, and data vie
**Tremor** [INSTALL FIRST]
- Accordion — Use when organizing content into collapsible sections like FAQs, setti (`import { Accordion, AccordionHeader, AccordionBody, AccordionList } from '@tremor/react'`)
- Divider — Use when visually separating distinct content sections within a card,  (`import { Divider } from '@tremor/react'`)

## navigation (54)

**Radix UI** [INSTALLED via shadcn]
- Menubar — Use for desktop-app-style persistent menubars with keyboard navigation (`@radix-ui/react-menubar`)
- Navigation Menu — Use for building custom website navigation with dropdown content areas (`@radix-ui/react-navigation-menu`)
- Tabs — Use for building custom tabbed interfaces with precise control over ac (`@radix-ui/react-tabs`)
**shadcn/ui** [INSTALLED — PREFERRED]
- Breadcrumb — Use for hierarchical navigation showing the user's current location wi (`@/components/ui/breadcrumb`)
- Menubar — Use for desktop-app-style persistent menus like File/Edit/View menus,  (`@/components/ui/menubar`)
- Navigation Menu — Use for website top navigation bars with dropdown content areas, mega  (`@/components/ui/navigation-menu`)
- Pagination — Use for paginated content lists, search results, data tables, or blog  (`@/components/ui/pagination`)
- Sidebar — Use for application-level navigation sidebars in dashboards, admin pan (`@/components/ui/sidebar`)
- _...+1 more_
**TipTap** [INSTALLED]
- Table of Contents — Use when you need auto-generated navigation from document headings (`@tiptap-pro/extension-table-of-contents`)
**21st.dev** [INSTALL FIRST]
- Docks — Use for macOS-style dock navigation bars with hover magnification
- Footers — Use for website footer sections with navigation links and branding
- Links — Use for styled hyperlinks with custom hover and animation effects
- Menus — Use for navigation menus, command menus, and action lists
- Navigation Menus — Use for website navigation bars with responsive mobile menus
- _...+3 more_
**Aceternity UI** [INSTALL FIRST]
- Floating Dock — Use when creating a floating toolbar or dock navigation with icon magn
- Floating Navbar — Use when building a navigation bar that auto-hides to maximize screen 
- Navbar Menu — Use when building navigation menus with animated dropdown content pane
- Resizable Navbar — Use when building navigation bars that shrink or transform on scroll
- Sidebar — Use when building app navigation with an animated expandable/collapsib
- _...+2 more_
**HeroUI** [INSTALL FIRST]
- Accordion — Use when organizing content into collapsible sections like FAQs, setti (`import { Accordion } from '@heroui/react'`)
- Breadcrumbs — Use when showing the user their current location in a nested page hier (`import { Breadcrumbs } from '@heroui/react'`)
- Disclosure — Use for a single collapsible section like show/hide advanced options o (`import { Disclosure } from '@heroui/react'`)
- Disclosure Group — Use when grouping multiple expandable sections with coordinated behavi (`import { DisclosureGroup } from '@heroui/react'`)
- Link — Use for inline text links, navigation links, or any clickable text tha (`import { Link } from '@heroui/react'`)
- _...+2 more_
**Magic UI** [INSTALL FIRST]
- Dock — Use when building a floating toolbar or navigation bar with interactiv
**Motion Primitives** [INSTALL FIRST]
- Dock — Use when building a macOS-style floating dock toolbar with icon magnif
- Toolbar Dynamic — Use when building toolbars that animate to fit their current content o
- Toolbar Expandable — Use when building toolbars that expand to show more options on interac
**Plate.js** [INSTALL FIRST]
- Table of Contents — Use when you need auto-generated navigation from document headings (`@udecode/plate-heading`)
**shadcn Blocks** [INSTALL FIRST]
- Sidebar 01 — Use for basic sidebar navigation with grouped links
- Sidebar 02 — Use when sidebar sections need to collapse and expand
- Sidebar 03 — Use when you need nested navigation with expandable submenus
- Sidebar 04 — Use for a floating sidebar with hover-activated submenu popouts
- Sidebar 05 — Use for sidebars with accordion-style nested navigation
- _...+11 more_
**Tremor** [INSTALL FIRST]
- Tabs — Use when organizing related content into switchable panels like dashbo (`import { TabGroup, TabList, Tab, TabPanels, TabPanel } from '@tremor/react'`)

## overlay (36)

**Radix UI** [INSTALLED via shadcn]
- Alert Dialog — Use for unstyled, accessible confirmation dialogs where you need full  (`@radix-ui/react-alert-dialog`)
- Context Menu — Use for right-click menus in canvas applications, file managers, or de (`@radix-ui/react-context-menu`)
- Dialog — Use for building custom modal dialogs with full control over overlay,  (`@radix-ui/react-dialog`)
- Dropdown Menu — Use for building custom dropdown action menus with keyboard navigation (`@radix-ui/react-dropdown-menu`)
- Hover Card — Use for link previews, user profile cards on hover, or rich content to (`@radix-ui/react-hover-card`)
- _...+2 more_
**shadcn/ui** [INSTALLED — PREFERRED]
- Alert Dialog — Use for destructive actions requiring confirmation like delete operati (`@/components/ui/alert-dialog`)
- Context Menu — Use for right-click context menus in canvas apps, file managers, edito (`@/components/ui/context-menu`)
- Dialog — Use for modal forms, detail views, confirmations, or any content requi (`@/components/ui/dialog`)
- Drawer — Use for mobile-friendly bottom sheets, side panels, responsive dialogs (`@/components/ui/drawer`)
- Dropdown Menu — Use for action menus, user profile menus, settings dropdowns, or any b (`@/components/ui/dropdown-menu`)
- _...+4 more_
**21st.dev** [INSTALL FIRST]
- Dialogs / Modals — Use for confirmation dialogs, modal forms, and overlay content
- Dropdowns — Use for action menus, context menus, and option dropdowns
- Popovers — Use for floating content panels, context info, and interactive popover
- Tooltips — Use for hover hints, keyboard shortcut labels, and contextual help
**Aceternity UI** [INSTALL FIRST]
- Animated Modal — Use when building modal dialogs with smooth spring-based open/close an
- Animated Tooltip — Use when adding animated tooltips with spring physics to interactive e
- Dither Shader — Use when adding retro dithering visual effects to images or background
- Link Preview — Use when adding Wikipedia-style link previews showing page screenshots
- Tooltip Card — Use when showing detailed information cards on hover without navigatio
**HeroUI** [INSTALL FIRST]
- Alert Dialog — Use when requiring explicit user confirmation before destructive actio (`import { AlertDialog } from '@heroui/react'`)
- Drawer — Use for navigation menus, detail panels, filters, or settings that sli (`import { Drawer } from '@heroui/react'`)
- Dropdown — Use for contextual action menus, option lists, or any trigger-activate (`import { Dropdown } from '@heroui/react'`)
- Modal — Use for focused interactions that require the user's full attention li (`import { Modal } from '@heroui/react'`)
- Popover — Use for contextual information, mini-forms, or supplementary content a (`import { Popover } from '@heroui/react'`)
- _...+2 more_
**Magic UI** [INSTALL FIRST]
- Hero Video Dialog — Use when embedding a hero video with a clickable preview image and cin
**Motion Primitives** [INSTALL FIRST]
- Dialog — Use when building modal dialogs with smooth spring-animated open/close
- Morphing Popover — Use when building popovers that smoothly morph from their trigger elem
**Tremor** [INSTALL FIRST]
- Dialog — Use when requiring user attention for confirmations, forms, detail vie (`import { Dialog, DialogPanel } from '@tremor/react'`)

## feedback (31)

**Radix UI** [INSTALLED via shadcn]
- Progress — Use for accessible progress bars showing file upload, step completion, (`@radix-ui/react-progress`)
- Toast — Use when building a custom toast system with swipe gestures, ARIA live (`@radix-ui/react-toast`)
**shadcn/ui** [INSTALLED — PREFERRED]
- Alert — Use when you need to display important messages, warnings, or status i (`@/components/ui/alert`)
- Empty — Use for zero-state screens, empty search results, 404 pages, or first- (`@/components/ui/empty`)
- Progress — Use for file uploads, step completion, loading states, skill levels, o (`@/components/ui/progress`)
- Skeleton — Use as loading placeholders for avatars, cards, text blocks, tables, o (`@/components/ui/skeleton`)
- Sonner — Use for transient notifications - success messages, error alerts, acti (`sonner (toast function) + @/components/ui/sonner (Toaster component)`)
- _...+2 more_
**21st.dev** [INSTALL FIRST]
- Alerts — Use for inline alerts, error messages, and status notifications
- Announcements — Use for site-wide announcement banners and notification bars
- Empty States — Use when a page or section has no data to display
- Notifications — Use for push notifications, in-app alerts, and notification center lis
- Spinner Loaders — Use for loading states, progress indicators, and async operation feedb
- _...+1 more_
**Aceternity UI** [INSTALL FIRST]
- Loader — Use when displaying loading states with animated spinner indicators
- Multi Step Loader — Use when showing multi-step progress for long operations like deployme
**HeroUI** [INSTALL FIRST]
- Alert — Use when showing system notifications, warnings, errors, or success me (`import { Alert } from '@heroui/react'`)
- Meter — Use when showing a measured value within a range like disk usage, batt (`import { Meter } from '@heroui/react'`)
- Progress Bar — Use when showing progress of an operation like file uploads, installat (`import { ProgressBar } from '@heroui/react'`)
- Progress Circle — Use when showing progress in a compact circular format like loading in (`import { ProgressCircle } from '@heroui/react'`)
- Skeleton — Use as loading placeholders that match the shape of upcoming content t (`import { Skeleton } from '@heroui/react'`)
- _...+1 more_
**Magic UI** [INSTALL FIRST]
- Animated Circular Progress Bar — Use when displaying completion percentages, skill levels, or loading s
- Avatar Circles — Use when displaying team members, active users, or social proof with u
- Confetti — Use when celebrating user achievements, form submissions, or successfu
- Cool Mode — Use when adding playful click-to-burst particle effects to buttons or 
- Scroll Progress — Use when showing reading progress on long-form content or documentatio
**Motion Primitives** [INSTALL FIRST]
- Scroll Progress — Use when showing reading or scroll progress as a visual indicator
**Prompt Kit** [INSTALL FIRST]
- Loading Dots — AI thinking indicator. Three animated dots while waiting for response.
**Tremor** [INSTALL FIRST]
- Callout — Use when drawing attention to important information like warnings, tip (`import { Callout } from '@tremor/react'`)

## data-display (38)

**Radix UI** [INSTALLED via shadcn]
- Avatar — Use when building custom avatar components with image loading states a (`@radix-ui/react-avatar`)
**shadcn/ui** [INSTALLED — PREFERRED]
- Avatar — Use for user profile pictures, team member lists, comment threads, or  (`@/components/ui/avatar`)
- Badge — Use for status indicators, tags, labels, counts, or categorization mar (`@/components/ui/badge`)
- Carousel — Use for image galleries, testimonial sliders, product showcases, or an (`@/components/ui/carousel`)
- Item — Use for list items, notification entries, user cards, or any structure (`@/components/ui/item`)
- Kbd — Use for displaying keyboard shortcuts in tooltips, menus, documentatio (`@/components/ui/kbd`)
**21st.dev** [INSTALL FIRST]
- Accordions — Use for FAQ sections, expandable content panels, and collapsible lists
- Avatars — Use for user profile images, avatar groups, and user presence indicato
- Badges — Use for status indicators, labels, tags, and notification counts
- Carousels — Use for image galleries, content sliders, and story carousels
- Clients / Logo Clouds — Use to showcase client logos, partner brands, or technology integratio
- _...+9 more_
**HeroUI** [INSTALL FIRST]
- Avatar — Use when displaying user profile pictures in headers, comments, user l (`import { Avatar } from '@heroui/react'`)
- Badge — Use when showing notification counts, online status, or small status i (`import { Badge } from '@heroui/react'`)
- Chip — Use for displaying tags, filters, selections, or compact status indica (`import { Chip } from '@heroui/react'`)
- Color Swatch — Use when displaying a color sample in palettes, theme previews, or alo (`import { ColorSwatch } from '@heroui/react'`)
- Kbd — Use when displaying keyboard shortcuts, hotkeys, or key combinations i (`import { Kbd } from '@heroui/react'`)
- _...+2 more_
**Prompt Kit** [INSTALL FIRST]
- Markdown Renderer — Render markdown from AI responses. Code blocks, lists, headings.
- Message — Use as the primary message component in AI chat interfaces (`@/components/ui/message`)
**Tremor** [INSTALL FIRST]
- Badge — Use when labeling items with status indicators, counts, or categories  (`import { Badge } from '@tremor/react'`)
- Category Bar — Use when showing how a value falls within defined ranges like performa (`import { CategoryBar } from '@tremor/react'`)
- Delta Bar — Use when showing deviation from a baseline like performance change, pr (`import { DeltaBar } from '@tremor/react'`)
- Legend — Use alongside charts or data bars to provide a clickable, color-coded  (`import { Legend } from '@tremor/react'`)
- List — Use when displaying vertical rankings, key-value pairs, or simple data (`import { List, ListItem } from '@tremor/react'`)
- _...+4 more_

## chart (12)

**shadcn/ui** [INSTALLED — PREFERRED]
- Chart — Use for dashboards, analytics pages, or any data visualization needs - (`@/components/ui/chart`)
**Tremor** [INSTALL FIRST]
- Area Chart — Use when visualizing time-series data where the filled area emphasizes (`import { AreaChart } from '@tremor/react'`)
- Bar Chart — Use when comparing values across discrete categories like monthly reve (`import { BarChart } from '@tremor/react'`)
- Bar List — Use when ranking items like top pages, top referrers, or leaderboard e (`import { BarList } from '@tremor/react'`)
- Donut Chart — Use when showing part-to-whole relationships like market share, budget (`import { DonutChart } from '@tremor/react'`)
- Funnel Chart — Use when visualizing drop-off rates through sequential stages like lea (`import { FunnelChart } from '@tremor/react'`)
- _...+6 more_

## animation (62)

**21st.dev** [INSTALL FIRST]
- Borders — Use for eye-catching animated border effects on cards and containers
- Scroll Areas — Use for scroll-triggered animations, sticky scroll reveals, and parall
**Aceternity UI** [INSTALL FIRST]
- 3D Globe — Use when building an interactive 3D globe visualization with data conn
- 3D Marquee — Use when creating dramatic 3D perspective scrolling image showcases
- 3D Pin — Use when creating 3D pin markers for maps, locations, or featured prod
- Animated Testimonials — Use when displaying customer testimonials with animated transitions an
- Apple Cards Carousel — Use when building Apple-inspired card carousels that expand into full 
- _...+23 more_
**Magic UI** [INSTALL FIRST]
- Animated Beam — Use when visualizing data flow, connections between nodes, or integrat
- Animated List — Use when showing notification feeds, activity logs, or step-by-step li
- Backlight — Use when adding a dramatic backlit glow effect behind cards or feature
- Blur Fade — Use when staggering entrance animations on page sections or card grids
- Border Beam — Use when highlighting cards, CTAs, or featured sections with an animat
- _...+15 more_
**Motion Primitives** [INSTALL FIRST]
- Animated Group — Use when animating groups of elements with staggered entrance effects 
- Animated Number — Use when displaying metrics, statistics, or counters that animate to n
- Border Trail — Use when adding an animated traveling highlight along element borders 
- Cursor Follow — Element that follows cursor. Interactive hover effects, custom cursors
- Glow Effect — Use when adding a colorful glow halo effect around cards, buttons, or 
- _...+7 more_

## text-effect (42)

**shadcn/ui** [INSTALLED — PREFERRED]
- Typography — Use as reference for consistent text styling across your app - heading (`n/a (use Tailwind utility classes directly)`)
**21st.dev** [INSTALL FIRST]
- Texts — Use for animated text reveals, typewriter effects, and decorative text
**Aceternity UI** [INSTALL FIRST]
- Canvas Text — Use when creating artistic text effects rendered with canvas-based par
- Colourful Text — Use when making text pop with animated multi-color gradient effects
- Container Text Flip — Use when creating dynamic text cycling inside contained elements
- Encrypted Text — Use when creating cyberpunk or security-themed text animations
- Flip Words — Use when cycling through different words in a headline with flip anima
- _...+8 more_
**Magic UI** [INSTALL FIRST]
- Animated Gradient Text — Use when highlighting CTAs, badges, or featured text with moving gradi
- Animated Shiny Text — Use when drawing attention to badges, labels, or announcement text wit
- Aurora Text — Use when creating eye-catching hero text with flowing gradient color e
- Comic Text — Use when adding playful comic-style text effects to headings or callou
- Hyper Text — Use when creating a hacker-style text decryption effect on headings or
- _...+12 more_
**Motion Primitives** [INSTALL FIRST]
- Sliding Number — Use when animating number changes with a slot-machine sliding digit ef
- Spinning Text — Use when creating decorative circular rotating text badges or labels
- Text Effect — Use when animating headings or text with character-level or word-level
- Text Loop — Use when rotating through taglines, descriptions, or value proposition
- Text Morph — Use when transitioning between text values with smooth per-character m
- _...+4 more_
**Prompt Kit** [INSTALL FIRST]
- Streaming Text — Typewriter effect for AI streaming responses. Character-by-character r

## background (38)

**21st.dev** [INSTALL FIRST]
- Backgrounds — Use for decorative animated backgrounds, hero sections, and landing pa
- Shaders — Use for GPU-accelerated visual effects, gradient backgrounds, and WebG
**Aceternity UI** [INSTALL FIRST]
- Aurora Background — Use when creating ethereal aurora borealis backgrounds for premium her
- Background Beams — Use when adding animated light beam paths to hero section backgrounds
- Background Beams With Collision — Use when adding dynamic colliding beam animations to backgrounds for e
- Background Boxes — Use when creating interactive grid backgrounds where cells illuminate 
- Background Gradient — Use when wrapping content with a smoothly animating gradient backgroun
- _...+17 more_
**Magic UI** [INSTALL FIRST]
- Animated Grid Pattern — Use when adding a living grid background that pulses with appearing an
- Dot Pattern — Use when adding a subtle dotted texture background to sections or card
- Flickering Grid — Use when creating a subtle animated background that suggests digital a
- Globe — Use when visualizing worldwide data points, office locations, or globa
- Grid Pattern — Use when adding a clean grid background with selectively highlighted c
- _...+8 more_
**Motion Primitives** [INSTALL FIRST]
- Animated Background — Use when building tabs, menus, or lists where a background slides to t

## editor (100)

**TipTap** [INSTALLED]
- Audio — Use when you need to embed audio players in editor content (`@tiptap/extension-audio`)
- Background Color — Use when you need text background highlighting with custom colors (`@tiptap/extension-color`)
- Blockquote — Use when you need quoted text blocks in the editor (`@tiptap/extension-blockquote`)
- Bold — Use when you need bold text formatting (Ctrl+B) (`@tiptap/extension-bold`)
- BubbleMenu — Use when you want a Medium-style floating toolbar on text selection (`@tiptap/extension-bubble-menu`)
- _...+52 more_
**Plate.js** [INSTALL FIRST]
- Basic Blocks — Use as the foundation for any Plate editor with standard block element (`@udecode/plate-basic-elements`)
- Block Menu — Use when you need a right-click or hover menu for block-level actions (`@udecode/plate-selection`)
- Block Placeholder — Use when you want to display hint text in empty blocks like 'Type some (`@udecode/plate-placeholder`)
- Block Selection — Use when you need to select multiple blocks at once for copying, delet (`@udecode/plate-selection`)
- Blockquote — Use when you need quoted text blocks for citations or callouts (`@udecode/plate-block-quote`)
- _...+38 more_

## ai (25)

**TipTap** [INSTALLED]
- AI Generation — Use when you need AI-powered text generation, rewriting, or autocomple (`@tiptap-pro/extension-ai`)
- AI Toolkit — Use when building AI agent workflows that need to programmatically man (`@tiptap-pro/extension-ai-toolkit`)
- Server AI Toolkit — Use when building backend AI pipelines that need to modify Tiptap docu (`@tiptap-pro/extension-server-ai-toolkit`)
**21st.dev** [INSTALL FIRST]
- AI Chats — Use for building AI chatbot interfaces with message display and input
**Plate.js** [INSTALL FIRST]
- AI / Stream — Use when you need AI-assisted text generation, autocomplete, or inline (`@udecode/plate-ai`)
- AI Plugin — AI-powered writing assistance inside the editor. Auto-complete, rewrit (`@udecode/plate-ai`)
- Copilot — Use when you want GitHub Copilot-style inline AI suggestions while typ (`@udecode/plate-ai`)
**Prompt Kit** [INSTALL FIRST]
- Blocks — Use when you need pre-assembled chat UI layouts combining multiple com (`@/components/ui/blocks`)
- Chain of Thought — Use when you want to show the AI's chain-of-thought reasoning process  (`@/components/ui/chain-of-thought`)
- Code Block — Use when rendering code snippets in AI chat responses (`@/components/ui/code-block`)
- Feedback Bar — Use when you need user feedback on AI-generated responses (like/dislik (`@/components/ui/feedback-bar`)
- File Upload — Use when users need to attach files to AI prompts (`@/components/ui/file-upload`)
- _...+13 more_

## utility (46)

**shadcn/ui** [INSTALLED — PREFERRED]
- Direction — Use when building internationalized apps that need to support RTL lang (`@/components/ui/direction`)
**TipTap** [INSTALLED]
- CharacterCount — Use when you need to display character/word counts or enforce characte (`@tiptap/extension-character-count`)
- Export — Use when you need to export editor content to Word, ODT, or Markdown f (`@tiptap-pro/extension-export`)
- Focus — Use when you need to highlight or style the currently focused block (`@tiptap/extension-focus`)
- Gapcursor — Use to ensure the cursor can navigate around tables, images, and other (`@tiptap/extension-gapcursor`)
- Import — Use when you need to import Word, ODT, or Markdown files into the edit (`@tiptap-pro/extension-import`)
- _...+8 more_
**21st.dev** [INSTALL FIRST]
- Hooks — Use when you need reusable hooks for scroll, animation, intersection, 
**Aceternity UI** [INSTALL FIRST]
- Codeblock — Use when displaying formatted code snippets with syntax highlighting a
- Compare — Use when comparing before/after images with an interactive sliding div
- File Upload — Use when building file upload interfaces with visual drag-and-drop fee
- Following Pointer — Use when adding a custom animated cursor follower with content labels 
- Gooey Input — Use when adding playful gooey blob animations to form inputs
- _...+6 more_
**HeroUI** [INSTALL FIRST]
- Scroll Shadow — Use around scrollable containers to visually indicate there is more co (`import { ScrollShadow } from '@heroui/react'`)
**Magic UI** [INSTALL FIRST]
- Animated Theme Toggler — Use when implementing a polished dark/light mode switch with visual tr
- Lens — Use when providing detail inspection on images, maps, or product photo
- Pointer — Use when adding collaborative cursor effects or visual hover indicator
- Progressive Blur — Use when fading out scroll content edges to indicate more content is a
- Smooth Cursor — Use when replacing the default cursor with a branded, physics-based an
**Motion Primitives** [INSTALL FIRST]
- Cursor — Use when replacing the default cursor with a branded or interactive cu
- Image Comparison — Use when comparing two images side by side with an interactive sliding
- Progressive Blur — Use when fading out content edges with progressive blur to indicate sc
**Plate.js** [INSTALL FIRST]
- Autoformat — Use when you want Markdown-style shortcuts to auto-apply formatting (`@udecode/plate-autoformat`)
- CSV Serialization — Use when you need to paste CSV data as formatted tables in the editor (`@udecode/plate-csv`)
- DOCX Serialization — Use when you need to import from or export to Microsoft Word documents (`@udecode/plate-docx`)
- Exit Break — Use when you need keyboard shortcuts to exit nested blocks like code b (`@udecode/plate-break`)
- HTML Serialization — Use when you need to convert between HTML and the editor's internal fo (`@udecode/plate`)
- _...+4 more_
**Tremor** [INSTALL FIRST]
- Color Palette — Use when customizing the color theme of Tremor components or applying  (`import { Color } from '@tremor/react'`)
- Icons — Use when rendering icons with consistent sizing, coloring, and tooltip (`import { Icon } from '@tremor/react'`)

