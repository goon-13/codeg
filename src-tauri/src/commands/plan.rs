use serde::{Deserialize, Serialize};

use crate::app_error::AppCommandError;
use crate::paths;
use crate::plan::{ensure_templates, plan_root, read_text, write_text};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanStatus {
    pub root: String,
    pub gtd: Vec<String>,
    pub calendars: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct PlanText {
    pub content: String,
    pub etag: String,
}

fn data_dir() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("CODEG_DATA_DIR") {
        if !p.is_empty() {
            return std::path::PathBuf::from(p);
        }
    }
    paths::codeg_home_dir()
}

fn root() -> Result<std::path::PathBuf, AppCommandError> {
    let root = plan_root(&data_dir());
    ensure_templates(&root).map_err(AppCommandError::io)?;
    Ok(root)
}

pub fn plan_status_core() -> Result<PlanStatus, AppCommandError> {
    let root = root()?;
    let mut gtd = Vec::new();
    let mut calendars = Vec::new();
    if let Ok(rd) = std::fs::read_dir(root.join("gtd")) {
        for ent in rd.flatten() {
            let name = ent.file_name().to_string_lossy().into_owned();
            if name.ends_with(".md") {
                gtd.push(format!("gtd/{name}"));
            }
        }
    }
    if let Ok(rd) = std::fs::read_dir(root.join("calendars")) {
        for ent in rd.flatten() {
            let name = ent.file_name().to_string_lossy().into_owned();
            if name.ends_with(".ics") {
                calendars.push(format!("calendars/{name}"));
            }
        }
    }
    gtd.sort();
    calendars.sort();
    Ok(PlanStatus {
        root: root.to_string_lossy().into_owned(),
        gtd,
        calendars,
    })
}

pub fn plan_read_text_core(rel: &str) -> Result<PlanText, AppCommandError> {
    let root = root()?;
    let file = read_text(&root, rel).map_err(AppCommandError::invalid_input)?;
    Ok(PlanText {
        content: file.content,
        etag: file.etag,
    })
}

pub fn plan_write_text_core(
    rel: &str,
    content: &str,
    etag: &str,
) -> Result<PlanText, AppCommandError> {
    let root = root()?;
    let next = write_text(&root, rel, content, etag).map_err(|e| {
        if e == "etag mismatch" {
            AppCommandError::already_exists(e)
        } else {
            AppCommandError::invalid_input(e)
        }
    })?;
    Ok(PlanText {
        content: content.to_string(),
        etag: next,
    })
}

#[derive(Deserialize)]
pub struct RelParams {
    pub rel: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteParams {
    pub rel: String,
    pub content: String,
    #[serde(default)]
    pub etag: String,
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub fn plan_status() -> Result<PlanStatus, AppCommandError> {
    plan_status_core()
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub fn plan_read_text(rel: String) -> Result<PlanText, AppCommandError> {
    plan_read_text_core(&rel)
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub fn plan_write_text(
    rel: String,
    content: String,
    etag: String,
) -> Result<PlanText, AppCommandError> {
    plan_write_text_core(&rel, &content, &etag)
}
