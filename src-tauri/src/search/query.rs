use rusqlite::types::Value;
use rusqlite::{params_from_iter, Connection, Row};

use super::{SearchError, SearchHit, SearchRequest};

const SNIPPET_CHARS: usize = 160;

pub(crate) fn fts_phrase(text: &str) -> String {
    let escaped = text.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

pub(crate) fn search(
    conn: &Connection,
    trigram_ok: bool,
    q: &SearchRequest,
) -> Result<Vec<SearchHit>, SearchError> {
    let text = q.text.trim();
    if text.is_empty() {
        return Ok(Vec::new());
    }
    if q.folder_ids.as_ref().is_some_and(|ids| ids.is_empty()) {
        return Ok(Vec::new());
    }
    let limit = if q.limit <= 0 { 30 } else { q.limit };
    let han = contains_han(text);
    let want_tri = q.prefer_trigram || han;
    if want_tri {
        // Trigram tokens are 3 characters. A 2-char Han query such as 世界
        // does not MATCH; LIKE stays on this database.
        let long_enough = text.chars().count() >= 3;
        if trigram_ok && long_enough {
            match search_fts(conn, "doc_fts_tri", text, q, limit) {
                Ok(hits) => return Ok(hits),
                Err(SearchError::Sqlite(_)) => return search_like(conn, text, q, limit),
                Err(err) => return Err(err),
            }
        }
        return search_like(conn, text, q, limit);
    }
    search_fts(conn, "doc_fts", text, q, limit)
}

fn search_fts(
    conn: &Connection,
    table: &str,
    text: &str,
    q: &SearchRequest,
    limit: i32,
) -> Result<Vec<SearchHit>, SearchError> {
    let mut sql = format!(
        "SELECT d.conversation_id, d.folder_id, d.agent, d.title, d.body, d.message_ref, \
         snippet({table}, 1, '', '', '...', 24) \
         FROM {table} JOIN doc d ON d.id = {table}.rowid \
         WHERE {table} MATCH ?"
    );
    let mut params = vec![Value::Text(fts_phrase(text))];
    push_filters(&mut sql, &mut params, q);
    sql.push_str(&format!(" ORDER BY bm25({table}) LIMIT ?"));
    params.push(Value::Integer(i64::from(limit)));
    collect(conn, &sql, params, text, true)
}

fn search_like(
    conn: &Connection,
    text: &str,
    q: &SearchRequest,
    limit: i32,
) -> Result<Vec<SearchHit>, SearchError> {
    let mut sql = String::from(
        "SELECT d.conversation_id, d.folder_id, d.agent, d.title, d.body, d.message_ref \
         FROM doc d \
         WHERE (d.body LIKE ? ESCAPE '\\' OR IFNULL(d.title, '') LIKE ? ESCAPE '\\')",
    );
    let pattern = Value::Text(like_pattern(text));
    let mut params = vec![pattern.clone(), pattern];
    push_filters(&mut sql, &mut params, q);
    sql.push_str(" ORDER BY d.indexed_at DESC LIMIT ?");
    params.push(Value::Integer(i64::from(limit)));
    collect(conn, &sql, params, text, false)
}

fn push_filters(sql: &mut String, params: &mut Vec<Value>, q: &SearchRequest) {
    if let Some(ids) = &q.folder_ids {
        sql.push_str(" AND d.folder_id IN (");
        for (i, id) in ids.iter().enumerate() {
            if i > 0 {
                sql.push(',');
            }
            sql.push('?');
            params.push(Value::Integer(i64::from(*id)));
        }
        sql.push(')');
    }
    if let Some(agent) = q.agent.as_deref().filter(|agent| !agent.is_empty()) {
        sql.push_str(" AND d.agent = ?");
        params.push(Value::Text(agent.to_string()));
    }
    if let Some(after) = q.after_unix {
        // Conversation `updated_at` is stored in `source_mtime`. `indexed_at`
        // is only when this row was written, so it must not satisfy `after:`.
        sql.push_str(" AND d.source_mtime >= ?");
        params.push(Value::Integer(after));
    }
}

fn collect(
    conn: &Connection,
    sql: &str,
    params: Vec<Value>,
    query: &str,
    has_snippet: bool,
) -> Result<Vec<SearchHit>, SearchError> {
    let mut stmt = conn.prepare(sql)?;
    let mut rows = stmt.query(params_from_iter(params.iter()))?;
    let mut hits = Vec::new();
    while let Some(row) = rows.next()? {
        hits.push(hit_from_row(row, query, has_snippet)?);
    }
    Ok(hits)
}

fn hit_from_row(row: &Row<'_>, query: &str, has_snippet: bool) -> Result<SearchHit, SearchError> {
    let conversation_id: i32 = row.get(0)?;
    let folder_id: i32 = row.get(1)?;
    let agent: String = row.get(2)?;
    let title: Option<String> = row.get(3)?;
    let body: String = row.get(4)?;
    let message_ref: String = row.get(5)?;
    let fts_snippet: Option<String> = if has_snippet { row.get(6)? } else { None };
    let source = if title.as_deref().is_some_and(|t| contains_ci(t, query)) {
        "title"
    } else {
        "body"
    };
    let chosen = if source == "title" {
        title.as_deref().unwrap_or("")
    } else {
        body.as_str()
    };
    let snippet = window_snippet(chosen, query, SNIPPET_CHARS)
        .or_else(|| {
            fts_snippet
                .filter(|_| source == "body")
                .map(|s| truncate_chars(&s, SNIPPET_CHARS))
        })
        .unwrap_or_else(|| truncate_chars(chosen, SNIPPET_CHARS));
    Ok(SearchHit {
        conversation_id,
        folder_id,
        agent,
        title,
        snippet,
        message_ref,
        source,
    })
}

fn like_pattern(q: &str) -> String {
    let mut out = String::from("%");
    for c in q.chars() {
        if c == '\\' || c == '%' || c == '_' {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('%');
    out
}

fn contains_han(s: &str) -> bool {
    s.chars().any(is_han)
}

fn is_han(c: char) -> bool {
    matches!(
        c as u32,
        0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0x20000..=0x2A6DF
            | 0x2A700..=0x2B73F
            | 0x2B740..=0x2B81F
            | 0x2B820..=0x2CEAF
            | 0x2CEB0..=0x2EBEF
            | 0x2F800..=0x2FA1F
            | 0x30000..=0x3134F
            | 0x31350..=0x323AF
    )
}

fn contains_ci(hay: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return false;
    }
    hay.to_lowercase().contains(&needle.to_lowercase())
}

fn window_snippet(hay: &str, needle: &str, max_chars: usize) -> Option<String> {
    if needle.is_empty() || max_chars == 0 {
        return None;
    }
    let hay_l = hay.to_lowercase();
    let needle_l = needle.to_lowercase();
    if hay_l.len() != hay.len() {
        return hay_l
            .find(&needle_l)
            .map(|_| truncate_chars(hay, max_chars));
    }
    let byte = hay_l.find(&needle_l)?;
    let chars: Vec<char> = hay.chars().collect();
    let mut acc = 0usize;
    let mut char_at = 0usize;
    for (i, ch) in chars.iter().enumerate() {
        if acc >= byte {
            char_at = i;
            break;
        }
        acc += ch.len_utf8();
        char_at = i;
    }
    let needle_chars = needle.chars().count().max(1);
    let half = max_chars.saturating_sub(needle_chars) / 2;
    let from = char_at.saturating_sub(half);
    let to = (from + max_chars).min(chars.len());
    let from = to.saturating_sub(max_chars);
    Some(chars[from..to].iter().collect())
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        s.chars().take(max_chars).collect()
    }
}
