---
name: create-pr
description: Use when I ask you to create the Github Pull Request.
---

### PREREQUISITES
- No current git changes left
- If changes left execute /directiv:commit skill

### ACTIONS
- Use code-reviewer subagents to produce a code review
- Use all pr-review-toolkit subagents to produce a code review
- Take the pragmatic and relevant changes into account
- Create Github Pull Request without reviewer
- Create a @claude review this PR comment

### NOTES
- Use Github gh cli
- If the pull request contains more than one db migration, split it into multiple PRs
One by migration and its context.
