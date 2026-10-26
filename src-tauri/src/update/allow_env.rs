//! Official in-app update stays off unless `CODEG_ALLOW_OFFICIAL_UPDATE` is `1`.

/// Process env that opts in to the official download/swap path.
pub const ENV_ALLOW_OFFICIAL_UPDATE: &str = "CODEG_ALLOW_OFFICIAL_UPDATE";

/// True only when [`ENV_ALLOW_OFFICIAL_UPDATE`] is exactly `1`.
/// Missing, empty, `true`, and `yes` are all false.
pub fn official_update_allowed() -> bool {
    std::env::var(ENV_ALLOW_OFFICIAL_UPDATE).ok().as_deref() == Some("1")
}

/// Serializes tests that mutate [`ENV_ALLOW_OFFICIAL_UPDATE`].
#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Holds [`ENV_LOCK`] and restores the previous env value on drop.
#[cfg(test)]
pub(crate) struct EnvGuard {
    prev: Option<String>,
    _lock: std::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
impl EnvGuard {
    pub(crate) fn set(value: Option<&str>) -> Self {
        let lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var(ENV_ALLOW_OFFICIAL_UPDATE).ok();
        match value {
            Some(v) => std::env::set_var(ENV_ALLOW_OFFICIAL_UPDATE, v),
            None => std::env::remove_var(ENV_ALLOW_OFFICIAL_UPDATE),
        }
        Self { prev, _lock: lock }
    }
}

#[cfg(test)]
impl Drop for EnvGuard {
    fn drop(&mut self) {
        match self.prev.take() {
            Some(v) => std::env::set_var(ENV_ALLOW_OFFICIAL_UPDATE, v),
            None => std::env::remove_var(ENV_ALLOW_OFFICIAL_UPDATE),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ENV_ALLOW_OFFICIAL_UPDATE;

    #[test]
    fn official_update_allowed_blocked_by_default() {
        let _guard = super::EnvGuard::set(None);
        assert!(!super::official_update_allowed());
        std::env::set_var(ENV_ALLOW_OFFICIAL_UPDATE, "1");
        assert!(super::official_update_allowed());
        std::env::set_var(ENV_ALLOW_OFFICIAL_UPDATE, "true");
        assert!(!super::official_update_allowed());
        std::env::set_var(ENV_ALLOW_OFFICIAL_UPDATE, "");
        assert!(!super::official_update_allowed());
        std::env::set_var(ENV_ALLOW_OFFICIAL_UPDATE, "yes");
        assert!(!super::official_update_allowed());
    }
}
