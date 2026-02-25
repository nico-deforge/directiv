---
name: linear-plan
description: "Produce a technical plan (implementation plan) for a Linear task. Use this skill when the user asks to plan, design, or write a plan for a Linear ticket before implementation. Triggers: 'technical plan', 'plan the implementation', 'draft the plan for [ticket]', or any request to fill the plan section of a Linear issue. Also use when creating a new Linear task that needs a plan from scratch."
disable-model-invocation: true
---

# Linear Plan

Produce a precise, actionable technical plan for a Linear task. The plan serves as a strategic map for a developer agent — it tells them WHAT to change and WHERE, not HOW.

## Workflow

### 1. Gather ticket context

**If the ticket exists:**
- Fetch the Linear issue (title, description, all comments, attachments, labels, priority).
- Fetch the parent ticket if any — read its description and comments for broader scope.
- Check sub-issues for related context.

**If the ticket does not exist:**
- Ask the user for: title, project id, milestone id, and context (Sentry, project context).
- Proceed to step 4 after gathering context.

### 2. Gather external context

- **Sentry**: If a Sentry issue is mentioned, fetch bug details (stacktrace, tags, frequency).
- If none of these apply, proceed with text-based requirements only.

### 3. Analyze the codebase

Explore the relevant parts of the codebase based on identified requirements:
- Find existing patterns, models, services, and components that relate to the task.
- Identify files that will need modification or creation.
- Note conventions from `.ai-assistants/rules/` if present.

### 4. Write the plan

Write a synthetic, structured plan in **French** using the template in [references/ticket-template.md](references/ticket-template.md).

**Writing rules:**
- Focus on the WHAT and WHERE, never the HOW. No code, no pseudo-code, no type signatures.
- **Stratégie** is the most important part: it's the mental model. What pattern to follow, what data flow, what architecture. 2-4 sentences, no file paths.
- Each **entrypoint** = 1 touchpoint. Format: `**[Verb]** — \`path\` → what`. Max 15 words after the path.
- Imperative French verbs: "Créer...", "Modifier...", "Ajouter..."
- Reference actual file paths and existing patterns from the codebase.
- Flag gaps or ambiguities instead of assuming requirements.
- Prefer existing patterns over introducing new ones.

**Anti-patterns (never do this):**
- No code or pseudo-code in the plan
- No SQL types, column definitions, or Pydantic field signatures
- No sub-bullets under entrypoints — each bullet is self-contained on one line
- No validation rules or edge case details in entrypoints (put those in Validation section)
- Max ~15 entrypoints. If you need more, your scope is too big — split the ticket.

### 5. Update Linear

**If ticket exists:** Update the issue description. If a plan already exists, add the new one in a clearly separated section.

**If ticket does not exist:** Create the issue with the filled template.

### 6. Handle questions

- **Technical questions** blocking the plan: add a Linear comment with the question.
- **Product or design questions**: add a Linear comment with the question.
- Be explicit about what is blocking and what assumptions are made.

## Quality checklist

Before finalizing, verify:
- [ ] Stratégie is 2-4 sentences, no file paths, captures the mental model
- [ ] Each entrypoint bullet fits on a single line (no sub-bullets)
- [ ] No code, types, validation rules, or implementation details in the plan
- [ ] Total plan section (Stratégie + Entrypoints) is under ~20 lines
- [ ] All file paths reference the actual codebase
- [ ] No requirements are assumed beyond what the ticket and designs state
