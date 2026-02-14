---
name: commit
description: Use when I ask you to commit changes to the project.
---

### PREREQUISITES
- Read all branch git changes
- Check the linters and formatters of the project

### ACTIONS
- Add files to git if new files have been created
- Create a clear and concise commit message with one digest line and list of changes at the bottom
- If different changes are from different contexts, split commit into multiple relevant commits
- Commit and push the changes to the local and remote branch

### NOTES
At the beginning of the commit message, include a reference to the issue or task that the commit addresses with this format: [XXX-123]
The reference issue is in the branch name, do not include it if the branch name does not contain an issue number.

When committing code changes:
Never add Claude as a commit author. Do not mark you as co-author of the commit.
Always commit as using the default git settings

If you are on master/main DO NOT commit on this branch
Find the context task and checkout on the branch named as [XXX-123] the issue number
