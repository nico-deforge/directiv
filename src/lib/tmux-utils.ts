/** Sanitize a branch name / identifier into a valid tmux session name. */
export function toSessionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "-");
}
