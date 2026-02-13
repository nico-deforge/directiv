---
name: linear-issue
description: Linear issue implementation
disable-model-invocation: true
---

Do the Linear issue $ARGUMENTS

MUST HAVE : ALL the actions mentionned below has to be mention in your plan
In order to be done

## BEFORE
Change Linear ticket status to In Progress
Read all the description, comments, attachments and parent ticket of the Linear ticket.

## GET CONTEXT
- If the Linear ticket mentions libraries, get appropriate documentation in Context7
- If the Linear ticket mentions Figma, or create new screens or component, try to get the selected Figma design
- If the Linear ticket contains a link to Sentry, this is a bug. In this case, do this action :
    - Use Sentry MCP tool to get the bug details
    - Fix the bugs and if this is relevant write to tests to avoid the bug in the future

## PLAN
- Split the issue in TODO list of minimal tasks.
- Propose me the plan and validate it with me before implement it.

## EXECUTE
Execute the plan
Valid tests (optional if no tests are required)
Launch review independent agent to have quick feedback

## FINISH
Execute your /create-pr skill

## NOTES
If you have any questions, notify me with a comment on the Linear ticket.
If the question concerns product and design choices notify @pierre.aldebert

If you have created a new endpoint, create a synthetic endpoint documentation in the issue comment
for my frontend integration (without javascript code) and write it in the Linear ticket comment
