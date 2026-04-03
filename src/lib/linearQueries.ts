// ---------------------------------------------------------------------------
// Raw GraphQL queries for Linear API
// Replaces lazy-loaded SDK calls to eliminate N+1 request patterns.
// Each query is followed by its TypeScript response types for colocation.
// ---------------------------------------------------------------------------

// -- Query 1: Viewer + Teams (with workflow states) -------------------------

export const VIEWER_WITH_TEAMS = `
  query ViewerWithTeams {
    viewer {
      id
      teams {
        nodes {
          id
          name
          displayName
          key
          states {
            nodes {
              id
              name
              type
              color
            }
          }
        }
      }
    }
  }
`;

export interface WorkflowStateRef {
  name: string;
  type: string;
  color: string;
}

export interface WorkflowStateNode extends WorkflowStateRef {
  id: string;
}

export interface TeamNode {
  id: string;
  name: string;
  displayName: string;
  key: string;
  states: { nodes: WorkflowStateNode[] };
}

export interface ViewerWithTeamsData {
  viewer: {
    id: string;
    teams: { nodes: TeamNode[] };
  };
}

// -- Query 2: Enriched Issues -----------------------------------------------

export const ISSUES_ENRICHED = `
  query IssuesEnriched($filter: IssueFilter, $first: Int) {
    issues(filter: $filter, first: $first) {
      nodes {
        id
        identifier
        title
        description
        priority
        url
        state {
          name
          type
          color
        }
        assignee {
          id
          name
          displayName
        }
        project {
          id
          name
        }
        inverseRelations {
          nodes {
            id
            type
            issue {
              id
              identifier
              title
              url
            }
          }
        }
      }
    }
  }
`;

export interface IssueRelationNode {
  id: string;
  type: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
    url: string;
  } | null;
}

export interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number;
  url: string;
  state: WorkflowStateRef | null;
  assignee: { id: string; name: string; displayName: string } | null;
  project: { id: string; name: string } | null;
  inverseRelations: { nodes: IssueRelationNode[] } | null;
}

export interface IssuesEnrichedData {
  issues: { nodes: IssueNode[] };
}

// -- Query 3: Branch search (with inline state) -----------------------------

export const BRANCH_SEARCH = `
  query BranchSearch($branchName: String!) {
    issueVcsBranchSearch(branchName: $branchName) {
      id
      identifier
      title
      url
      state {
        name
        type
        color
      }
    }
  }
`;

export interface BranchSearchData {
  issueVcsBranchSearch: {
    id: string;
    identifier: string;
    title: string;
    url: string;
    state: WorkflowStateRef | null;
  } | null;
}

// -- Query 4: Minimal issue → team ID (used by updateLinearStatusToStarted) -

export const ISSUE_TEAM_ID = `
  query IssueTeamId($id: String!) {
    issue(id: $id) {
      team {
        id
      }
    }
  }
`;

export interface IssueTeamIdData {
  issue: { team: { id: string } | null };
}
