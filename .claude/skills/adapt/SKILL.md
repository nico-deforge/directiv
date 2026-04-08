---
name: adapt
description: "Adapt UI designs to work across different screen sizes, devices, or platforms. Use when porting a desktop layout to mobile, adding tablet support, creating print stylesheets, or making email-compatible versions of web components."
user-invokable: true
args:
  - name: target
    description: The feature or component to adapt (optional)
    required: false
  - name: context
    description: What to adapt for (mobile, tablet, desktop, print, email, etc.)
    required: false
---

Adapt existing designs to work effectively across different contexts. Adaptation is not scaling — it's rethinking the experience for the new context.

## Phase 1: Assess

1. **Source context**: What was it designed for? What assumptions (screen size, input method, connection speed)?
2. **Target context**: Device, input method, screen constraints, connection, usage context (on-the-go vs focused)
3. **Challenges**: What won't fit, won't work (hover on touch), or feels inappropriate?

## Phase 2: Strategy by Target

### Mobile (Desktop → Mobile)

| Dimension | Strategy |
|-----------|----------|
| Layout | Single column, vertical stacking, full-width, bottom navigation |
| Interaction | 44x44px touch targets, swipe gestures, bottom sheets, thumbs-first |
| Content | Progressive disclosure, 16px minimum text, concise copy |
| Navigation | Hamburger/bottom nav, sticky headers, back button flows |

### Tablet (Hybrid)
- Two-column or master-detail layouts, adaptive to orientation
- Support both touch and pointer, side navigation drawers

### Desktop (Mobile → Desktop)
- Multi-column layouts with max-width constraints
- Hover states, keyboard shortcuts, right-click menus, drag-and-drop
- Show more information upfront, richer data tables and visualizations

### Print (Screen → Print)
- Page breaks at logical points, remove interactive elements
- Expand hidden content, add page numbers/metadata, print-friendly colors

### Email (Web → Email)
- 600px max width, single column, inline CSS, table-based layouts
- Large obvious CTAs (no hover states), deep links for complex interactions

## Phase 3: Implement

### CSS Techniques

```css
/* Fluid sizing with clamp() */
.heading { font-size: clamp(1.5rem, 4vw, 3rem); }

/* Container queries for component-level adaptation */
@container (min-width: 600px) {
  .card { grid-template-columns: 1fr 1fr; }
}
```

- **CSS Grid/Flexbox** for automatic reflow
- **Container Queries** to adapt based on container, not viewport
- **Media queries** for context-specific overrides
- Content-driven breakpoints (where design breaks) over generic ones (320/768/1024)

### Touch Adaptation
- 44x44px minimum targets with spacing between interactive elements
- Remove hover-dependent interactions, add touch feedback (ripples)
- Consider thumb zones (bottom of screen is easier to reach)

### Content Adaptation
- Progressive enhancement: core content first, enhancements on larger screens
- Responsive images (`srcset`, `<picture>`)
- Lazy loading for off-screen content
- Use `display: none` sparingly (hidden elements still download)

## Phase 4: Verify

Test on real devices (not just DevTools emulation):
- Multiple screen sizes including 320px and 4K extremes
- Portrait and landscape orientations
- Touch, mouse, and keyboard input
- Throttled network connections
- Safari, Chrome, Firefox, Edge across iOS, Android, macOS, Windows

**NEVER**: hide core functionality on mobile, use different information architecture across contexts, break platform expectations, forget landscape orientation, or ignore touch on desktop devices.