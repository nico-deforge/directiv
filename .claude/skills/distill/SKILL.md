---
name: distill
description: "Strip UI designs to their essence by removing unnecessary complexity. Use when a page or component feels cluttered, has competing actions, excessive visual variation, or information overload — to reveal the core user goal with clarity."
user-invokable: true
args:
  - name: target
    description: The feature or component to distill (optional)
    required: false
---

Remove unnecessary complexity from designs, revealing the essential elements and creating clarity through ruthless simplification. Simplicity is not removing features — it's removing obstacles between users and their goals.

## Phase 1: Gather Context

1. **Identify the primary user goal** — there should be ONE per view
2. **Determine what's essential vs nice-to-have** from codebase, design system, or user input
3. **Review the `frontend-design` skill** for design principles and anti-patterns

If the primary goal or audience is unclear, use AskUserQuestionTool. Simplifying the wrong things destroys usability.

## Phase 2: Audit Complexity

Scan the target for complexity sources:

| Source | Signs |
|--------|-------|
| Too many elements | Competing buttons, redundant info, visual clutter |
| Excessive variation | 5+ colors, multiple font families, inconsistent sizing |
| Information overload | Everything visible at once, no progressive disclosure |
| Visual noise | Unnecessary borders, shadows, decorations |
| Confusing hierarchy | Unclear what matters most |
| Feature creep | Too many options, actions, or paths forward |

Ask: What's the 20% that delivers 80% of value? What can be removed, hidden, or combined?

## Phase 3: Simplify

Apply systematically across these dimensions:

### Information Architecture
- ONE primary action, few secondary, everything else tertiary or hidden
- Progressive disclosure: hide complexity behind accordions, modals, step-through flows
- Merge similar buttons, consolidate forms, group related content
- If it's said elsewhere, don't repeat it

### Visual
- 1-2 colors plus neutrals (not 5-7), one font family, 3-4 sizes max
- Eliminate borders, shadows, backgrounds that don't serve hierarchy
- Flatten nesting — never nest cards inside cards; use spacing instead
- One spacing scale, generous whitespace

### Layout
- Prefer simple vertical flow over complex grids
- Move secondary content inline or behind progressive disclosure
- Consistent alignment (pick left or center, stick with it)

### Interaction
- Fewer choices, clearer path forward (paradox of choice)
- Smart defaults — only ask when necessary
- Inline editing over modal flows where possible

### Content & Code
- Cut copy in half, use active voice, remove jargon
- Remove dead CSS, unused components, orphaned files
- Flatten component trees, consolidate styles, reduce unnecessary variants

## Phase 4: Verify

- **Faster task completion** — users accomplish goals more quickly
- **Reduced cognitive load** — obvious what to do next
- **Still complete** — all necessary features remain accessible
- **Clearer hierarchy** — primary action stands out immediately

If features were removed, document why and whether they need alternative access.

**NEVER**: remove necessary functionality, sacrifice accessibility for simplicity, make things so minimal they're unclear, remove information users need for decisions, or oversimplify complex domains.