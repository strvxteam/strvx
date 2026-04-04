# USA Landing Page (Main)

## Route
`/` (root — current production page)

## Status
Live. Needs region selector integration and hero image update.

## Hero Direction
- **Style**: Full-viewport cinematic photo, SpaceX Starshield layout
- **Image direction**: LOCKED — Team huddle / laptops (v5 #6)
  - Source: Unsplash `photo-1522071820081-009f0129c71c`
  - Small team collaborating, startup energy, approachable
  - Dark overlay (~65%) + vignette for text readability
- **Headline**: "We build internal AI tools that work."
- **Subtitle**: "AI Consulting, San Diego"
- **CTA**: "Book a free call" -> /book
- **Background**: Currently CSS grid + gradient. Switching to full-bleed photo with dark overlay.

## Nav
- Region selector bar at top (USA | Government | Southeast Asia)
- Existing nav below: STRVX + Services + Process + Book a call

## Sections (existing)
1. Hero
2. What We Do (services grid)
3. Interactive AI mockup demo
4. Stats (animated counters)
5. Process overview
6. CTA / Book a call
7. Footer

## TODO
- [ ] Select hero background image (run comparison board like gov page)
- [ ] Replace CSS grid background with full-bleed photo + overlay
- [ ] Verify region selector doesn't break existing layout/animations
- [ ] Update page metadata/OG image if hero changes significantly
- [ ] Test mobile responsiveness with new hero image
