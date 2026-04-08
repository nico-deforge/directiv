---
name: normalize
description: "Align a page or component with the project's design system by replacing hard-coded values with tokens, swapping one-off components for system equivalents, and fixing visual inconsistencies. Use when a feature deviates from established typography, color, spacing, or interaction patterns."
user-invokable: true
args:
  - name: feature
    description: The page, route, or feature to normalize (optional)
    required: false
---

Analyze and realign a feature to match the project's design system standards, aesthetics, and established patterns.

## Phase 1: Discover the Design System

Search the codebase for design system documentation, UI guidelines, or style guides (`grep -r "design system" "style guide" "ui guide"`). Study until you understand:

- Design tokens: colors, typography scale, spacing scale
- Component library: available components and their variants
- Interaction patterns: animation timing, easing, hover/focus conventions
- Responsive breakpoints and layout patterns

**CRITICAL**: If design system principles are unclear, use AskUserQuestionTool. Do not guess.

## Phase 2: Audit Deviations

Analyze the target feature against the design system:

| Dimension | What to check |
|-----------|---------------|
| Typography | Hard-coded font sizes/weights → should use typographic tokens |
| Color | One-off hex values → should use color tokens |
| Spacing | Arbitrary px values → should use spacing scale |
| Components | Custom implementations → design system equivalents exist? |
| Motion | Inconsistent timing/easing → match system conventions |
| Responsive | Custom breakpoints → align with system breakpoints |
| Accessibility | Missing contrast, focus states, ARIA → match system requirements |

Classify each deviation: cosmetic vs functional, and root cause (missing tokens, one-off implementation, or conceptual misalignment).

## Phase 3: Normalize

Systematically replace deviations:

1. **Swap components** — replace custom implementations with design system equivalents, matching props and variants
2. **Replace hard-coded values** — fonts, colors, spacing, breakpoints → design tokens
3. **Align interaction patterns** — animation timing, easing, hover/focus/active states
4. **Fix progressive disclosure** — match information hierarchy to patterns used elsewhere in the app

Prioritize UX consistency and usability over visual polish alone.

## Phase 4: Clean Up and Verify

- Move newly created reusable components to the shared UI path
- Delete unused implementations, styles, and files made obsolete
- Lint, type-check, and test per repository guidelines
- Consolidate any duplication introduced during refactoring

**NEVER**: create one-off components when system equivalents exist, hard-code values that should use tokens, introduce divergent patterns, or compromise accessibility for visual consistency.