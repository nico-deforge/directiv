---
name: linear-tactic
description: "Produce a technical tactic (implementation plan) for a Linear task. Use this skill when the user asks to plan, design, or write a tactic/tactique for a Linear ticket before implementation. Triggers: 'technical tactic', 'tactique', 'plan the implementation', 'draft the tactic for [ticket]', or any request to fill the Tactique section of a Linear issue. Also use when creating a new Linear task that needs a tactic from scratch."
disable-model-invocation: true
---

# Linear Tactic

Produce a precise, actionable technical tactic for a Linear task. The tactic serves as a direct prompt for a developer agent who will implement the solution.

## Workflow

### 1. Gather ticket context

**If the ticket exists:**
- Fetch the Linear issue (title, description, all comments, attachments, labels, priority).
- Fetch the parent ticket if any — read its description and comments for broader scope.
- Check sub-issues for related context.

**If the ticket does not exist:**
- Ask the user for: title, project id, milestone id, and context (Figma, Sentry, project context).
- Proceed to step 4 after gathering context.

### 2. Gather external context

- **Figma**: If a Figma link appears anywhere in the ticket (description, comments, attachments), fetch and analyze the design. Note all UI components, layouts, states, interactions. Capture a screenshot of the relevant Figma node using `get_screenshot` — it will be attached to the Linear ticket in step 5.
- **Sentry**: If a Sentry issue is mentioned, fetch bug details (stacktrace, tags, frequency).
- **Library docs**: If the task requires setting up or modifying a library, use Context7 to fetch relevant documentation.
- If none of these apply, proceed with text-based requirements only.

### 3. Analyze the codebase

Explore the relevant parts of the codebase based on identified requirements:
- Find existing patterns, models, services, and components that relate to the task.
- Identify files that will need modification or creation.
- Note conventions from `.ai-assistants/rules/` if present.

### 4. Write the tactic

Write a synthetic, structured tactic in **French** using the template in [references/ticket-template.md](references/ticket-template.md).

**Writing rules:**
- Imperative language: "Créer...", "Modifier...", "Ajouter...", "S'assurer que..."
- Reference actual file paths and existing patterns from the codebase.
- Cover full scope: backend, frontend, hooks, migrations, tests, edge cases.
- Flag gaps or ambiguities instead of assuming requirements.
- Keep it self-contained: a developer agent reading only the tactic should have everything needed.
- Prefer existing patterns over introducing new ones.

### 5. Update Linear

**If ticket exists:** Update the issue description. If a tactic already exists, add the new one in a clearly separated section. If a Figma screenshot was captured, attach it to the issue using `create_attachment`.

**If ticket does not exist:** Create the issue with the filled template. If a Figma screenshot was captured, attach it to the newly created issue using `create_attachment`.

### 6. Handle questions

- **Technical questions** blocking the tactic: add a Linear comment with the question.
- **Product or design questions**: add a Linear comment mentioning **@pierre.aldebert**.
- Be explicit about what is blocking and what assumptions are made.

## Quality checklist

Before finalizing, verify:
- [ ] Every step is concrete enough for a developer agent to execute without ambiguity
- [ ] All file paths and patterns reference the actual codebase
- [ ] No requirements are assumed beyond what the ticket and designs state
- [ ] The tactic follows existing codebase conventions
- [ ] Edge cases and validation rules are addressed
