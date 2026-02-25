---
name: fix-ci
description: Find failing CI jobs, inspect logs, and apply focused fixes
---

### PREREQUISITES
- Branch CI is failing and needs a path to green checks

### ACTIONS
- Identify the latest CI run for the current branch using `gh run list`
- Inspect failed jobs and extract the first actionable error using `gh run view --log-failed`
- Apply the smallest safe fix — one failure at a time
- Push the fix and wait for CI to re-run; repeat until all checks pass

### NOTES
- Use Github `gh` CLI
- Prefer minimal, low-risk changes before broader refactors
