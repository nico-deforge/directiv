---
name: linear-code
description: "Execute the implementation plan for a Linear task. Use this skill when the user wants to code a Linear ticket, implement a planned task, or start development on a Linear issue. Triggers: 'code this ticket', 'implement [ticket]', 'start coding [issue]', 'execute the plan for [ticket]'."
disable-model-invocation: true
---

Code the Linear issue $ARGUMENTS

## Steps

1. Read the Linear issue: description, comments, attachments, and parent issue
2. Change ticket status to In Progress
3. Follow the Plan section of the Linear issue to implement the changes
4. Run project checks (lint, typecheck, tests)
5. Create a PR with /directiv:create-pr
