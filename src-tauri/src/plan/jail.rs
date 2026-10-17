use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use sha2::{Digest, Sha256};

fn write_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

const GTD_FILES: &[(&str, &str)] = &[
    (
        "gtd/inbox.md",
        "# Inbox\n\n捕获。未澄清的条目。不是日历。\n",
    ),
    (
        "gtd/next-actions.md",
        "# Next actions\n\n具体、可物理执行的下一行动。有时刻的承诺才进 calendars/。\n",
    ),
    ("gtd/waiting.md", "# Waiting\n\n等别人的。不要假装在做。\n"),
    ("gtd/done.md", "# Done\n\n人点完成的条目。\n"),
];

const EMPTY_ICS: &str = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//codeg//plan//EN\nEND:VCALENDAR\n";

pub struct PlanFile {
    pub content: String,
    pub etag: String,
}

pub fn plan_root(data_dir: &Path) -> PathBuf {
    if let Ok(p) = std::env::var("CODEG_PLAN_ROOT") {
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    data_dir.join("plan")
}

pub fn jail_rel(rel: &str) -> Result<PathBuf, String> {
    let cleaned = rel.replace('\\', "/");
    if cleaned.is_empty() || cleaned.starts_with('/') || cleaned.contains('\0') {
        return Err("invalid plan path".into());
    }
    let path = Path::new(&cleaned);
    if path.components().any(|c| matches!(c, Component::ParentDir | Component::RootDir)) {
        return Err("invalid plan path".into());
    }
    let ok = matches!(
        cleaned.as_str(),
        "gtd/inbox.md"
            | "gtd/next-actions.md"
            | "gtd/waiting.md"
            | "gtd/done.md"
    ) || (cleaned.starts_with("calendars/") && cleaned.ends_with(".ics") && cleaned.matches('/').count() == 1);
    if !ok {
        return Err("path outside plan jail".into());
    }
    Ok(PathBuf::from(cleaned))
}

pub fn etag_of(content: &str) -> String {
    let mut h = Sha256::new();
    h.update(content.as_bytes());
    let hex = format!("{:x}", h.finalize());
    hex[..16].to_string()
}

pub fn ensure_templates(root: &Path) -> std::io::Result<()> {
    fs::create_dir_all(root.join("gtd"))?;
    fs::create_dir_all(root.join("calendars"))?;
    for (rel, body) in GTD_FILES {
        let p = root.join(rel);
        if !p.exists() {
            fs::write(p, body)?;
        }
    }
    let ics = root.join("calendars/home.ics");
    if !ics.exists() {
        fs::write(ics, EMPTY_ICS)?;
    }
    Ok(())
}

pub fn read_text(root: &Path, rel: &str) -> Result<PlanFile, String> {
    let safe = jail_rel(rel)?;
    let path = root.join(safe);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(PlanFile {
        etag: etag_of(&content),
        content,
    })
}

pub fn write_text(root: &Path, rel: &str, content: &str, etag: &str) -> Result<String, String> {
    let _guard = write_lock()
        .lock()
        .map_err(|_| "plan write lock poisoned".to_string())?;
    let safe = jail_rel(rel)?;
    let path = root.join(safe);
    if path.exists() {
        let current = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let current_etag = etag_of(&current);
        if !etag.is_empty() && current_etag != etag {
            return Err("etag mismatch".into());
        }
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(etag_of(content))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_dir() {
        assert!(jail_rel("../secret").is_err());
        assert!(jail_rel("gtd/foo.txt").is_err());
        assert!(jail_rel("calendars/a.ics").is_ok());
        assert!(jail_rel("gtd/inbox.md").is_ok());
    }

    #[test]
    fn writes_jailed_inbox_and_rejects_escape() {
        let dir = std::env::temp_dir().join(format!("codeg-plan-jail-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        ensure_templates(&dir).unwrap();
        let first = read_text(&dir, "gtd/inbox.md").unwrap();
        let next = write_text(&dir, "gtd/inbox.md", "- [ ] x `p_deadbeef`\n", &first.etag).unwrap();
        assert_ne!(next, first.etag);
        assert!(write_text(&dir, "../secret", "no", "").is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
