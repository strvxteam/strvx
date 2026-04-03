# strvx Design System

## Colors

```css
--color-bg: #f8f8f8;
--color-surface: #ffffff;
--color-border: #e0e0e0;
--color-border-light: #f0f0f0;
--color-text: #222222;
--color-text-secondary: #888888;
--color-text-muted: #aaaaaa;

--color-danger: #e74c3c;
--color-danger-bg: #fde8e8;
--color-warning: #f39c12;
--color-warning-bg: #fef3e2;
--color-success: #27ae60;
--color-success-bg: #e8f5e9;
--color-info: #1a73e8;
--color-info-bg: #e8f0fe;
```

## Typography

- Font: Inter (system-ui fallback)
- Scale: 11px (caption), 12px (label), 13px (body), 14px (input), 16px (heading-sm), 20px (heading-lg), 28px (display)
- Weight: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)
- Line height: 1.4 (body), 1.2 (headings)

## Spacing

- Base unit: 4px
- Scale: 4, 6, 8, 10, 12, 16, 20, 24, 28, 32, 48px
- Component padding: 12-16px
- Section gaps: 20-28px
- Page padding: 24-32px

## Border Radius

- Small (badges, tags): 4px
- Medium (cards, inputs): 6px
- Large (modals, popovers): 8px
- None: 0px (tables, dividers)

## Shadows

- None. Use borders only.
- Exception: quick-add bar uses `0 2px 8px rgba(0,0,0,0.06)` for floating effect.

## Icons

- Library: Lucide React
- Stroke width: 1.5
- Default size: 16px (inline), 20px (standalone)
- Color: inherit from text color

## Component Defaults

- Buttons: ghost style (no fill, border on hover). Primary actions get info-bg fill.
- Badges: outline style with colored text + light background (e.g. danger-bg + danger text).
- Cards: white surface, 1px border, 6px radius, 16px padding.
- Tables: no zebra striping. 1px border-bottom per row. Header is uppercase 11px label.
- Inputs: 1px border, 6px radius, 14px font, 10px 12px padding.

## Interaction States

- Hover: background lighten to #f5f5f5 on interactive elements
- Focus: 2px outline with info color, 2px offset
- Active: no transform, slight background darken
- Disabled: 50% opacity, no pointer events

## Responsive Breakpoints

- Desktop: >= 1024px (full layout with sidebar)
- Tablet: 768-1023px (collapsed sidebar, 2-column client detail)
- Mobile: < 768px (single column, no kanban drag-drop, list view for pipeline)

## Accessibility

- All interactive elements: minimum 44x44px touch target
- Color contrast: WCAG AA (4.5:1 for text, 3:1 for large text)
- Keyboard navigation: all screens fully operable via keyboard
- Focus indicators: visible on all focusable elements
- Screen reader: ARIA labels on icon-only buttons, live regions for realtime updates
