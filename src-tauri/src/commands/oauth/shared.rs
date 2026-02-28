use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(not(debug_assertions))]
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

// ── DEBUG: file-backed token store (no keychain prompts) ──────────────

#[cfg(debug_assertions)]
mod dev_store {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    struct TokenStore {
        loaded: bool,
        tokens: HashMap<String, String>,
    }

    fn store() -> &'static Mutex<TokenStore> {
        static STORE: OnceLock<Mutex<TokenStore>> = OnceLock::new();
        STORE.get_or_init(|| {
            Mutex::new(TokenStore {
                loaded: false,
                tokens: HashMap::new(),
            })
        })
    }

    fn config_path() -> std::path::PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("directiv")
            .join("dev-tokens.json")
    }

    fn lock_store() -> std::sync::MutexGuard<'static, TokenStore> {
        let mut guard = store().lock().unwrap();
        if !guard.loaded {
            guard.loaded = true;
            let path = config_path();
            if let Ok(data) = std::fs::read_to_string(&path) {
                if let Ok(parsed) = serde_json::from_str::<HashMap<String, String>>(&data) {
                    guard.tokens = parsed;
                }
            }
        }
        guard
    }

    fn flush(tokens: &HashMap<String, String>) {
        let path = config_path();
        if let Some(parent) = path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                eprintln!("[dev-store] failed to create {}: {e}", parent.display());
                return;
            }
        }
        match serde_json::to_string_pretty(tokens) {
            Ok(json) => {
                if let Err(e) = std::fs::write(&path, &json) {
                    eprintln!("[dev-store] failed to write {}: {e}", path.display());
                    return;
                }
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
                }
            }
            Err(e) => eprintln!("[dev-store] failed to serialize tokens: {e}"),
        }
    }

    pub fn get(key: &str) -> Option<String> {
        lock_store().tokens.get(key).cloned()
    }

    pub fn set(key: &str, value: &str) {
        let mut guard = lock_store();
        guard.tokens.insert(key.to_string(), value.to_string());
        flush(&guard.tokens);
    }

    pub fn delete(key: &str) {
        let mut guard = lock_store();
        guard.tokens.remove(key);
        flush(&guard.tokens);
    }
}

#[cfg(debug_assertions)]
pub fn keyring_get(key: &str) -> Option<String> {
    dev_store::get(key)
}

#[cfg(debug_assertions)]
pub fn keyring_set(key: &str, value: &str) -> Result<(), String> {
    dev_store::set(key, value);
    Ok(())
}

#[cfg(debug_assertions)]
pub fn keyring_delete(key: &str) {
    dev_store::delete(key);
}

// ── RELEASE: real OS keychain (unchanged) ─────────────────────────────

#[cfg(not(debug_assertions))]
mod release_store {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    pub fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
        static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
        CACHE.get_or_init(|| Mutex::new(HashMap::new()))
    }
}

#[cfg(not(debug_assertions))]
pub fn keyring_get(key: &str) -> Option<String> {
    let mut map = release_store::cache().lock().unwrap();
    if let Some(cached) = map.get(key) {
        return cached.clone();
    }
    let value = keyring::Entry::new(KEYRING_SERVICE, key)
        .ok()
        .and_then(|e| e.get_password().ok());
    map.insert(key.to_string(), value.clone());
    value
}

#[cfg(not(debug_assertions))]
pub fn keyring_set(key: &str, value: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(KEYRING_SERVICE, key).map_err(|e| format!("Keyring error: {e}"))?;
    entry
        .set_password(value)
        .map_err(|e| format!("Keyring set error: {e}"))?;
    release_store::cache()
        .lock()
        .unwrap()
        .insert(key.to_string(), Some(value.to_string()));
    Ok(())
}

#[cfg(not(debug_assertions))]
pub fn keyring_delete(key: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, key) {
        let _ = entry.delete_credential();
    }
    release_store::cache()
        .lock()
        .unwrap()
        .insert(key.to_string(), None);
}
