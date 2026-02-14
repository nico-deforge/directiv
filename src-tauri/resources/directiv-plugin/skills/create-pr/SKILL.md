---
name: create-pr
description: Use when I ask you to create the Github Pull Request.
---

### PREREQUISITES
- No current git changes left
- If changes left execute /directiv:commit skill

### ACTIONS
- Review the changes for obvious issues
- Create Github Pull Request using `gh` CLI
- Create a `@claude review this PR` comment on the PR
