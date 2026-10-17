//! Sidecar FTS index (`search.db`). Never the production `codeg.db`.

mod ingest;
mod query;
mod schema;

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params_from_iter, Connection};

/// Stay under SQLite's historical 999-variable cap.
const SQL_VAR_CHUNK: usize = 500;

pub use ingest::{extract_text_blocks, strip_secrets};

#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    #[error("search index: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("search index io: {0}")]
    Io(#[from] std::io::Error),
    #[error("refusing to open the production codeg data dir")]
    LiveDb,
    #[error("search index lock poisoned")]
    Poisoned,
}

/// Owns one rusqlite connection. Not the SeaORM pool and not `codeg.db`.
#[derive(Debug)]
pub struct SearchIndex {
    conn: Mutex<Connection>,
    trigram_ok: bool,
}

#[derive(Debug, Clone)]
pub struct SearchDoc {
    pub conversation_id: i32,
    pub folder_id: i32,
    pub agent: String,
    pub message_ref: String,
    pub title: Option<String>,
    pub body: String,
    pub source_path: Option<String>,
    pub source_mtime: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct SearchRequest {
    pub text: String,
    pub folder_ids: Option<Vec<i32>>,
    pub agent: Option<String>,
    pub after_unix: Option<i64>,
    pub limit: i32,
    pub prefer_trigram: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub conversation_id: i32,
    pub folder_id: i32,
    pub agent: String,
    pub title: Option<String>,
    pub snippet: String,
    pub message_ref: String,
    /// `"title"` or `"body"`.
    pub source: &'static str,
}

impl SearchIndex {
    pub fn open(path: &Path) -> Result<Self, SearchError> {
        schema::guard_not_live(path)?;
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent)?;
            }
        }
        let conn = Connection::open(path)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        let trigram_ok = schema::ensure(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            trigram_ok,
        })
    }

    pub fn trigram_available(&self) -> bool {
        self.trigram_ok
    }

    pub fn upsert_docs(&self, docs: &[SearchDoc]) -> Result<(), SearchError> {
        let mut conn = self.lock()?;
        ingest::upsert(&mut conn, docs)
    }

    pub fn search(&self, q: &SearchRequest) -> Result<Vec<SearchHit>, SearchError> {
        let conn = self.lock()?;
        query::search(&conn, self.trigram_ok, q)
    }

    /// Drop every row for one conversation so a re-ingest cannot leave stale
    /// `message_ref`s behind. FTS content triggers follow the delete.
    pub fn delete_conversation(&self, conversation_id: i32) -> Result<(), SearchError> {
        let conn = self.lock()?;
        conn.execute(
            "DELETE FROM doc WHERE conversation_id = ?1",
            [conversation_id],
        )?;
        Ok(())
    }

    /// Newest `indexed_at` for this conversation, if any row exists.
    pub fn max_indexed_at(&self, conversation_id: i32) -> Result<Option<i64>, SearchError> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT MAX(indexed_at) FROM doc WHERE conversation_id = ?1",
            [conversation_id],
            |row| row.get(0),
        )
        .map_err(SearchError::from)
    }

    /// A message row other than the title stub (`message_ref = "title"`).
    pub fn has_body_doc(&self, conversation_id: i32) -> Result<bool, SearchError> {
        let conn = self.lock()?;
        let found: i64 = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM doc WHERE conversation_id = ?1 AND message_ref != 'title')",
            [conversation_id],
            |row| row.get(0),
        )?;
        Ok(found != 0)
    }

    /// Parser gave up on this conversation (`source_path = "ingest-skip"`).
    pub fn is_ingest_skip(&self, conversation_id: i32) -> Result<bool, SearchError> {
        let conn = self.lock()?;
        let found: i64 = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM doc WHERE conversation_id = ?1 AND source_path = 'ingest-skip')",
            [conversation_id],
            |row| row.get(0),
        )?;
        Ok(found != 0)
    }

    /// Drop indexed docs in the queried folders whose conversation is not in
    /// `live_ids`. `folder_ids == None` means every folder. When `agent` is
    /// set, only that agent's rows are eligible — an agent-filtered live set
    /// must not GC other agents. An empty live set deletes nothing.
    pub fn retain_in_folders(
        &self,
        folder_ids: Option<&[i32]>,
        live_ids: &[i32],
        agent: Option<&str>,
    ) -> Result<(), SearchError> {
        if live_ids.is_empty() {
            return Ok(());
        }
        let agent = agent.filter(|name| !name.is_empty());
        let mut conn = self.lock()?;
        conn.execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS search_retain_live (id INTEGER PRIMARY KEY);",
        )?;
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM search_retain_live", [])?;
        for chunk in live_ids.chunks(SQL_VAR_CHUNK) {
            insert_id_chunk(
                &tx,
                "INSERT OR IGNORE INTO search_retain_live (id) VALUES ",
                chunk,
            )?;
        }
        match folder_ids {
            None => delete_not_in_live(&tx, None, agent)?,
            Some([]) => {}
            Some(folders) => {
                for chunk in folders.chunks(SQL_VAR_CHUNK) {
                    delete_not_in_live(&tx, Some(chunk), agent)?;
                }
            }
        }
        tx.commit()?;
        Ok(())
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, SearchError> {
        self.conn.lock().map_err(|_| SearchError::Poisoned)
    }

    #[cfg(test)]
    fn trigram_match_count(&self, text: &str) -> Result<i64, SearchError> {
        let conn = self.lock()?;
        let phrase = query::fts_phrase(text);
        conn.query_row(
            "SELECT count(*) FROM doc_fts_tri WHERE doc_fts_tri MATCH ?1",
            [phrase],
            |row| row.get(0),
        )
        .map_err(SearchError::from)
    }
}

fn insert_id_chunk(conn: &Connection, prefix: &str, ids: &[i32]) -> Result<(), SearchError> {
    let mut sql = String::with_capacity(prefix.len() + ids.len() * 4);
    sql.push_str(prefix);
    for i in 0..ids.len() {
        if i > 0 {
            sql.push(',');
        }
        sql.push_str("(?)");
    }
    conn.execute(&sql, params_from_iter(ids.iter().copied()))?;
    Ok(())
}

fn push_placeholders(sql: &mut String, n: usize) {
    for i in 0..n {
        if i > 0 {
            sql.push(',');
        }
        sql.push('?');
    }
}

fn delete_not_in_live(
    conn: &Connection,
    folders: Option<&[i32]>,
    agent: Option<&str>,
) -> Result<(), SearchError> {
    let mut sql = String::from("DELETE FROM doc WHERE ");
    let mut params: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(folders) = folders {
        sql.push_str("folder_id IN (");
        push_placeholders(&mut sql, folders.len());
        sql.push_str(") AND ");
        for id in folders {
            params.push(rusqlite::types::Value::Integer(i64::from(*id)));
        }
    }
    sql.push_str("conversation_id NOT IN (SELECT id FROM search_retain_live)");
    if let Some(agent) = agent {
        sql.push_str(" AND agent = ?");
        params.push(rusqlite::types::Value::Text(agent.to_string()));
    }
    conn.execute(&sql, params_from_iter(params))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ContentBlock;

    fn open_idx() -> (tempfile::TempDir, SearchIndex) {
        let dir = tempfile::tempdir().expect("tempdir");
        let idx = SearchIndex::open(&dir.path().join("search.db")).expect("open search.db");
        (dir, idx)
    }

    fn doc(id: i32, folder: i32, body: &str) -> SearchDoc {
        SearchDoc {
            conversation_id: id,
            folder_id: folder,
            agent: "cursor".into(),
            message_ref: format!("m{id}"),
            title: None,
            body: body.into(),
            source_path: None,
            source_mtime: None,
        }
    }

    fn req(text: &str, folders: Option<Vec<i32>>, prefer_trigram: bool) -> SearchRequest {
        SearchRequest {
            text: text.into(),
            folder_ids: folders,
            agent: None,
            after_unix: None,
            limit: 30,
            prefer_trigram,
        }
    }

    #[test]
    fn search_index_econnreset_returns_conversation() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("search.db");
        let secret = format!("sk-{}", "a".repeat(24));
        {
            let idx = SearchIndex::open(&path).expect("open");
            idx.upsert_docs(&[SearchDoc {
                conversation_id: 42,
                folder_id: 1,
                agent: "cursor".into(),
                message_ref: "m1".into(),
                title: Some("net".into()),
                body: format!("dial failed: ECONNRESET {secret}"),
                source_path: None,
                source_mtime: None,
            }])
            .expect("upsert");
        }
        let idx = SearchIndex::open(&path).expect("reopen");
        let hits = idx.search(&req("ECONNRESET", None, false)).expect("search");
        assert!(
            hits.iter()
                .any(|h| h.conversation_id == 42 && h.source == "body"),
            "{hits:?}"
        );
        assert!(hits.iter().any(|h| h.snippet.contains("ECONNRESET")));
        let leaked = idx
            .search(&req(&"a".repeat(24), None, false))
            .expect("secret search");
        assert!(leaked.is_empty(), "secret must not be indexed: {leaked:?}");
    }

    #[test]
    fn search_index_strip_secrets_removes_prefixed_tail() {
        let tail = "a".repeat(24);
        let raw = format!("keep sk-{tail} end ECONNRESET");
        let cleaned = strip_secrets(&raw);
        assert!(!cleaned.contains("sk-"), "{cleaned}");
        assert!(!cleaned.contains(&tail), "{cleaned}");
        assert!(cleaned.contains("keep") && cleaned.contains("end"));
        assert!(cleaned.contains("ECONNRESET"));

        let bare = "B".repeat(24);
        let cleaned_bare = strip_secrets(&format!("x {bare} y"));
        assert!(!cleaned_bare.contains('B'), "{cleaned_bare}");
        assert!(cleaned_bare.contains('x') && cleaned_bare.contains('y'));

        assert_eq!(strip_secrets("ghp_short"), "");
        assert_eq!(strip_secrets("xai-key"), "");
        assert_eq!(strip_secrets("skill"), "skill");
        assert_eq!(strip_secrets(&format!("你好{bare}世界")), "你好世界");
    }

    #[test]
    fn search_index_extract_text_blocks_only_text_capped() {
        let big = format!("{}TAIL", "a".repeat(8192));
        let mut boundary = "b".repeat(8191);
        boundary.push('世');
        boundary.push('Z');
        let got = extract_text_blocks(&[
            ContentBlock::Image {
                data: "zzz".into(),
                mime_type: "image/png".into(),
                uri: None,
            },
            ContentBlock::Text { text: big },
            ContentBlock::Text {
                text: "second".into(),
            },
            ContentBlock::Text {
                text: String::new(),
            },
            ContentBlock::Text { text: boundary },
        ]);
        assert!(!got.contains("TAIL"));
        assert!(!got.contains("zzz"));
        assert!(got.contains("second"));
        assert!(!got.contains('Z'));
        assert!(got.is_char_boundary(got.len()));
        let first = got.split('\n').next().expect("block");
        assert_eq!(first.len(), 8192);
    }

    #[test]
    fn search_index_han_substring_matches() {
        let (_dir, idx) = open_idx();
        idx.upsert_docs(&[doc(7, 3, "你好世界")]).expect("upsert");
        let hits = idx.search(&req("世界", None, true)).expect("search");
        assert!(
            hits.iter().any(|h| h.conversation_id == 7),
            "trigram_available={} hits={hits:?}",
            idx.trigram_available()
        );
        eprintln!("trigram_available={}", idx.trigram_available());
        if idx.trigram_available() {
            let short = idx.trigram_match_count("世界").expect("tri short");
            let long = idx.trigram_match_count("你好世").expect("tri long");
            eprintln!("trigram_match 世界={short} 你好世={long}");
            assert_eq!(long, 1, "3-char Han must hit doc_fts_tri");
        }
    }

    #[test]
    fn search_index_folder_ids_excludes_other_folders() {
        let (_dir, idx) = open_idx();
        idx.upsert_docs(&[doc(10, 1, "boom ECONNRESET"), doc(11, 2, "boom ECONNRESET")])
            .expect("upsert");
        let only1 = idx
            .search(&req("ECONNRESET", Some(vec![1]), false))
            .expect("f1");
        assert_eq!(
            only1.iter().map(|h| h.conversation_id).collect::<Vec<_>>(),
            vec![10]
        );
        let only2 = idx
            .search(&req("ECONNRESET", Some(vec![2]), false))
            .expect("f2");
        assert_eq!(
            only2.iter().map(|h| h.conversation_id).collect::<Vec<_>>(),
            vec![11]
        );
        let none = idx
            .search(&req("ECONNRESET", Some(vec![]), false))
            .expect("empty folders");
        assert!(none.is_empty());
        let all = idx.search(&req("ECONNRESET", None, false)).expect("all");
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn search_index_after_unix_filters_source_mtime_not_indexed_at() {
        let (_dir, idx) = open_idx();
        let mut older = doc(1, 1, "ECONNRESET older");
        older.source_mtime = Some(1_000);
        let mut newer = doc(2, 1, "ECONNRESET newer");
        newer.source_mtime = Some(5_000);
        idx.upsert_docs(&[older, newer]).expect("upsert");
        let mut q = req("ECONNRESET", None, false);
        q.after_unix = Some(1_500);
        let hits = idx.search(&q).expect("search");
        let ids: Vec<_> = hits.iter().map(|h| h.conversation_id).collect();
        assert_eq!(
            ids,
            vec![2],
            "after must use source_mtime, not indexed_at: {hits:?}"
        );
    }

    #[test]
    fn search_index_refuses_live_codeg_path() {
        let err = SearchIndex::open(Path::new("/tmp/not-real/.local/share/codeg/codeg.db"))
            .expect_err("live path");
        assert!(matches!(err, SearchError::LiveDb), "{err:?}");
    }

    #[test]
    fn search_index_retain_in_folders_drops_absent_ids_only() {
        let (_dir, idx) = open_idx();
        idx.upsert_docs(&[
            doc(1, 1, "ECONNRESET live"),
            doc(2, 1, "ECONNRESET gone"),
            doc(3, 2, "ECONNRESET otherfolder"),
        ])
        .expect("upsert");
        idx.retain_in_folders(Some(&[1]), &[1], None)
            .expect("retain folder");
        let hits = idx.search(&req("ECONNRESET", None, false)).expect("search");
        let mut ids: Vec<_> = hits.iter().map(|h| h.conversation_id).collect();
        ids.sort();
        assert_eq!(ids, vec![1, 3], "{hits:?}");

        idx.retain_in_folders(None, &[], None).expect("empty live");
        let still = idx.search(&req("ECONNRESET", None, false)).expect("still");
        assert_eq!(still.len(), 2, "empty live set must not delete: {still:?}");

        idx.retain_in_folders(None, &[1], None).expect("in:all");
        let left = idx.search(&req("ECONNRESET", None, false)).expect("left");
        let mut left_ids: Vec<_> = left.iter().map(|h| h.conversation_id).collect();
        left_ids.sort();
        assert_eq!(left_ids, vec![1], "{left:?}");
    }
}
