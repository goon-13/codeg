use rusqlite::{params, Connection};

use crate::models::ContentBlock;

use super::{SearchDoc, SearchError};

const TEXT_BLOCK_CAP: usize = 8 * 1024;

pub fn strip_secrets(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if !is_token_byte(bytes[i]) {
            let ch = s[i..].chars().next().expect("i is a char boundary");
            out.push(ch);
            i += ch.len_utf8();
            continue;
        }
        let start = i;
        while i < bytes.len() && is_token_byte(bytes[i]) {
            i += 1;
        }
        let token = &s[start..i];
        if !is_secret(token) {
            out.push_str(token);
        }
    }
    out
}

fn is_token_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-'
}

fn is_secret(token: &str) -> bool {
    token.len() >= 24
        || token.starts_with("sk-")
        || token.starts_with("ghp_")
        || token.starts_with("xai-")
}

pub fn extract_text_blocks(blocks: &[ContentBlock]) -> String {
    let mut out = String::new();
    for block in blocks {
        let ContentBlock::Text { text } = block else {
            continue;
        };
        let piece = truncate_utf8(text, TEXT_BLOCK_CAP);
        if piece.is_empty() {
            continue;
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&piece);
    }
    out
}

fn truncate_utf8(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

pub(crate) fn upsert(conn: &mut Connection, docs: &[SearchDoc]) -> Result<(), SearchError> {
    if docs.is_empty() {
        return Ok(());
    }
    let now = unix_secs();
    let tx = conn.transaction()?;
    for doc in docs {
        let body = strip_secrets(&doc.body);
        let title = doc.title.as_ref().map(|t| strip_secrets(t));
        tx.execute(
            "INSERT INTO doc (
                conversation_id, folder_id, agent, message_ref, title, body,
                source_path, source_mtime, indexed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(conversation_id, message_ref) DO UPDATE SET
                folder_id = excluded.folder_id,
                agent = excluded.agent,
                title = excluded.title,
                body = excluded.body,
                source_path = excluded.source_path,
                source_mtime = excluded.source_mtime,
                indexed_at = excluded.indexed_at",
            params![
                doc.conversation_id,
                doc.folder_id,
                doc.agent,
                doc.message_ref,
                title,
                body,
                doc.source_path,
                doc.source_mtime,
                now,
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

fn unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}
