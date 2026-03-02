---
name: linear-code
description: "Execute the implementation plan for a Linear task. Use this skill when the user wants to code a Linear ticket, implement a planned task, or start development on a Linear issue. Triggers: 'code this ticket', 'implement [ticket]', 'start coding [issue]', 'execute the plan for [ticket]'."
disable-model-invocation: true
---

Code the Linear issue $ARGUMENTS

## BEFORE
- Change Linear ticket status to In Progress
- Read all the description, comments, attachments and parent issue of the Linear issue.

## GET CONTEXT
- Get Linear issues dependencies: for each resolved blocking issue, read its description to understand what was implemented and what decisions were made

## EXECUTE
- Follow the Plan section of the Linear issue
- Run linter checks
- Run project tests. If no tests exist for the changed code and the plan mentions tests, write them.

## VERIFY
- Read again the Linear issue Validation section
- For EACH validation criterion, trace backwards:
  - What must be TRUE for this criterion to pass?
  - What artifact must EXIST (file, function, migration, route...)?
  - Is it WIRED? (imported, called, rendered, registered...)
- Scan the diff for leftover TODO, FIXME, empty functions, console.log
- Run project checks (lint, typecheck, tests)
- If a criterion is not satisfied: fix it (max 3 attempts)
- If still not satisfied after retries: note it explicitly in the PR description

## FINISH
- Execute your /directiv:create-pr skill
- If you have created or modified an endpoint, create a synthetic endpoint documentation in the issue comment
for my frontend integration (without javascript code) and write it in the Linear ticket comment

## Deviation rules
- Inline bug discovered → auto-fix it, note it in the PR description
- Missing dependency (import, package, config) → auto-fix it, note it in the PR description
- Architecture change needed (new pattern, schema change, different approach) → STOP and ask me for confirmation
- Unanswered questions from the plan → STOP and ask me for answers

## Post-execution
- If the implementation deviated from the initial plan, update the Linear issue description to reflect the actual implementation
