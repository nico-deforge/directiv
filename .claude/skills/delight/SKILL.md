---
name: delight
description: "Add micro-interactions, personality, and polished touches to UI components. Use when enhancing success states, empty states, loading indicators, hover effects, or transitions to make functional interfaces feel memorable and joyful."
user-invokable: true
args:
  - name: target
    description: The feature or area to add delight to (optional)
    required: false
---

Add moments of joy, personality, and unexpected polish that transform functional interfaces into delightful experiences — without compromising usability.

## Phase 1: Gather Context

Before adding delight, establish the constraints:

1. **Determine brand personality** from codebase, design system, or user input: playful, professional, quirky, elegant, etc.
2. **Identify target audience**: tech-savvy, creative, corporate, consumer
3. **Review the `frontend-design` skill** for design principles and anti-patterns — do not proceed without it

If any of these are unclear, use AskUserQuestionTool to clarify. Delight that's wrong for the context is worse than no delight.

## Phase 2: Identify Delight Opportunities

Scan the target for natural enhancement moments:

- **Success states** — completed actions (save, send, publish): checkmark animations, confetti for milestones, gentle scale + fade
- **Empty states** — first-time experiences: personality-driven copy ("Your canvas awaits"), custom illustrations
- **Loading states** — waiting periods: rotating messages, skeleton screens with subtle animation, progress with encouragement
- **Interactions** — hover, click, drag: lift/press effects, icon animations, ripples
- **Errors** — frustrating moments to soften: empathetic copy ("The internet took a coffee break"), friendly illustrations

**Rule**: Delight enhances usability, never obscures it. Keep moments < 1 second, skippable, and respect `prefers-reduced-motion`.

## Phase 3: Apply Delight Techniques

### Micro-interactions

```css
/* Satisfying button press + hover lift */
.button {
  transition: transform 0.1s, box-shadow 0.1s;
}
.button:hover {
  transform: translateY(-2px);
  transition: transform 0.2s cubic-bezier(0.25, 1, 0.5, 1);
}
.button:active {
  transform: translateY(2px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
```

- Toggle switches with smooth spring physics and color transitions
- Drag-and-drop with lift shadow, snap animation, and undo toast
- Form inputs that animate on focus, checkboxes that bounce on check

### Personality in Copy

Match tone to brand — banks can be warm, consumer apps can be whimsical:

```
Error 404 → "This page is playing hide and seek. (And winning.)"
No projects → "Your canvas awaits. Create something amazing."
Inbox zero → "You're crushing it today."
```

### Sound & Visual Polish

- Subtle audio cues (success ding, empathetic error) with mute option — respect system sound settings
- Custom empty/error/loading illustrations over stock icons
- Seasonal or time-of-day variations for repeated delight
- Easter eggs: Konami code themes, console messages for devs, alt-text humor

### Recommended Libraries

| Category | Options |
|----------|---------|
| Animation | Framer Motion, GSAP, Lottie |
| Sound | Howler.js, use-sound (React) |
| Effects | canvas-confetti, React Spring |

## Phase 4: Verify

- **Not annoying**: still pleasant after 100th use, varies responses
- **Not blocking**: core functionality never delayed, all delight skippable
- **Performant**: 60fps, lazy-loaded delight features, compressed assets
- **Accessible**: works with reduced motion and screen readers
- **Appropriate**: matches brand personality and emotional context

**NEVER**: delay core functionality for delight, force users through delight moments, sacrifice performance, ignore accessibility, or make every interaction delightful (special moments should stay special).