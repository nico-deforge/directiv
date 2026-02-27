use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

pub const KEYRING_SERVICE: &str = "com.directiv.app";

#[derive(Debug, Serialize)]
pub struct OAuthStatus {
    pub has_token: bool,
    pub expires_at: Option<u64>,
    pub is_expired: bool,
}

pub fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

/// In-memory cache for keyring values.
/// On macOS in dev mode, the binary is ad-hoc signed and each recompile
/// changes the signature, causing repeated Keychain Access prompts.
/// This cache ensures the keyring is only read once per key (on first access),
/// then all subsequent reads come from memory.
fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn keyring_get(key: &str) -> Option<String> {
    let mut map = cache().lock().unwrap();
    if let Some(cached) = map.get(key) {
        return cached.clone();
    }
    // First access — read from keyring and cache the result
    let value = keyring::Entry::new(KEYRING_SERVICE, key)
        .ok()
        .and_then(|e| e.get_password().ok());
    map.insert(key.to_string(), value.clone());
    value
}

pub fn keyring_set(key: &str, value: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| format!("Keyring error: {e}"))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keyring set error: {e}"))?;
    cache()
        .lock()
        .unwrap()
        .insert(key.to_string(), Some(value.to_string()));
    Ok(())
}

pub fn keyring_delete(key: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, key) {
        let _ = entry.delete_credential();
    }
    cache().lock().unwrap().insert(key.to_string(), None);
}
