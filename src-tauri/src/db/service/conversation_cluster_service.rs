//! Theme clusters: exclusive 1:N bags of regular conversations.
//!
//! Not tags (M:N filter) and not `parent_id` (delegation children). A cluster
//! belongs to one ROOT folder; worktree children of that root may join.
//!
//! Writes follow the tag-service rule: validate outside a transaction, then
//! write-only transactions, because SQLite WAL cannot upgrade a read snapshot.

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::NotSet, ColumnTrait, DatabaseConnection,
    EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, Set,
};

use crate::db::entities::conversation::ConversationKind;
use crate::db::entities::folder::FolderKind;
use crate::db::entities::{conversation, conversation_cluster, folder};
use crate::db::error::DbError;
use crate::db::service::conversation_service;
use crate::models::{AgentType, ConversationClusterDetail, HandoffConversationResult};

pub const MAX_CLUSTER_TITLE_CHARS: usize = 64;
pub const DEFAULT_CLUSTER_TITLE: &str = "主题";

#[derive(Debug, thiserror::Error)]
pub enum ClusterError {
    #[error(transparent)]
    Db(#[from] DbError),
    #[error("Cluster title cannot be empty")]
    EmptyTitle,
    #[error("Cluster {0} not found")]
    NotFound(i32),
    #[error("Conversation {0} not found")]
    ConversationNotFound(i32),
    #[error("Conversation {conversation_id} is not a regular session")]
    NotRegular { conversation_id: i32 },
    #[error("Handoff must target a different agent")]
    SameAgent,
    #[error("Cluster {cluster_id} belongs to another folder than conversation {conversation_id}")]
    FolderMismatch {
        cluster_id: i32,
        conversation_id: i32,
    },
}

impl From<sea_orm::DbErr> for ClusterError {
    fn from(err: sea_orm::DbErr) -> Self {
        ClusterError::Db(DbError::Database(err))
    }
}

fn normalize_title(title: &str) -> Result<String, ClusterError> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Err(ClusterError::EmptyTitle);
    }
    let mut out = String::new();
    for (i, ch) in trimmed.chars().enumerate() {
        if i >= MAX_CLUSTER_TITLE_CHARS {
            break;
        }
        out.push(ch);
    }
    if out.is_empty() {
        return Err(ClusterError::EmptyTitle);
    }
    Ok(out)
}

fn to_detail(row: conversation_cluster::Model) -> ConversationClusterDetail {
    ConversationClusterDetail {
        id: row.id,
        folder_id: row.folder_id,
        title: row.title,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

async fn folder_row(
    conn: &DatabaseConnection,
    folder_id: i32,
) -> Result<folder::Model, ClusterError> {
    folder::Entity::find_by_id(folder_id)
        .filter(folder::Column::DeletedAt.is_null())
        .one(conn)
        .await?
        .ok_or(ClusterError::NotFound(folder_id))
}

/// Root folder id for cluster scope: a worktree child (`parent_id` set) maps
/// to its original root. Chat folders cannot own a cluster.
async fn resolve_root_folder_id(
    conn: &DatabaseConnection,
    folder_id: i32,
) -> Result<i32, ClusterError> {
    let folder = folder_row(conn, folder_id).await?;
    Ok(folder.parent_id.unwrap_or(folder.id))
}

async fn live_conversation(
    conn: &DatabaseConnection,
    conversation_id: i32,
) -> Result<conversation::Model, ClusterError> {
    conversation::Entity::find_by_id(conversation_id)
        .filter(conversation::Column::DeletedAt.is_null())
        .one(conn)
        .await?
        .ok_or(ClusterError::ConversationNotFound(conversation_id))
}

pub async fn list_clusters(
    conn: &DatabaseConnection,
) -> Result<Vec<ConversationClusterDetail>, ClusterError> {
    let rows = conversation_cluster::Entity::find()
        .order_by_asc(conversation_cluster::Column::Id)
        .all(conn)
        .await?;
    Ok(rows.into_iter().map(to_detail).collect())
}

pub async fn get_cluster(
    conn: &DatabaseConnection,
    cluster_id: i32,
) -> Result<ConversationClusterDetail, ClusterError> {
    let row = conversation_cluster::Entity::find_by_id(cluster_id)
        .one(conn)
        .await?
        .ok_or(ClusterError::NotFound(cluster_id))?;
    Ok(to_detail(row))
}

pub async fn create_cluster(
    conn: &DatabaseConnection,
    folder_id: i32,
    title: &str,
) -> Result<ConversationClusterDetail, ClusterError> {
    let title = normalize_title(title)?;
    let root = resolve_root_folder_id(conn, folder_id).await?;
    let root_folder = folder_row(conn, root).await?;
    if root_folder.kind != FolderKind::Regular {
        return Err(ClusterError::FolderMismatch {
            cluster_id: 0,
            conversation_id: 0,
        });
    }
    let now = Utc::now();
    let row = conversation_cluster::ActiveModel {
        id: NotSet,
        folder_id: Set(root),
        title: Set(title),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(conn)
    .await?;
    Ok(to_detail(row))
}

pub async fn rename_cluster(
    conn: &DatabaseConnection,
    cluster_id: i32,
    title: &str,
) -> Result<ConversationClusterDetail, ClusterError> {
    let title = normalize_title(title)?;
    let row = conversation_cluster::Entity::find_by_id(cluster_id)
        .one(conn)
        .await?
        .ok_or(ClusterError::NotFound(cluster_id))?;
    let mut active: conversation_cluster::ActiveModel = row.into();
    active.title = Set(title);
    active.updated_at = Set(Utc::now());
    let row = active.update(conn).await?;
    Ok(to_detail(row))
}

/// Unassign every live member, delete the cluster row, return those member ids
/// so the caller can upsert them.
pub async fn delete_cluster(
    conn: &DatabaseConnection,
    cluster_id: i32,
) -> Result<Vec<i32>, ClusterError> {
    let exists = conversation_cluster::Entity::find_by_id(cluster_id)
        .one(conn)
        .await?
        .ok_or(ClusterError::NotFound(cluster_id))?;
    let _ = exists;
    let members = conversation::Entity::find()
        .filter(conversation::Column::ClusterId.eq(cluster_id))
        .filter(conversation::Column::DeletedAt.is_null())
        .all(conn)
        .await?;
    let ids: Vec<i32> = members.iter().map(|m| m.id).collect();
    if !ids.is_empty() {
        conversation::Entity::update_many()
            .col_expr(
                conversation::Column::ClusterId,
                sea_orm::sea_query::Expr::value(Option::<i32>::None),
            )
            .filter(conversation::Column::Id.is_in(ids.clone()))
            .exec(conn)
            .await?;
    }
    conversation_cluster::Entity::delete_by_id(cluster_id)
        .exec(conn)
        .await?;
    Ok(ids)
}

pub async fn delete_cluster_if_empty(
    conn: &DatabaseConnection,
    cluster_id: i32,
) -> Result<bool, ClusterError> {
    let live = conversation::Entity::find()
        .filter(conversation::Column::ClusterId.eq(cluster_id))
        .filter(conversation::Column::DeletedAt.is_null())
        .count(conn)
        .await?;
    if live > 0 {
        return Ok(false);
    }
    let result = conversation_cluster::Entity::delete_by_id(cluster_id)
        .exec(conn)
        .await?;
    Ok(result.rows_affected > 0)
}

pub async fn set_conversation_cluster(
    conn: &DatabaseConnection,
    conversation_id: i32,
    cluster_id: Option<i32>,
) -> Result<i32, ClusterError> {
    let conv = live_conversation(conn, conversation_id).await?;
    if conv.kind != ConversationKind::Regular {
        return Err(ClusterError::NotRegular { conversation_id });
    }
    let old_cluster = conv.cluster_id;
    if let Some(cid) = cluster_id {
        let cluster = conversation_cluster::Entity::find_by_id(cid)
            .one(conn)
            .await?
            .ok_or(ClusterError::NotFound(cid))?;
        let root = resolve_root_folder_id(conn, conv.folder_id).await?;
        if cluster.folder_id != root {
            return Err(ClusterError::FolderMismatch {
                cluster_id: cid,
                conversation_id,
            });
        }
    }
    let mut active: conversation::ActiveModel = conv.into();
    active.cluster_id = Set(cluster_id);
    active.updated_at = Set(Utc::now());
    active.update(conn).await?;
    if let Some(old) = old_cluster {
        if cluster_id != Some(old) {
            let _ = delete_cluster_if_empty(conn, old).await?;
        }
    }
    Ok(conversation_id)
}

pub async fn handoff_conversation(
    conn: &DatabaseConnection,
    source_id: i32,
    agent_type: AgentType,
    title: Option<String>,
    git_branch: Option<String>,
) -> Result<HandoffConversationResult, ClusterError> {
    let source = live_conversation(conn, source_id).await?;
    if source.kind != ConversationKind::Regular {
        return Err(ClusterError::NotRegular {
            conversation_id: source_id,
        });
    }
    let source_agent = conversation_service_parse_agent(&source.agent_type);
    if source_agent == agent_type {
        return Err(ClusterError::SameAgent);
    }
    let cluster_id = if let Some(existing) = source.cluster_id {
        match conversation_cluster::Entity::find_by_id(existing)
            .one(conn)
            .await?
        {
            Some(_) => existing,
            None => ensure_cluster_for(conn, &source).await?,
        }
    } else {
        ensure_cluster_for(conn, &source).await?
    };
    let new = conversation_service::create_handoff(
        conn,
        source.folder_id,
        agent_type,
        title,
        git_branch,
        cluster_id,
        source_id,
    )
    .await?;
    Ok(HandoffConversationResult {
        conversation_id: new.id,
        cluster_id,
        source_id,
    })
}

async fn ensure_cluster_for(
    conn: &DatabaseConnection,
    source: &conversation::Model,
) -> Result<i32, ClusterError> {
    let title = source
        .title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_CLUSTER_TITLE);
    let cluster = create_cluster(conn, source.folder_id, title).await?;
    let mut active: conversation::ActiveModel = source.clone().into();
    active.cluster_id = Set(Some(cluster.id));
    active.updated_at = Set(Utc::now());
    active.update(conn).await?;
    Ok(cluster.id)
}

fn conversation_service_parse_agent(s: &str) -> AgentType {
    serde_json::from_value(serde_json::Value::String(s.to_string()))
        .ok()
        .or_else(|| serde_json::from_str(&format!("\"{s}\"")).ok())
        .unwrap_or(AgentType::ClaudeCode)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_helpers::{fresh_in_memory_db, seed_conversation, seed_folder};

    #[tokio::test]
    async fn create_and_list_cluster() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/codeg-cluster-list").await;
        let c = create_cluster(&db.conn, folder, "  货架新建  ")
            .await
            .expect("create");
        assert_eq!(c.title, "货架新建");
        assert_eq!(c.folder_id, folder);
        let listed = list_clusters(&db.conn).await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, c.id);
    }

    #[tokio::test]
    async fn empty_title_refused() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/codeg-cluster-empty").await;
        let err = create_cluster(&db.conn, folder, "   ")
            .await
            .expect_err("empty");
        assert!(matches!(err, ClusterError::EmptyTitle));
    }

    #[tokio::test]
    async fn handoff_creates_cluster_and_assigns_both() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/codeg-cluster-handoff").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        conversation_service::update_title(&db.conn, source, "货架新建能切 agent".to_string())
            .await
            .expect("title");
        let result = handoff_conversation(
            &db.conn,
            source,
            AgentType::Grok,
            None,
            None,
        )
        .await
        .expect("handoff");
        assert_eq!(result.source_id, source);
        let src = conversation_service::get_by_id(&db.conn, source)
            .await
            .expect("src");
        let neu = conversation_service::get_by_id(&db.conn, result.conversation_id)
            .await
            .expect("new");
        assert_eq!(src.cluster_id, Some(result.cluster_id));
        assert_eq!(neu.cluster_id, Some(result.cluster_id));
        assert_eq!(neu.handoff_from_id, Some(source));
        assert_eq!(neu.agent_type, AgentType::Grok);
        let cluster = get_cluster(&db.conn, result.cluster_id)
            .await
            .expect("cluster");
        assert_eq!(cluster.title, "货架新建能切 agent");
    }

    #[tokio::test]
    async fn second_handoff_reuses_cluster() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/codeg-cluster-reuse").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let first = handoff_conversation(&db.conn, source, AgentType::Grok, None, None)
            .await
            .expect("first");
        let second = handoff_conversation(&db.conn, source, AgentType::ClaudeCode, None, None)
            .await
            .expect("second");
        assert_eq!(first.cluster_id, second.cluster_id);
        assert_eq!(list_clusters(&db.conn).await.expect("list").len(), 1);
    }

    #[tokio::test]
    async fn same_agent_refused() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/codeg-cluster-same").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let err = handoff_conversation(&db.conn, source, AgentType::Cursor, None, None)
            .await
            .expect_err("same");
        assert!(matches!(err, ClusterError::SameAgent));
    }

    #[tokio::test]
    async fn leave_last_member_deletes_cluster() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/codeg-cluster-leave").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let result = handoff_conversation(&db.conn, source, AgentType::Grok, None, None)
            .await
            .expect("handoff");
        set_conversation_cluster(&db.conn, source, None)
            .await
            .expect("leave source");
        set_conversation_cluster(&db.conn, result.conversation_id, None)
            .await
            .expect("leave new");
        assert!(list_clusters(&db.conn).await.expect("list").is_empty());
        conversation_service::get_by_id(&db.conn, source)
            .await
            .expect("source still live");
        conversation_service::get_by_id(&db.conn, result.conversation_id)
            .await
            .expect("new still live");
    }

    #[tokio::test]
    async fn dissolve_keeps_conversations() {
        let db = fresh_in_memory_db().await;
        let folder = seed_folder(&db, "/tmp/codeg-cluster-dissolve").await;
        let source = seed_conversation(&db, folder, AgentType::Cursor).await;
        let result = handoff_conversation(&db.conn, source, AgentType::Grok, None, None)
            .await
            .expect("handoff");
        let members = delete_cluster(&db.conn, result.cluster_id)
            .await
            .expect("dissolve");
        assert_eq!(members.len(), 2);
        let src = conversation_service::get_by_id(&db.conn, source)
            .await
            .expect("src");
        assert!(src.cluster_id.is_none());
        assert!(list_clusters(&db.conn).await.expect("list").is_empty());
    }

    #[tokio::test]
    async fn worktree_conversation_joins_root_cluster() {
        let db = fresh_in_memory_db().await;
        let root = seed_folder(&db, "/tmp/codeg-cluster-root").await;
        let wt = crate::db::service::folder_service::add_folder_with_parent(
            &db.conn,
            "/tmp/codeg-cluster-root-wt",
            Some(root),
        )
        .await
        .expect("wt")
        .id;
        let source = seed_conversation(&db, wt, AgentType::Cursor).await;
        let result = handoff_conversation(&db.conn, source, AgentType::Grok, None, None)
            .await
            .expect("handoff");
        let cluster = get_cluster(&db.conn, result.cluster_id)
            .await
            .expect("cluster");
        assert_eq!(cluster.folder_id, root);
        let neu = conversation_service::get_by_id(&db.conn, result.conversation_id)
            .await
            .expect("new");
        assert_eq!(neu.folder_id, wt);
    }
}
