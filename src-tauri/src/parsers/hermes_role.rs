//! Carry Hermes history across an in-place role switch.
//!
//! Each Hermes profile has its own `HERMES_HOME` / `state.db`. Custom
//! `hermes-*` agents read codeg's ACP-native jsonl, not that sqlite. Clearing
//! `external_id` (so the next connect is `session/new`) would otherwise empty
//! the transcript pane. The previous turns are copied under a stable
//! `codeg-conv-<id>` session in the *next* agent's ACP transcript, and
//! [`history_for_role`] still finds them after the new ACP session binds.

use chrono::{DateTime, Utc};
use std::path::{Path, PathBuf};

use crate::acp::registry::registry_id_for;
use crate::acp_transcript::{self, EntryKind, TranscriptEntry, TranscriptHeader};
use crate::models::agent::AgentType;
use crate::models::message::{ContentBlock, MessageTurn, TurnRole};
use crate::parsers::acp_native::AcpNativeParser;
use crate::parsers::hermes::{self, HermesParser};
use crate::parsers::{path_eq_for_matching, AgentParser};

const SEED_PREFIX: &str = "codeg-conv-";

pub fn seed_session_id(conversation_id: i32) -> String {
    format!("{SEED_PREFIX}{conversation_id}")
}

pub fn history_for_role(
    agent: AgentType,
    conversation_id: i32,
    external_id: Option<&str>,
    folder_path: Option<&str>,
    title: Option<&str>,
    created_at: DateTime<Utc>,
) -> Vec<MessageTurn> {
    history_for_role_in(
        &crate::paths::codeg_acp_transcripts_root(),
        agent,
        conversation_id,
        external_id,
        folder_path,
        title,
        created_at,
    )
}

pub fn history_for_role_in(
    root: &Path,
    agent: AgentType,
    conversation_id: i32,
    external_id: Option<&str>,
    folder_path: Option<&str>,
    title: Option<&str>,
    created_at: DateTime<Utc>,
) -> Vec<MessageTurn> {
    if !agent.is_hermes_family() {
        return Vec::new();
    }
    let seed_id = seed_session_id(conversation_id);
    let seeded = read_acp_turns_in(root, agent, &seed_id);
    if !seeded.is_empty() {
        return seeded;
    }
    let recovered = recover_from_hermes_homes(external_id, folder_path, title, created_at);
    if recovered.is_empty() {
        return Vec::new();
    }
    seed_transcript_in(root, agent, conversation_id, folder_path.unwrap_or(""), &recovered);
    recovered
}

pub fn collect_turns(
    from_agent: AgentType,
    conversation_id: i32,
    external_id: Option<&str>,
    folder_path: Option<&str>,
    title: Option<&str>,
    created_at: DateTime<Utc>,
) -> Vec<MessageTurn> {
    collect_turns_in(
        &crate::paths::codeg_acp_transcripts_root(),
        from_agent,
        conversation_id,
        external_id,
        folder_path,
        title,
        created_at,
    )
}

pub fn collect_turns_in(
    root: &Path,
    from_agent: AgentType,
    conversation_id: i32,
    external_id: Option<&str>,
    folder_path: Option<&str>,
    title: Option<&str>,
    created_at: DateTime<Utc>,
) -> Vec<MessageTurn> {
    let mut turns = history_for_role_in(
        root,
        from_agent,
        conversation_id,
        external_id,
        folder_path,
        title,
        created_at,
    );
    if let Some(eid) = external_id.filter(|id| !id.is_empty()) {
        if let Ok(detail) = crate::parsers::build_agent_parser(from_agent).get_conversation(eid) {
            if !detail.turns.is_empty() {
                turns = merge_seeded_turns(turns, detail.turns);
            }
        }
    }
    if turns.is_empty() {
        turns = recover_from_hermes_homes(external_id, folder_path, title, created_at);
    }
    turns
}

pub fn seed_transcript(
    agent: AgentType,
    conversation_id: i32,
    cwd: &str,
    turns: &[MessageTurn],
) {
    seed_transcript_in(
        &crate::paths::codeg_acp_transcripts_root(),
        agent,
        conversation_id,
        cwd,
        turns,
    );
}

pub fn seed_transcript_in(
    root: &Path,
    agent: AgentType,
    conversation_id: i32,
    cwd: &str,
    turns: &[MessageTurn],
) {
    if turns.is_empty() || !agent.is_hermes_family() {
        return;
    }
    let session_id = seed_session_id(conversation_id);
    let dir = registry_id_for(agent);
    let started_at_ms = turns
        .first()
        .map(|t| datetime_to_epoch_ms(t.timestamp))
        .unwrap_or_else(acp_transcript::now_epoch_ms);
    let header = TranscriptHeader::new(&agent.as_wire(), &session_id, cwd, started_at_ms);
    let mut lines = Vec::with_capacity(turns.len() * 2 + 1);
    if let Ok(line) = serde_json::to_string(&header) {
        lines.push(line);
    }
    for turn in turns {
        lines.extend(turn_to_lines(turn));
    }
    acp_transcript::replace_transcript_in(root, dir, &session_id, lines);
}

pub fn merge_seeded_turns(seed: Vec<MessageTurn>, live: Vec<MessageTurn>) -> Vec<MessageTurn> {
    if seed.is_empty() {
        return live;
    }
    if live.is_empty() {
        return seed;
    }
    if live_already_includes_seed(&seed, &live) {
        return live;
    }
    let mut out = seed;
    out.extend(live);
    out
}

fn live_already_includes_seed(seed: &[MessageTurn], live: &[MessageTurn]) -> bool {
    if seed.len() > live.len() {
        return false;
    }
    seed.iter().zip(live.iter()).all(|(a, b)| {
        same_turn_role(&a.role, &b.role) && turn_fingerprint(a) == turn_fingerprint(b)
    })
}

fn same_turn_role(a: &TurnRole, b: &TurnRole) -> bool {
    matches!(
        (a, b),
        (TurnRole::User, TurnRole::User)
            | (TurnRole::Assistant, TurnRole::Assistant)
            | (TurnRole::System, TurnRole::System)
    )
}

fn turn_fingerprint(turn: &MessageTurn) -> String {
    turn.blocks
        .iter()
        .filter_map(|block| match block {
            ContentBlock::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn read_acp_turns_in(root: &Path, agent: AgentType, session_id: &str) -> Vec<MessageTurn> {
    AcpNativeParser::new_in(agent, root.to_path_buf())
        .get_conversation(session_id)
        .ok()
        .map(|d| d.turns)
        .filter(|turns| !turns.is_empty())
        .unwrap_or_default()
}

fn recover_from_hermes_homes(
    external_id: Option<&str>,
    folder_path: Option<&str>,
    title: Option<&str>,
    created_at: DateTime<Utc>,
) -> Vec<MessageTurn> {
    for home in hermes_state_homes() {
        let parser = HermesParser::with_base_dir(home);
        if let Some(eid) = external_id.filter(|id| !id.is_empty()) {
            if let Ok(detail) = parser.get_conversation(eid) {
                if !detail.turns.is_empty() {
                    return detail.turns;
                }
            }
        }
        if let Some(folder) = folder_path.filter(|p| !p.is_empty()) {
            if let Ok(listed) = parser.list_conversations() {
                if let Some(id) = pick_recovered_session(&listed, folder, title, created_at) {
                    if let Ok(detail) = parser.get_conversation(&id) {
                        if !detail.turns.is_empty() {
                            return detail.turns;
                        }
                    }
                }
            }
        }
    }
    Vec::new()
}

fn pick_recovered_session(
    listed: &[crate::models::conversation::ConversationSummary],
    folder: &str,
    title: Option<&str>,
    created_at: DateTime<Utc>,
) -> Option<String> {
    let in_folder: Vec<_> = listed
        .iter()
        .filter(|row| row.message_count > 0)
        .filter(|row| {
            row.folder_path
                .as_ref()
                .is_some_and(|path| path_eq_for_matching(path, folder))
        })
        .collect();
    if in_folder.is_empty() {
        return None;
    }
    if let Some(title) = title.filter(|t| !t.is_empty()) {
        if let Some(row) = in_folder.iter().find(|row| row.title.as_deref() == Some(title)) {
            return Some(row.id.clone());
        }
    }
    if in_folder.len() == 1 {
        return Some(in_folder[0].id.clone());
    }
    in_folder
        .into_iter()
        .min_by_key(|row| (row.started_at - created_at).num_seconds().unsigned_abs())
        .filter(|row| (row.started_at - created_at).num_seconds().unsigned_abs() < 300)
        .map(|row| row.id.clone())
}

fn hermes_state_homes() -> Vec<PathBuf> {
    let mut homes = Vec::new();
    let default = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".hermes");
    push_home(&mut homes, default.clone());
    if let Ok(entries) = std::fs::read_dir(default.join("profiles")) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                push_home(&mut homes, path);
            }
        }
    }
    if let Ok(raw) = std::env::var("HERMES_HOME") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            push_home(&mut homes, PathBuf::from(trimmed));
        }
    }
    let resolved = hermes::resolve_hermes_home_dir();
    push_home(&mut homes, resolved);
    homes
}

fn push_home(homes: &mut Vec<PathBuf>, path: PathBuf) {
    if !homes.iter().any(|existing| existing == &path) {
        homes.push(path);
    }
}

fn datetime_to_epoch_ms(ts: DateTime<Utc>) -> u64 {
    ts.timestamp_millis().max(0) as u64
}

fn turn_to_lines(turn: &MessageTurn) -> Vec<String> {
    let t = datetime_to_epoch_ms(turn.timestamp);
    match turn.role {
        TurnRole::User | TurnRole::System => {
            let payload = prompt_payload(&turn.blocks);
            serialize_entry(TranscriptEntry {
                t,
                k: EntryKind::Prompt,
                p: payload,
                steer: false,
            })
            .into_iter()
            .collect()
        }
        TurnRole::Assistant => {
            let mut lines = Vec::new();
            let text = turn_fingerprint(turn);
            if !text.is_empty() {
                if let Some(line) = serialize_entry(TranscriptEntry {
                    t,
                    k: EntryKind::Update,
                    p: serde_json::json!({
                        "sessionUpdate": "agent_message_chunk",
                        "content": { "type": "text", "text": text }
                    }),
                    steer: false,
                }) {
                    lines.push(line);
                }
            }
            if let Some(line) = serialize_entry(TranscriptEntry {
                t: turn
                    .completed_at
                    .map(datetime_to_epoch_ms)
                    .unwrap_or(t),
                k: EntryKind::TurnEnd,
                p: serde_json::json!({ "stopReason": "end_turn" }),
                steer: false,
            }) {
                lines.push(line);
            }
            lines
        }
    }
}

fn prompt_payload(blocks: &[ContentBlock]) -> serde_json::Value {
    let items: Vec<serde_json::Value> = blocks
        .iter()
        .filter_map(|block| match block {
            ContentBlock::Text { text } => Some(serde_json::json!({
                "type": "text",
                "text": text
            })),
            ContentBlock::Image {
                data,
                mime_type,
                uri,
            } => {
                let mut obj = serde_json::json!({
                    "type": "image",
                    "data": data,
                    "mimeType": mime_type
                });
                if let Some(uri) = uri {
                    obj["uri"] = serde_json::Value::String(uri.clone());
                }
                Some(obj)
            }
            _ => None,
        })
        .collect();
    if items.is_empty() {
        serde_json::json!([{ "type": "text", "text": "" }])
    } else {
        serde_json::Value::Array(items)
    }
}

fn serialize_entry(entry: TranscriptEntry) -> Option<String> {
    serde_json::to_string(&entry).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::message::MessageTurn;
    use chrono::TimeZone;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "codeg-hermes-role-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn user_turn(text: &str) -> MessageTurn {
        MessageTurn {
            id: "turn-0".into(),
            role: TurnRole::User,
            blocks: vec![ContentBlock::Text {
                text: text.to_string(),
            }],
            timestamp: Utc.timestamp_millis_opt(1_750_000_000_000).unwrap(),
            usage: None,
            duration_ms: None,
            model: None,
            completed_at: None,
            agent_message_id: None,
        }
    }

    fn assistant_turn(text: &str) -> MessageTurn {
        MessageTurn {
            id: "turn-1".into(),
            role: TurnRole::Assistant,
            blocks: vec![ContentBlock::Text {
                text: text.to_string(),
            }],
            timestamp: Utc.timestamp_millis_opt(1_750_000_000_100).unwrap(),
            usage: None,
            duration_ms: None,
            model: None,
            completed_at: Some(Utc.timestamp_millis_opt(1_750_000_000_200).unwrap()),
            agent_message_id: None,
        }
    }

    #[test]
    fn seed_round_trips_through_acp_native() {
        let root = temp_root();
        let agent = AgentType::custom("hermes-learn").unwrap();
        let turns = vec![user_turn("hello role"), assistant_turn("hi")];
        seed_transcript_in(&root, agent, 256, "/repo", &turns);
        let loaded = history_for_role_in(&root, agent, 256, None, Some("/repo"), None, Utc::now());
        assert_eq!(loaded.len(), 2);
        assert_eq!(turn_fingerprint(&loaded[0]), "hello role");
        assert_eq!(turn_fingerprint(&loaded[1]), "hi");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn merge_prepends_unless_live_already_has_the_seed() {
        let seed = vec![user_turn("old")];
        let live = vec![user_turn("new")];
        let merged = merge_seeded_turns(seed.clone(), live);
        assert_eq!(merged.len(), 2);
        assert_eq!(turn_fingerprint(&merged[0]), "old");
        assert_eq!(turn_fingerprint(&merged[1]), "new");

        let same = merge_seeded_turns(seed.clone(), seed);
        assert_eq!(same.len(), 1);
    }
}
