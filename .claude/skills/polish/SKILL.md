---
name: polish
description: "Perform a final quality pass on a feature before shipping. Use when a component is functionally complete but needs alignment fixes, missing interaction states, spacing inconsistencies, copy cleanup, or transition smoothing to reach production quality."
user-invokable: true
args:
  - name: target
    description: The feature or area to polish (optional)
    required: false
---

Meticulous final pass to catch details that separate good work from great. Polish is the last step — do not polish work that isn't functionally complete.

**First**: Review the `frontend-design` skill for design principles and anti-patterns.

## Phase 1: Assess

1. Confirm the feature is functionally complete
2. Identify polish areas: visual inconsistencies, spacing issues, missing interaction states, copy problems, edge cases, transition smoothness

## Phase 2: Polish Systematically

### Visual Alignment & Spacing
- All elements snap to grid — no arbitrary gaps (e.g. random 13px)
- Optical alignment for icons (may need offset for visual centering)
- Consistent spacing at all breakpoints

### Typography
- Same elements use same sizes/weights throughout
- Body text: 45-75 character line length
- No FOUT/FOIT font loading flashes

### Color & Contrast
- All text meets WCAG AA contrast ratios
- No hard-coded colors — all use design tokens
- Tinted neutrals (no pure gray/black — add 0.01 chroma)
- Never gray text on colored backgrounds — use a shade of that color

### Interaction States

Every interactive element needs all of: default, hover, focus, active, disabled, loading, error, success. Missing states create broken experiences.

- Transitions: 150-300ms, ease-out-quart/quint/expo (never bounce/elastic)
- Only animate `transform` and `opacity` for 60fps
- Respect `prefers-reduced-motion`

### Content & Copy
- Consistent terminology and capitalization throughout
- No typos, appropriate length, consistent punctuation

### Icons, Images & Forms
- All icons from same family, optically aligned with adjacent text
- All images have alt text, no layout shift on load
- All inputs labeled, logical tab order, consistent validation timing

### Edge Cases
- Loading, empty, error, and success states all handled
- Long content and missing data handled gracefully
- Touch targets 44x44px minimum, no text < 14px on mobile

### Code Quality
- Remove console.logs, commented code, unused imports
- No TypeScript `any`, proper ARIA labels and semantic HTML

## Phase 3: Verify

Run through this checklist:

- [ ] Alignment perfect at all breakpoints
- [ ] Spacing uses design tokens consistently
- [ ] All interaction states implemented
- [ ] All transitions smooth (60fps)
- [ ] Contrast meets WCAG AA
- [ ] Keyboard navigation and focus indicators work
- [ ] No layout shift on load
- [ ] Respects reduced motion preference
- [ ] Code is clean

Test by actually using the feature, on real devices, across supported browsers. Check all states — not just the happy path.

**NEVER**: polish before functionally complete, introduce bugs while polishing, ignore systematic issues (fix the system, not individual symptoms), or perfect one area while leaving others rough.