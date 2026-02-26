use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncBufReadExt;
use tokio::net::TcpListener;
use url::Url;

const LINEAR_CLIENT_ID: &str = "68b44898ebc27357cba06642d0c9efa6";
const REDIRECT_PORT: u16 = 19823;
const REDIRECT_URI: &str = "http://127.0.0.1:19823/callback";
const KEYRING_SERVICE: &str = "com.directiv.app";
const KEY_ACCESS_TOKEN: &str = "linear_access_token";
const KEY_REFRESH_TOKEN: &str = "linear_refresh_token";
const KEY_EXPIRES_AT: &str = "linear_expires_at";

static OAUTH_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: String,
    expires_in: u64,
    #[serde(default)]
    scope: Vec<String>,
    #[serde(default)]
    refresh_token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct OAuthStatus {
    pub has_token: bool,
    pub expires_at: Option<u64>,
    pub is_expired: bool,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn random_base64<const N: usize>() -> String {
    let mut bytes = [0u8; N];
    rand::rng().fill(&mut bytes[..]);
    URL_SAFE_NO_PAD.encode(bytes)
}

// --- Keyring helpers ---

fn keyring_get(key: &str) -> Option<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, key).ok()?;
    entry.get_password().ok()
}

fn keyring_set(key: &str, value: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| format!("Keyring error: {e}"))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keyring set error: {e}"))
}

fn keyring_delete(key: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, key) {
        let _ = entry.delete_credential();
    }
}

fn store_tokens(
    access_token: &str,
    refresh_token: Option<&str>,
    expires_in: u64,
) -> Result<(), String> {
    let expires_at = now_secs() + expires_in;
    keyring_set(KEY_ACCESS_TOKEN, access_token)?;
    if let Some(rt) = refresh_token {
        keyring_set(KEY_REFRESH_TOKEN, rt)?;
    }
    keyring_set(KEY_EXPIRES_AT, &expires_at.to_string())?;
    Ok(())
}

fn clear_tokens() {
    keyring_delete(KEY_ACCESS_TOKEN);
    keyring_delete(KEY_REFRESH_TOKEN);
    keyring_delete(KEY_EXPIRES_AT);
}

// --- PKCE helpers ---

fn generate_code_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

fn build_auth_url(state: &str, code_challenge: &str) -> String {
    let mut url = Url::parse("https://linear.app/oauth/authorize").unwrap();
    url.query_pairs_mut()
        .append_pair("client_id", LINEAR_CLIENT_ID)
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("response_type", "code")
        .append_pair("scope", "read,write,issues:create,comments:create")
        .append_pair("state", state)
        .append_pair("code_challenge", code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "consent");
    url.to_string()
}

/// Parse the callback HTTP request line to extract code and state query params.
fn parse_callback_request(request_line: &str) -> Result<(String, String), String> {
    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or("Invalid HTTP request")?;

    let url = Url::parse(&format!("http://localhost{path}"))
        .map_err(|e| format!("Failed to parse callback URL: {e}"))?;

    let mut code = None;
    let mut state = None;
    let mut error = None;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "code" => code = Some(value.to_string()),
            "state" => state = Some(value.to_string()),
            "error" => error = Some(value.to_string()),
            _ => {}
        }
    }

    if let Some(err) = error {
        return Err(format!("OAuth error: {err}"));
    }

    let code = code.ok_or("Missing 'code' parameter in callback")?;
    let state = state.ok_or("Missing 'state' parameter in callback")?;
    Ok((code, state))
}

// --- Token exchange ---

async fn post_token_request(form: &[(&str, &str)], context: &str) -> Result<TokenResponse, String> {
    let resp = reqwest::Client::new()
        .post("https://api.linear.app/oauth/token")
        .form(form)
        .send()
        .await
        .map_err(|e| format!("{context} request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("{context} failed ({status}): {body}"));
    }

    resp.json::<TokenResponse>()
        .await
        .map_err(|e| format!("{context}: failed to parse response: {e}"))
}

async fn exchange_code(code: &str, code_verifier: &str) -> Result<TokenResponse, String> {
    post_token_request(
        &[
            ("grant_type", "authorization_code"),
            ("client_id", LINEAR_CLIENT_ID),
            ("redirect_uri", REDIRECT_URI),
            ("code", code),
            ("code_verifier", code_verifier),
        ],
        "Token exchange",
    )
    .await
}

async fn refresh_tokens(refresh_token: &str) -> Result<TokenResponse, String> {
    post_token_request(
        &[
            ("grant_type", "refresh_token"),
            ("client_id", LINEAR_CLIENT_ID),
            ("refresh_token", refresh_token),
        ],
        "Token refresh",
    )
    .await
}

/// Send an HTML response to close the browser tab.
async fn send_callback_response(mut stream: tokio::net::TcpStream) {
    let body = r#"<!DOCTYPE html><html><body><h2>Connected to Linear!</h2><p>You can close this tab and return to Directiv.</p><script>window.close()</script></body></html>"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    tokio::io::AsyncWriteExt::write_all(&mut stream, response.as_bytes())
        .await
        .ok();
}

#[tauri::command]
pub async fn linear_oauth_start(app: tauri::AppHandle) -> Result<String, String> {
    if OAUTH_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(
            "An OAuth flow is already in progress. Please wait or restart the app.".to_string(),
        );
    }
    // Guard ensures the flag is always reset, even on early returns
    struct OAuthGuard;
    impl Drop for OAuthGuard {
        fn drop(&mut self) {
            OAUTH_IN_PROGRESS.store(false, Ordering::SeqCst);
        }
    }
    let _guard = OAuthGuard;

    let code_verifier = random_base64::<96>();
    let code_challenge = generate_code_challenge(&code_verifier);
    let state = random_base64::<32>();

    let listener = TcpListener::bind(format!("127.0.0.1:{REDIRECT_PORT}"))
        .await
        .map_err(|e| format!("Failed to bind callback server on port {REDIRECT_PORT}: {e}"))?;

    let auth_url = build_auth_url(&state, &code_challenge);
    app.opener()
        .open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    // Wait for the real OAuth callback, retrying on stray connections
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(120);
    let (code, returned_state, stream) = loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("OAuth timed out — no callback received within 120 seconds".to_string());
        }

        let (stream, _addr) = tokio::time::timeout(remaining, listener.accept())
            .await
            .map_err(|_| "OAuth timed out — no callback received within 120 seconds".to_string())?
            .map_err(|e| format!("Failed to accept callback connection: {e}"))?;

        let mut reader = tokio::io::BufReader::new(stream);
        let mut request_line = String::new();

        // Per-read timeout to avoid hanging on slow/malicious connections
        let read_result = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            reader.read_line(&mut request_line),
        )
        .await;

        if read_result.is_err() || read_result.unwrap().is_err() {
            continue; // Ignore malformed connections
        }

        match parse_callback_request(&request_line) {
            Ok((code, cb_state)) => {
                // Drain remaining HTTP headers before writing response
                let mut header = String::new();
                loop {
                    header.clear();
                    match reader.read_line(&mut header).await {
                        Ok(0) => break,
                        Ok(_) if header.trim().is_empty() => break,
                        Ok(_) => continue,
                        Err(_) => break,
                    }
                }
                break (code, cb_state, reader.into_inner());
            }
            Err(_) => continue, // Not the OAuth callback, wait for next connection
        }
    };

    send_callback_response(stream).await;

    if returned_state != state {
        return Err("OAuth state mismatch — possible CSRF attack".to_string());
    }

    let token_resp = exchange_code(&code, &code_verifier).await?;
    store_tokens(
        &token_resp.access_token,
        token_resp.refresh_token.as_deref(),
        token_resp.expires_in,
    )?;

    Ok(token_resp.access_token)
}

#[tauri::command]
pub async fn linear_oauth_refresh() -> Result<String, String> {
    let refresh_token =
        keyring_get(KEY_REFRESH_TOKEN).ok_or("No refresh token found in keychain")?;

    let token_resp = refresh_tokens(&refresh_token).await?;
    store_tokens(
        &token_resp.access_token,
        token_resp.refresh_token.as_deref(),
        token_resp.expires_in,
    )?;

    Ok(token_resp.access_token)
}

#[tauri::command]
pub async fn linear_get_valid_token() -> Result<Option<String>, String> {
    let access_token = match keyring_get(KEY_ACCESS_TOKEN) {
        Some(t) => t,
        None => return Ok(None),
    };

    let expires_at = keyring_get(KEY_EXPIRES_AT)
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    let now = now_secs();

    // If token expires in less than 5 minutes, try to refresh
    if now + 300 >= expires_at {
        if let Some(refresh_token) = keyring_get(KEY_REFRESH_TOKEN) {
            match refresh_tokens(&refresh_token).await {
                Ok(token_resp) => {
                    store_tokens(
                        &token_resp.access_token,
                        token_resp.refresh_token.as_deref(),
                        token_resp.expires_in,
                    )?;
                    return Ok(Some(token_resp.access_token));
                }
                Err(_) => {
                    clear_tokens();
                    return Ok(None);
                }
            }
        } else if now >= expires_at {
            clear_tokens();
            return Ok(None);
        }
    }

    Ok(Some(access_token))
}

#[tauri::command]
pub async fn linear_oauth_status() -> Result<OAuthStatus, String> {
    let has_token = keyring_get(KEY_ACCESS_TOKEN).is_some();
    let expires_at = keyring_get(KEY_EXPIRES_AT).and_then(|s| s.parse::<u64>().ok());
    let is_expired = expires_at.map_or(true, |exp| now_secs() >= exp);

    Ok(OAuthStatus {
        has_token,
        expires_at,
        is_expired: !has_token || is_expired,
    })
}

#[tauri::command]
pub async fn linear_oauth_disconnect() -> Result<(), String> {
    // Best-effort revoke (RFC 7009: access_token in POST body)
    if let Some(access_token) = keyring_get(KEY_ACCESS_TOKEN) {
        let _ = reqwest::Client::new()
            .post("https://api.linear.app/oauth/revoke")
            .form(&[("access_token", &access_token)])
            .send()
            .await;
    }

    clear_tokens();
    Ok(())
}
