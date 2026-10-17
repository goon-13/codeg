use std::path::Path;

use rusqlite::Connection;

use super::SearchError;

const DOC_AND_FTS: &str = r#"
CREATE TABLE IF NOT EXISTS doc (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  folder_id INTEGER NOT NULL,
  agent TEXT NOT NULL,
  message_ref TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  source_path TEXT,
  source_mtime INTEGER,
  indexed_at INTEGER NOT NULL,
  UNIQUE(conversation_id, message_ref)
);
CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
  title, body, content='doc', content_rowid='id', tokenize='unicode61'
);
CREATE TRIGGER IF NOT EXISTS doc_fts_ai AFTER INSERT ON doc BEGIN
  INSERT INTO doc_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS doc_fts_ad AFTER DELETE ON doc BEGIN
  INSERT INTO doc_fts(doc_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS doc_fts_au AFTER UPDATE ON doc BEGIN
  INSERT INTO doc_fts(doc_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO doc_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
"#;

const TRI_TABLE: &str = r#"
CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts_tri USING fts5(
  title, body, content='doc', content_rowid='id', tokenize='trigram'
);
"#;

const TRI_TRIGGERS: &str = r#"
CREATE TRIGGER IF NOT EXISTS doc_fts_tri_ai AFTER INSERT ON doc BEGIN
  INSERT INTO doc_fts_tri(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS doc_fts_tri_ad AFTER DELETE ON doc BEGIN
  INSERT INTO doc_fts_tri(doc_fts_tri, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS doc_fts_tri_au AFTER UPDATE ON doc BEGIN
  INSERT INTO doc_fts_tri(doc_fts_tri, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO doc_fts_tri(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
"#;

/// Production data dir is `~/.local/share/codeg/`. `codeg-shelf` is a different directory.
pub(crate) fn guard_not_live(path: &Path) -> Result<(), SearchError> {
    if is_live_codeg_path(path) {
        return Err(SearchError::LiveDb);
    }
    if let Some(parent) = path.parent() {
        if let Ok(canon) = parent.canonicalize() {
            let joined = canon.join(path.file_name().unwrap_or_default());
            if is_live_codeg_path(&joined) {
                return Err(SearchError::LiveDb);
            }
        }
    }
    Ok(())
}

fn is_live_codeg_path(path: &Path) -> bool {
    let s = path.to_string_lossy();
    s.contains("/.local/share/codeg/") || s.ends_with("/.local/share/codeg")
}

pub(crate) fn ensure(conn: &Connection) -> Result<bool, SearchError> {
    conn.execute_batch(DOC_AND_FTS)?;
    let trigram_ok = conn.execute_batch(TRI_TABLE).is_ok();
    if trigram_ok {
        conn.execute_batch(TRI_TRIGGERS)?;
    }
    Ok(trigram_ok)
}
