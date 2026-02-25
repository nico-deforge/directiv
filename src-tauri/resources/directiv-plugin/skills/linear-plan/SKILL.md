---
name: linear-plan
description: "Produce a technical plan for a Linear task. Use this skill when the user asks to plan, design, or write a plan for a Linear ticket before implementation. Triggers: 'technical plan', 'plan the implementation', 'draft the plan for [ticket]', or any request to fill the Plan section of a Linear issue. Also use when creating a new Linear task that needs a plan from scratch."
disable-model-invocation: true
---

# Linear Plan

Produce a technical plan for a Linear task using the template in [references/ticket-template.md](references/ticket-template.md).

## Steps

1. Fetch the Linear issue (description, comments, attachments, parent issue)
2. Explore the relevant parts of the codebase to understand existing patterns and identify files to modify
3. Write a structured plan using the ticket template — focus on WHAT to change and WHERE, not HOW
4. Update the Linear issue description with the plan (or create the issue if it doesn't exist)
