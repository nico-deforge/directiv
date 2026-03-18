use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

// --- Output types (match frontend TypeScript interfaces) ---

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhAuthInfo {
    pub logged_in: bool,
    pub username: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPullRequest {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub url: String,
    pub branch: String,
    pub draft: bool,
    pub review_decision: Option<String>,
    pub requested_reviewer_count: u32,
    pub reviews: Vec<GhReview>,
    pub ci_status: Option<String>,
    pub ci_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhReview {
    pub author: String,
    pub state: String,
    pub submitted_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GhReviewRequest {
    pub number: u32,
    pub title: String,
    pub url: String,
    pub repo_name: String,
    pub author_login: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_draft: bool,
}

// --- GraphQL response types for viewer PRs ---

#[derive(Deserialize)]
struct ViewerPRsResponse {
    data: ViewerPRsData,
}

#[derive(Deserialize)]
struct ViewerPRsData {
    viewer: ViewerPRsViewer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewerPRsViewer {
    pull_requests: PRConnection,
}

#[derive(Deserialize)]
struct PRConnection {
    nodes: Vec<PRNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PRNode {
    number: u32,
    title: String,
    is_draft: bool,
    url: String,
    head_ref_name: String,
    created_at: String,
    updated_at: String,
    review_decision: Option<String>,
    review_requests: TotalCount,
    latest_reviews: ReviewConnection,
    commits: CommitConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TotalCount {
    total_count: u32,
}

#[derive(Deserialize)]
struct ReviewConnection {
    nodes: Vec<ReviewNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReviewNode {
    author: Option<LoginHolder>,
    state: String,
    submitted_at: String,
}

#[derive(Deserialize)]
struct LoginHolder {
    login: String,
}

#[derive(Deserialize)]
struct CommitConnection {
    nodes: Vec<CommitWrapper>,
}

#[derive(Deserialize)]
struct CommitWrapper {
    commit: CommitDetail,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommitDetail {
    status_check_rollup: Option<RollupState>,
}

#[derive(Deserialize)]
struct RollupState {
    state: String,
}

// --- GraphQL response types for review requests ---

#[derive(Deserialize)]
struct SearchResponse {
    data: SearchData,
}

#[derive(Deserialize)]
struct SearchData {
    search: SearchConnection,
}

#[derive(Deserialize)]
struct SearchConnection {
    nodes: Vec<SearchPRNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchPRNode {
    number: Option<u32>,
    title: Option<String>,
    url: Option<String>,
    is_draft: Option<bool>,
    created_at: Option<String>,
    updated_at: Option<String>,
    repository: Option<RepoHolder>,
    author: Option<LoginHolder>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoHolder {
    name_with_owner: String,
}

// --- GraphQL queries ---

const VIEWER_PRS_QUERY: &str = "query { viewer { pullRequests(states: OPEN, first: 50) { nodes { number title isDraft url headRefName createdAt updatedAt reviewDecision reviewRequests { totalCount } latestReviews(first: 10) { nodes { author { login } state submittedAt } } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } } } }";

const REVIEW_REQUESTS_QUERY: &str = r#"query { search(query: "is:open is:pr review-requested:@me", type: ISSUE, first: 25) { nodes { ... on PullRequest { number title url isDraft createdAt updatedAt repository { nameWithOwner } author { login } } } } }"#;

// --- Commands ---

#[tauri::command]
pub async fn gh_auth_status(app: tauri::AppHandle) -> Result<GhAuthInfo, String> {
    let output = app
        .shell()
        .command("gh")
        .args(["api", "user", "--jq", ".login"])
        .output()
        .await
        .map_err(|_| {
            "GitHub CLI (gh) is not installed. Install it with `brew install gh` then run `gh auth login`.".to_string()
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("auth login") || stderr.contains("not logged") {
            return Err(
                "GitHub CLI is installed but not authenticated. Run `gh auth login` in your terminal.".to_string(),
            );
        }
        return Err(format!("gh auth check failed: {stderr}"));
    }

    let username = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(GhAuthInfo {
        logged_in: true,
        username,
    })
}

#[tauri::command]
pub async fn gh_list_my_open_prs(app: tauri::AppHandle) -> Result<Vec<GhPullRequest>, String> {
    let output = app
        .shell()
        .command("gh")
        .args(["api", "graphql", "-f", &format!("query={VIEWER_PRS_QUERY}")])
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh api graphql failed: {stderr}"));
    }

    let resp: ViewerPRsResponse = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let prs = resp
        .data
        .viewer
        .pull_requests
        .nodes
        .into_iter()
        .map(|pr| {
            let rollup = pr
                .commits
                .nodes
                .first()
                .and_then(|c| c.commit.status_check_rollup.as_ref());
            let ci_status = rollup.map(|r| r.state.clone());
            let ci_url = if rollup.is_some() {
                Some(format!("{}/checks", pr.url))
            } else {
                None
            };

            GhPullRequest {
                number: pr.number,
                title: pr.title,
                state: "open".to_string(),
                url: pr.url.clone(),
                branch: pr.head_ref_name,
                draft: pr.is_draft,
                review_decision: pr.review_decision,
                requested_reviewer_count: pr.review_requests.total_count,
                reviews: pr
                    .latest_reviews
                    .nodes
                    .into_iter()
                    .map(|r| GhReview {
                        author: r
                            .author
                            .map(|a| a.login)
                            .unwrap_or_else(|| "unknown".to_string()),
                        state: r.state,
                        submitted_at: r.submitted_at,
                    })
                    .collect(),
                ci_status,
                ci_url,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
            }
        })
        .collect();

    Ok(prs)
}

#[tauri::command]
pub async fn gh_list_review_requests(
    app: tauri::AppHandle,
) -> Result<Vec<GhReviewRequest>, String> {
    let output = app
        .shell()
        .command("gh")
        .args([
            "api",
            "graphql",
            "-f",
            &format!("query={REVIEW_REQUESTS_QUERY}"),
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh api graphql failed: {stderr}"));
    }

    let resp: SearchResponse = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let prs = resp
        .data
        .search
        .nodes
        .into_iter()
        .filter_map(|node| {
            Some(GhReviewRequest {
                number: node.number?,
                title: node.title?,
                url: node.url?,
                repo_name: node.repository?.name_with_owner,
                author_login: node
                    .author
                    .map(|a| a.login)
                    .unwrap_or_else(|| "unknown".to_string()),
                created_at: node.created_at?,
                updated_at: node.updated_at?,
                is_draft: node.is_draft.unwrap_or(false),
            })
        })
        .collect();

    Ok(prs)
}

#[tauri::command]
pub async fn gh_check_repo_access(app: tauri::AppHandle, nwo: String) -> Result<bool, String> {
    let output = app
        .shell()
        .command("gh")
        .args(["repo", "view", &nwo, "--json", "name"])
        .output()
        .await
        .map_err(|e| format!("Failed to run gh: {e}"))?;

    if output.status.success() {
        return Ok(true);
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("auth login") || stderr.contains("not logged") {
        return Err("gh CLI is not authenticated".to_string());
    }

    Ok(false)
}
