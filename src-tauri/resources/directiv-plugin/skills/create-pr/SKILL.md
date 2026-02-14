---
name: create-pr
description: Use when I ask you to create the Github Pull Request.
---

### PREREQUISITES
- No current git changes left
- If changes left execute /directiv:commit skill

### ACTIONS
- Use code-simplifier subagents to simplify the code
- Use code-reviewer subagents to produce a code review
- Take the pragmatic and relevant changes into account
- Create Github Pull Request without reviewer
- Create a @claude review this PR comment

### NOTES
Use Github gh cli
