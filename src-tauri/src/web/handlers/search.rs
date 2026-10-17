//! `POST /api/search_corpus`. Index lives at `$CODEG_DATA_DIR/search.db`.

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use axum::{extract::Extension, Json};
use serde::{Deserialize, Serialize};

use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::models::{AgentType, ConversationDetail};
use crate::parsers::build_agent_parser;
use crate::search::{
    extract_text_blocks, SearchDoc, SearchError, SearchHit, SearchIndex, SearchRequest,
};

const INGEST_BUDGET: Duration = Duration::from_secs(2);
const TITLE_REF: &str = "title";
static SEARCH_INDEX: OnceLock<SearchIndex> = OnceLock::new();

#[derive(Debug, Clone)]
pub(crate) struct IngestRow {
    pub id: i32,
    pub folder_id: i32,
    pub agent: String,
    pub title: Option<String>,
    pub external_id: Option<String>,
    pub updated_at_unix: i64,
}

#[derive(Debug, Clone)]
pub(crate) struct CorpusQuery {
    pub query: String,
    pub folder_ids: Option<Vec<i32>>,
    pub agent: Option<String>,
    pub after_unix: Option<i64>,
    pub limit: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CorpusHit {
    pub conversation_id: i32,
    pub folder_id: i32,
    pub agent_type: String,
    pub title: Option<String>,
    pub snippet: String,
    pub message_ref: String,
    pub source: String,
}

#[derive(Debug, Serialize)]
pub struct SearchCorpusResponse {
    pub hits: Vec<CorpusHit>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchCorpusParams {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub folder_ids: Option<Vec<i32>>,
    #[serde(default)]
    pub agent_type: Option<String>,
    #[serde(default)]
    pub after: Option<String>,
    #[serde(default)]
    pub limit: Option<i32>,
}

pub async fn search_corpus(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<SearchCorpusParams>,
) -> Result<Json<SearchCorpusResponse>, AppCommandError> {
    let rows = load_rows(&state.db.conn, &params.folder_ids, &params.agent_type).await?;
    let query = corpus_query_from(&params);
    let data_dir = state.data_dir.clone();
    let hits = tokio::task::spawn_blocking(move || {
        let index = open_lazy(&data_dir).map_err(index_error)?;
        ingest_and_search(index, &rows, &query, load_parser_detail).map_err(index_error)
    })
    .await
    .map_err(|err| AppCommandError::task_execution_failed(err.to_string()))??;
    Ok(Json(SearchCorpusResponse { hits }))
}

fn index_error(err: SearchError) -> AppCommandError {
    AppCommandError::database_error(format!("search index: {err}"))
}

fn open_lazy(data_dir: &Path) -> Result<&'static SearchIndex, SearchError> {
    if let Some(index) = SEARCH_INDEX.get() {
        return Ok(index);
    }
    let opened = SearchIndex::open(&data_dir.join("search.db"))?;
    let _ = SEARCH_INDEX.set(opened);
    SEARCH_INDEX.get().ok_or(SearchError::Poisoned)
}

fn corpus_query_from(params: &SearchCorpusParams) -> CorpusQuery {
    CorpusQuery {
        query: params.query.clone(),
        folder_ids: params.folder_ids.clone(),
        agent: params.agent_type.clone().filter(|agent| !agent.is_empty()),
        after_unix: params.after.as_deref().and_then(parse_after_unix),
        limit: params.limit.unwrap_or(30),
    }
}

fn parse_after_unix(after: &str) -> Option<i64> {
    let date = chrono::NaiveDate::parse_from_str(after.trim(), "%Y-%m-%d").ok()?;
    Some(date.and_hms_opt(0, 0, 0)?.and_utc().timestamp())
}

async fn load_rows(
    conn: &sea_orm::DatabaseConnection,
    folder_ids: &Option<Vec<i32>>,
    agent: &Option<String>,
) -> Result<Vec<IngestRow>, AppCommandError> {
    use crate::db::entities::{conversation, folder};
    use crate::db::error::DbError;
    use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};

    if folder_ids.as_ref().is_some_and(|ids| ids.is_empty()) {
        return Ok(Vec::new());
    }

    let mut query = conversation::Entity::find()
        .filter(conversation::Column::DeletedAt.is_null())
        .filter(conversation::Column::Kind.ne(conversation::ConversationKind::Loop))
        .filter(conversation::Column::ParentId.is_null());

    match folder_ids {
        Some(ids) => {
            query = query.filter(conversation::Column::FolderId.is_in(ids.clone()));
        }
        None => {
            let active: Vec<i32> = folder::Entity::find()
                .filter(folder::Column::DeletedAt.is_null())
                .all(conn)
                .await
                .map_err(DbError::from)?
                .into_iter()
                .map(|row| row.id)
                .collect();
            if active.is_empty() {
                return Ok(Vec::new());
            }
            query = query.filter(conversation::Column::FolderId.is_in(active));
        }
    }

    if let Some(agent) = agent.as_deref().filter(|agent| !agent.is_empty()) {
        query = query.filter(conversation::Column::AgentType.eq(agent));
    }

    let rows = query
        .order_by_desc(conversation::Column::UpdatedAt)
        .all(conn)
        .await
        .map_err(DbError::from)?;
    Ok(rows
        .into_iter()
        .map(|row| IngestRow {
            id: row.id,
            folder_id: row.folder_id,
            agent: row.agent_type,
            title: row.title,
            external_id: row.external_id,
            updated_at_unix: row.updated_at.timestamp(),
        })
        .collect())
}

fn load_parser_detail(row: &IngestRow) -> Result<ConversationDetail, String> {
    let external_id = row
        .external_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "missing external id".to_string())?;
    let agent =
        AgentType::from_wire(&row.agent).ok_or_else(|| format!("unknown agent {}", row.agent))?;
    build_agent_parser(agent)
        .get_conversation(external_id)
        .map_err(|err| err.to_string())
}

pub(crate) fn ingest_and_search<F>(
    index: &SearchIndex,
    rows: &[IngestRow],
    query: &CorpusQuery,
    load: F,
) -> Result<Vec<CorpusHit>, SearchError>
where
    F: FnMut(&IngestRow) -> Result<ConversationDetail, String>,
{
    ingest_and_search_budget(index, rows, query, INGEST_BUDGET, load)
}

fn ingest_and_search_budget<F>(
    index: &SearchIndex,
    rows: &[IngestRow],
    query: &CorpusQuery,
    body_budget: Duration,
    mut load: F,
) -> Result<Vec<CorpusHit>, SearchError>
where
    F: FnMut(&IngestRow) -> Result<ConversationDetail, String>,
{
    let mut stubs = Vec::new();
    for row in rows {
        if index.max_indexed_at(row.id)?.is_none() {
            stubs.push(title_only_doc(row));
        }
    }
    if !stubs.is_empty() {
        index.upsert_docs(&stubs)?;
    }

    let started = Instant::now();
    for row in rows {
        if started.elapsed() >= body_budget {
            break;
        }
        if external_id_missing(row) {
            index.upsert_docs(&[title_only_doc(row)])?;
            continue;
        }
        if skip_body_parse(index, row)? {
            continue;
        }
        match load(row) {
            Ok(detail) => {
                index.delete_conversation(row.id)?;
                index.upsert_docs(&docs_from_detail(row, &detail))?;
            }
            Err(err) => {
                tracing::warn!(
                    conversation_id = row.id,
                    error = %err,
                    "search corpus ingest skipped"
                );
                index.upsert_docs(&[title_skip_doc(row)])?;
            }
        }
    }
    let live_ids: Vec<i32> = rows.iter().map(|row| row.id).collect();
    // No rows in this request: do not wipe the index, and do not leak leftovers.
    if live_ids.is_empty() {
        return Ok(Vec::new());
    }
    index.retain_in_folders(
        query.folder_ids.as_deref(),
        &live_ids,
        query.agent.as_deref(),
    )?;
    let hits = index.search(&SearchRequest {
        text: query.query.clone(),
        folder_ids: query.folder_ids.clone(),
        agent: query.agent.clone(),
        after_unix: query.after_unix,
        limit: query.limit,
        prefer_trigram: false,
    })?;
    let live: HashSet<i32> = live_ids.iter().copied().collect();
    Ok(hits
        .into_iter()
        .filter(|hit| live.contains(&hit.conversation_id))
        .map(hit_to_corpus)
        .collect())
}

fn external_id_missing(row: &IngestRow) -> bool {
    row.external_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .is_none()
}

fn skip_body_parse(index: &SearchIndex, row: &IngestRow) -> Result<bool, SearchError> {
    let Some(indexed_at) = index.max_indexed_at(row.id)? else {
        return Ok(false);
    };
    if indexed_at < row.updated_at_unix {
        return Ok(false);
    }
    // A title stub sets indexed_at to now, which is usually >= updated_at.
    // That must not block the body pass. Skip only a real body row, or a
    // parser failure marked ingest-skip (no body row required).
    Ok(index.is_ingest_skip(row.id)? || index.has_body_doc(row.id)?)
}

fn title_only_doc(row: &IngestRow) -> SearchDoc {
    search_doc(row, TITLE_REF.to_string(), String::new(), None)
}

fn title_skip_doc(row: &IngestRow) -> SearchDoc {
    search_doc(
        row,
        TITLE_REF.to_string(),
        String::new(),
        Some("ingest-skip".into()),
    )
}

fn docs_from_detail(row: &IngestRow, detail: &ConversationDetail) -> Vec<SearchDoc> {
    let mut docs = Vec::new();
    for (i, turn) in detail.turns.iter().enumerate() {
        let body = extract_text_blocks(&turn.blocks);
        if body.is_empty() {
            continue;
        }
        let message_ref = if turn.id.is_empty() {
            format!("turn-{i}")
        } else {
            turn.id.clone()
        };
        docs.push(search_doc(row, message_ref, body, None));
    }
    if docs.is_empty() {
        docs.push(title_only_doc(row));
    }
    docs
}

fn search_doc(
    row: &IngestRow,
    message_ref: String,
    body: String,
    source_path: Option<String>,
) -> SearchDoc {
    SearchDoc {
        conversation_id: row.id,
        folder_id: row.folder_id,
        agent: row.agent.clone(),
        message_ref,
        title: row.title.clone(),
        body,
        source_path,
        source_mtime: Some(row.updated_at_unix),
    }
}

fn hit_to_corpus(hit: SearchHit) -> CorpusHit {
    CorpusHit {
        conversation_id: hit.conversation_id,
        folder_id: hit.folder_id,
        agent_type: hit.agent,
        title: hit.title,
        snippet: hit.snippet,
        message_ref: hit.message_ref,
        source: hit.source.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        AgentType, ContentBlock, ConversationDetail, ConversationSummary, MessageTurn, TurnRole,
    };
    use crate::search::{SearchDoc, SearchIndex, SearchRequest};

    fn detail_with(turns: Vec<MessageTurn>) -> ConversationDetail {
        let now = chrono::Utc::now();
        ConversationDetail {
            summary: ConversationSummary {
                id: "ext".into(),
                agent_type: AgentType::Cursor,
                folder_path: None,
                folder_name: None,
                title: Some("net".into()),
                started_at: now,
                ended_at: None,
                message_count: turns.len() as u32,
                model: None,
                git_branch: None,
                parent_id: None,
                parent_tool_use_id: None,
                delegation_call_id: None,
            },
            turns,
            session_stats: None,
            transcript_watermark: None,
        }
    }

    fn turn(id: &str, text: &str) -> MessageTurn {
        MessageTurn {
            id: id.into(),
            role: TurnRole::Assistant,
            blocks: vec![ContentBlock::Text { text: text.into() }],
            timestamp: chrono::Utc::now(),
            usage: None,
            duration_ms: None,
            model: None,
            completed_at: None,
            agent_message_id: None,
        }
    }

    fn row(id: i32, updated_at_unix: i64) -> IngestRow {
        IngestRow {
            id,
            folder_id: 1,
            agent: "cursor".into(),
            title: Some("net".into()),
            external_id: Some(format!("ext-{id}")),
            updated_at_unix,
        }
    }

    fn query(text: &str) -> CorpusQuery {
        CorpusQuery {
            query: text.into(),
            folder_ids: None,
            agent: None,
            after_unix: None,
            limit: 30,
        }
    }

    #[test]
    fn search_corpus_title_pass_covers_rows_when_body_budget_is_zero() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        let mut aa = row(11, 1_700_000_000);
        aa.title = Some("UniqueTitleAA".into());
        let mut bb = row(12, 1_700_000_000);
        bb.title = Some("UniqueTitleBB".into());
        let hits = ingest_and_search_budget(
            &index,
            &[aa.clone(), bb.clone()],
            &query("UniqueTitleAA"),
            std::time::Duration::ZERO,
            |_| panic!("zero body budget must not call the parser"),
        )
        .expect("title pass");
        assert!(
            hits.iter()
                .any(|h| h.conversation_id == 11 && h.source == "title"),
            "{hits:?}"
        );
        let bb_hits = index.search(&search_req("UniqueTitleBB")).expect("bb");
        assert!(
            bb_hits.iter().any(|h| h.conversation_id == 12),
            "title pass must cover every live row: {bb_hits:?}"
        );

        let calls = std::cell::Cell::new(0);
        let hits = ingest_and_search(&index, &[aa, bb], &query("ECONNRESET"), |_| {
            calls.set(calls.get() + 1);
            Ok(detail_with(vec![turn("m1", "dial failed: ECONNRESET")]))
        })
        .expect("body after title stub");
        assert!(calls.get() >= 1, "title stub must not skip the body pass");
        assert!(
            hits.iter()
                .any(|h| h.source == "body" && h.snippet.contains("ECONNRESET")),
            "{hits:?}"
        );
    }

    #[test]
    fn search_corpus_ingests_econnreset_body() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        let hits = ingest_and_search(
            &index,
            &[row(42, 1_800_000_000)],
            &query("ECONNRESET"),
            |_| Ok(detail_with(vec![turn("m1", "dial failed: ECONNRESET")])),
        )
        .expect("search");
        assert!(
            hits.iter().any(|h| {
                h.conversation_id == 42 && h.source == "body" && h.snippet.contains("ECONNRESET")
            }),
            "{hits:?}"
        );
    }

    #[test]
    fn search_corpus_drops_stale_message_ref_on_reingest() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        ingest_and_search(&index, &[row(7, 1)], &query("ECONNRESET"), |_| {
            Ok(detail_with(vec![
                turn("m1", "ECONNRESET keep"),
                turn("m2", "ECONNRESET STALEWORD"),
            ]))
        })
        .expect("first");
        let hits = ingest_and_search(&index, &[row(7, i64::MAX)], &query("ECONNRESET"), |_| {
            Ok(detail_with(vec![turn("m1", "ECONNRESET keep")]))
        })
        .expect("second");
        assert_eq!(hits.len(), 1, "{hits:?}");
        assert!(
            hits.iter().all(|h| !h.snippet.contains("STALEWORD")),
            "{hits:?}"
        );
    }

    #[test]
    fn search_corpus_skips_when_indexed_at_covers_updated_at() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        let calls = std::cell::Cell::new(0);
        let load = || {
            let n = calls.get();
            calls.set(n + 1);
            detail_with(vec![turn(
                "m1",
                if n == 0 {
                    "ECONNRESET first"
                } else {
                    "ECONNRESET SECOND"
                },
            )])
        };
        ingest_and_search(
            &index,
            &[row(3, 1_700_000_000)],
            &query("ECONNRESET"),
            |_| Ok(load()),
        )
        .expect("first");
        let hits = ingest_and_search(
            &index,
            &[row(3, 1_700_000_000)],
            &query("ECONNRESET"),
            |_| Ok(load()),
        )
        .expect("second");
        assert_eq!(calls.get(), 1, "second ingest must not call the parser");
        assert!(
            hits.iter().all(|h| !h.snippet.contains("SECOND")),
            "{hits:?}"
        );
    }

    #[test]
    fn search_corpus_parser_error_skips_that_conversation() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        let mut bad = row(1, 1_800_000_000);
        bad.external_id = Some("missing".into());
        let good = row(2, 1_800_000_000);
        let hits = ingest_and_search(&index, &[bad, good], &query("ECONNRESET"), |row| {
            if row.id == 1 {
                Err("parser down".into())
            } else {
                Ok(detail_with(vec![turn("m1", "dial failed: ECONNRESET")]))
            }
        })
        .expect("fail-open");
        assert!(hits.iter().any(|h| h.conversation_id == 2), "{hits:?}");
        assert!(hits.iter().all(|h| h.conversation_id != 1));
    }

    #[test]
    fn search_corpus_skips_rows_without_external_id() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        let mut bare = row(5, 1_800_000_000);
        bare.external_id = None;
        bare.title = Some("UniqueTitleZZ".into());
        let calls = std::cell::Cell::new(0);
        let hits = ingest_and_search(&index, &[bare], &query("UniqueTitleZZ"), |_| {
            calls.set(calls.get() + 1);
            Ok(detail_with(vec![turn("m1", "UniqueTitleZZ")]))
        })
        .expect("search");
        assert_eq!(calls.get(), 0);
        assert!(
            hits.iter()
                .any(|h| h.conversation_id == 5 && h.source == "title"),
            "title-only doc must be searchable: {hits:?}"
        );
    }

    #[test]
    fn search_corpus_drops_indexed_rows_absent_from_request() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        index
            .upsert_docs(&[SearchDoc {
                conversation_id: 99,
                folder_id: 1,
                agent: "cursor".into(),
                message_ref: "m99".into(),
                title: Some("ghost".into()),
                body: "ECONNRESET GHOSTTOKEN".into(),
                source_path: None,
                source_mtime: Some(1),
            }])
            .expect("seed ghost");
        let hits = ingest_and_search(
            &index,
            &[row(42, 1_700_000_000)],
            &query("ECONNRESET"),
            |_| Ok(detail_with(vec![turn("m1", "dial failed: ECONNRESET")])),
        )
        .expect("search");
        assert!(hits.iter().any(|h| h.conversation_id == 42), "{hits:?}");
        assert!(
            hits.iter().all(|h| h.conversation_id != 99),
            "absent id must not be returned: {hits:?}"
        );
        let leftover = index.search(&search_req("GHOSTTOKEN")).expect("leftover");
        assert!(
            leftover.is_empty(),
            "retain must delete the absent conversation: {leftover:?}"
        );

        index
            .upsert_docs(&[SearchDoc {
                conversation_id: 99,
                folder_id: 1,
                agent: "cursor".into(),
                message_ref: "m99".into(),
                title: Some("ghost".into()),
                body: "ECONNRESET GHOSTTOKEN".into(),
                source_path: None,
                source_mtime: Some(1),
            }])
            .expect("reseed");
        let empty = ingest_and_search(&index, &[], &query("GHOSTTOKEN"), |_| {
            panic!("empty rows must not load a parser")
        })
        .expect("empty live");
        assert!(empty.is_empty(), "{empty:?}");
        let kept = index.search(&search_req("GHOSTTOKEN")).expect("kept");
        assert!(
            kept.iter().any(|h| h.conversation_id == 99),
            "empty live set must not delete: {kept:?}"
        );
    }

    #[test]
    fn search_corpus_parser_error_does_not_retry_same_updated_at() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        let calls = std::cell::Cell::new(0);
        let load = || {
            calls.set(calls.get() + 1);
            Err::<ConversationDetail, String>("parser down".into())
        };
        let updated = 1_700_000_000;
        ingest_and_search(&index, &[row(4, updated)], &query("nomatch"), |_| load())
            .expect("first");
        ingest_and_search(&index, &[row(4, updated)], &query("nomatch"), |_| load())
            .expect("second");
        assert_eq!(calls.get(), 1, "parser error must not be retried");
        let indexed = index.max_indexed_at(4).expect("indexed");
        assert!(
            indexed.is_some_and(|ts| ts >= updated),
            "title-only doc must cover updated_at, got {indexed:?}"
        );
    }

    #[test]
    fn search_corpus_agent_filter_retain_keeps_other_agents() {
        let dir = tempfile::tempdir().expect("tempdir");
        let index = SearchIndex::open(&dir.path().join("search.db")).expect("open");
        index
            .upsert_docs(&[
                SearchDoc {
                    conversation_id: 1,
                    folder_id: 1,
                    agent: "cursor".into(),
                    message_ref: "m1".into(),
                    title: None,
                    body: "CURSORONLY".into(),
                    source_path: None,
                    source_mtime: Some(1),
                },
                SearchDoc {
                    conversation_id: 2,
                    folder_id: 1,
                    agent: "claude_code".into(),
                    message_ref: "m2".into(),
                    title: None,
                    body: "CLAUDEONLY".into(),
                    source_path: None,
                    source_mtime: Some(1),
                },
            ])
            .expect("seed");
        let mut claude = row(2, 1);
        claude.agent = "claude_code".into();
        let detail = || Ok(detail_with(vec![turn("m2", "CLAUDEONLY")]));

        let mut in_folder = query("CLAUDEONLY");
        in_folder.agent = Some("claude_code".into());
        in_folder.folder_ids = Some(vec![1]);
        let hits =
            ingest_and_search(&index, &[claude.clone()], &in_folder, |_| detail()).expect("folder");
        assert!(hits.iter().any(|h| h.conversation_id == 2), "{hits:?}");
        let cursor = index.search(&search_req("CURSORONLY")).expect("cursor");
        assert!(
            cursor.iter().any(|h| h.conversation_id == 1),
            "folder agent retain deleted another agent: {cursor:?}"
        );

        let mut in_all = query("CLAUDEONLY");
        in_all.agent = Some("claude_code".into());
        let hits = ingest_and_search(&index, &[claude], &in_all, |_| detail()).expect("in:all");
        assert!(hits.iter().any(|h| h.conversation_id == 2), "{hits:?}");
        let cursor = index.search(&search_req("CURSORONLY")).expect("cursor all");
        assert!(
            cursor.iter().any(|h| h.conversation_id == 1),
            "in:all agent retain deleted another agent: {cursor:?}"
        );
    }

    fn search_req(text: &str) -> SearchRequest {
        SearchRequest {
            text: text.into(),
            folder_ids: None,
            agent: None,
            after_unix: None,
            limit: 30,
            prefer_trigram: false,
        }
    }
}
