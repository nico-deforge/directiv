import type { BlockingIssue, EnrichedTask, LinearStatusType } from "../types";
import type { IssueNode } from "./linearQueries";

export function transformIssueNode(
  node: IssueNode,
  viewerId: string,
): EnrichedTask {
  const blockedBy: BlockingIssue[] = (
    node.inverseRelations?.nodes ?? []
  ).flatMap((r) => {
    if (r.type !== "blocks" || !r.issue) return [];
    return {
      id: r.issue.id,
      identifier: r.issue.identifier,
      title: r.issue.title,
      url: r.issue.url,
      relationId: r.id,
    };
  });

  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    description: node.description ?? null,
    priority: node.priority,
    status: node.state?.name ?? "Unknown",
    linearStatusType: (node.state?.type as LinearStatusType) ?? null,
    statusColor: node.state?.color ?? null,
    assigneeId: node.assignee?.id ?? null,
    assigneeName: node.assignee?.displayName ?? node.assignee?.name ?? null,
    isAssignedToMe: node.assignee?.id === viewerId,
    projectId: node.project?.id ?? null,
    projectName: node.project?.name ?? null,
    labels: [],
    column: "backlog" as const,
    session: null,
    worktree: null,
    pullRequest: null,
    url: node.url,
    isBlocked: blockedBy.length > 0,
    blockedBy,
  };
}
