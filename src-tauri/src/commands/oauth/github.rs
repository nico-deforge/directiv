use serde::{Deserialize, Serialize};
use tauri_plugin_opener::OpenerExt;

use super::shared::*;

const GITHUB_CLIENT_ID: &str = "Ov23liZDy62m4rMkvMkY";
const GITHUB_SCOPE: &str = "repo";
const KEY_GITHUB_TOKEN: &str = "github_access_token";

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct PollResponse {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

#[tauri::command]
pub async fn github_oauth_start(app: tauri::AppHandle) -> Result<DeviceCodeResponse, String> {
    let resp = reqwest::Client::new()
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", GITHUB_SCOPE)])
        .send()
        .await
        .map_err(|e| format!("Device code request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Device code request failed ({status}): {body}"));
    }

    let device_resp = resp
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("Failed to parse device code response: {e}"))?;

    app.opener()
        .open_url(&device_resp.verification_uri, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {e}"))?;

    Ok(device_resp)
}

#[tauri::command]
pub async fn github_oauth_poll(
    device_code: String,
    interval: u64,
    expires_in: u64,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut poll_interval = std::time::Duration::from_secs(interval.max(5));
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(expires_in);

    loop {
        tokio::time::sleep(poll_interval).await;

        if tokio::time::Instant::now() >= deadline {
            return Err("Device code expired — please restart the authorization flow".to_string());
        }

        let resp = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GITHUB_CLIENT_ID),
                ("device_code", device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Poll request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Poll request failed ({status}): {body}"));
        }

        let poll_resp = resp
            .json::<PollResponse>()
            .await
            .map_err(|e| format!("Failed to parse poll response: {e}"))?;

        if let Some(token) = poll_resp.access_token {
            keyring_set(KEY_GITHUB_TOKEN, &token)?;
            return Ok(token);
        }

        match poll_resp.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                poll_interval += std::time::Duration::from_secs(5);
            }
            Some("expired_token") => {
                return Err(
                    "Device code expired — please restart the authorization flow".to_string(),
                );
            }
            Some("access_denied") => {
                return Err("Authorization was denied by the user".to_string());
            }
            Some(err) => {
                return Err(format!("GitHub OAuth error: {err}"));
            }
            None => {
                return Err("Unexpected response from GitHub — no token and no error".to_string());
            }
        }
    }
}

#[tauri::command]
pub async fn github_get_token() -> Result<Option<String>, String> {
    Ok(keyring_get(KEY_GITHUB_TOKEN))
}

#[tauri::command]
pub async fn github_oauth_disconnect() -> Result<(), String> {
    keyring_delete(KEY_GITHUB_TOKEN);
    Ok(())
}
