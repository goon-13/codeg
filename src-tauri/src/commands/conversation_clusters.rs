//! Theme clusters and cross-CLI handoff. See `db::service::conversation_cluster_service`.

use std::collections::BTreeMap;

use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

use crate::app_error::AppCommandError;
use crate::commands::conversations::emit_conversation_upsert;
use crate::db::entities::conversation;
use crate::db::error::DbError;
use crate::db::service::conversation_cluster_service::{self, ClusterError};
use crate::db::service::conversation_service;
use crate::db::AppDatabase;
use crate::models::{
    AgentType, ConversationClusterDetail, DbConversationSummary, HandoffConversationResult,
    OpenSideConversationResult,
};
use crate::web::event_bridge::{
    emit_event, ConversationClusterChange, EventEmitter, CONVERSATION_CLUSTER_CHANGED_EVENT,
};

const I18N_EMPTY_TITLE: &str = "errors.emptyTitle";
const I18N_NOT_REGULAR: &str = "errors.notRegular";
const I18N_SAME_AGENT: &str = "errors.sameAgent";
const I18N_FOLDER_MISMATCH: &str = "errors.folderMismatch";
const I18N_NOT_FOUND: &str = "errors.notFound";
const I18N_SIDE_NOT_REGULAR: &str = "ConversationSide.errors.notRegular";
const I18N_SIDE_NOT_FOUND: &str = "ConversationSide.errors.notFound";

fn no_params() -> BTreeMap<String, String> {
    BTreeMap::new()
}

impl From<ClusterError> for AppCommandError {
    fn from(err: ClusterError) -> Self {
        let message = err.to_string();
        match err {
            ClusterError::Db(db) => AppCommandError::from(db),
            ClusterError::EmptyTitle => {
                AppCommandError::invalid_input(message).with_i18n(I18N_EMPTY_TITLE, no_params())
            }
            ClusterError::NotRegular { .. } => {
                AppCommandError::invalid_input(message).with_i18n(I18N_NOT_REGULAR, no_params())
            }
            ClusterError::SameAgent => {
                AppCommandError::invalid_input(message).with_i18n(I18N_SAME_AGENT, no_params())
            }
            ClusterError::FolderMismatch { .. } => {
                AppCommandError::invalid_input(message).with_i18n(I18N_FOLDER_MISMATCH, no_params())
            }
            ClusterError::NotFound(_) | ClusterError::ConversationNotFound(_) => {
                AppCommandError::not_found(message).with_i18n(I18N_NOT_FOUND, no_params())
            }
        }
    }
}

fn emit_cluster_change(emitter: &EventEmitter, change: ConversationClusterChange) {
    emit_event(emitter, CONVERSATION_CLUSTER_CHANGED_EVENT, change);
}

pub async fn list_conversation_clusters_core(
    db: &AppDatabase,
) -> Result<Vec<ConversationClusterDetail>, AppCommandError> {
    conversation_cluster_service::list_clusters(&db.conn)
        .await
        .map_err(AppCommandError::from)
}

pub async fn create_conversation_cluster_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    folder_id: i32,
    title: String,
) -> Result<ConversationClusterDetail, AppCommandError> {
    let cluster = conversation_cluster_service::create_cluster(&db.conn, folder_id, &title).await?;
    emit_cluster_change(
        emitter,
        ConversationClusterChange::Upsert {
            cluster: cluster.clone(),
        },
    );
    Ok(cluster)
}

pub async fn update_conversation_cluster_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    cluster_id: i32,
    title: String,
) -> Result<ConversationClusterDetail, AppCommandError> {
    let cluster =
        conversation_cluster_service::rename_cluster(&db.conn, cluster_id, &title).await?;
    emit_cluster_change(
        emitter,
        ConversationClusterChange::Upsert {
            cluster: cluster.clone(),
        },
    );
    Ok(cluster)
}

pub async fn delete_conversation_cluster_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    cluster_id: i32,
) -> Result<(), AppCommandError> {
    let members = conversation_cluster_service::delete_cluster(&db.conn, cluster_id).await?;
    emit_cluster_change(emitter, ConversationClusterChange::Deleted { id: cluster_id });
    for id in members {
        emit_conversation_upsert(emitter, &db.conn, id).await;
    }
    Ok(())
}

pub async fn set_conversation_cluster_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    conversation_id: i32,
    cluster_id: Option<i32>,
) -> Result<DbConversationSummary, AppCommandError> {
    conversation_cluster_service::set_conversation_cluster(
        &db.conn,
        conversation_id,
        cluster_id,
    )
    .await?;
    emit_conversation_upsert(emitter, &db.conn, conversation_id).await;
    crate::db::service::conversation_service::get_by_id(&db.conn, conversation_id)
        .await
        .map_err(AppCommandError::from)
}

pub async fn handoff_conversation_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    source_id: i32,
    agent_type: AgentType,
    title: Option<String>,
) -> Result<HandoffConversationResult, AppCommandError> {
    let git_branch = None;
    let clusters_before: Vec<i32> = conversation_cluster_service::list_clusters(&db.conn)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|c| c.id)
        .collect();
    let result = conversation_cluster_service::handoff_conversation(
        &db.conn,
        source_id,
        agent_type,
        title,
        git_branch,
    )
    .await?;
    if !clusters_before.contains(&result.cluster_id) {
        if let Ok(cluster) =
            conversation_cluster_service::get_cluster(&db.conn, result.cluster_id).await
        {
            emit_cluster_change(
                emitter,
                ConversationClusterChange::Upsert { cluster },
            );
        }
    }
    emit_conversation_upsert(emitter, &db.conn, result.source_id).await;
    emit_conversation_upsert(emitter, &db.conn, result.conversation_id).await;
    Ok(result)
}

fn map_side_error(err: DbError) -> AppCommandError {
    match err {
        DbError::Validation(msg) if msg == "notRegular" => {
            AppCommandError::invalid_input("Source is not a regular session")
                .with_i18n(I18N_SIDE_NOT_REGULAR, no_params())
        }
        DbError::NotFound(_) => AppCommandError::not_found("Conversation not found")
            .with_i18n(I18N_SIDE_NOT_FOUND, no_params()),
        other => AppCommandError::from(other),
    }
}

pub async fn open_side_conversation_core(
    emitter: &EventEmitter,
    db: &AppDatabase,
    source_id: i32,
    title: Option<String>,
) -> Result<OpenSideConversationResult, AppCommandError> {
    let source = conversation::Entity::find_by_id(source_id)
        .filter(conversation::Column::DeletedAt.is_null())
        .one(&db.conn)
        .await
        .map_err(|err| AppCommandError::from(DbError::from(err)))?
        .ok_or_else(|| {
            AppCommandError::not_found("Conversation not found")
                .with_i18n(I18N_SIDE_NOT_FOUND, no_params())
        })?;
    let created = conversation_service::create_side(&db.conn, &source, title)
        .await
        .map_err(map_side_error)?;
    emit_conversation_upsert(emitter, &db.conn, source.id).await;
    emit_conversation_upsert(emitter, &db.conn, created.id).await;
    Ok(OpenSideConversationResult {
        conversation_id: created.id,
        source_id: source.id,
    })
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn list_conversation_clusters(
    db: tauri::State<'_, AppDatabase>,
) -> Result<Vec<ConversationClusterDetail>, AppCommandError> {
    list_conversation_clusters_core(&db).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn create_conversation_cluster(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    folder_id: i32,
    title: String,
) -> Result<ConversationClusterDetail, AppCommandError> {
    create_conversation_cluster_core(&EventEmitter::Tauri(app), &db, folder_id, title).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn update_conversation_cluster(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    cluster_id: i32,
    title: String,
) -> Result<ConversationClusterDetail, AppCommandError> {
    update_conversation_cluster_core(&EventEmitter::Tauri(app), &db, cluster_id, title).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn delete_conversation_cluster(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    cluster_id: i32,
) -> Result<(), AppCommandError> {
    delete_conversation_cluster_core(&EventEmitter::Tauri(app), &db, cluster_id).await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn set_conversation_cluster(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    conversation_id: i32,
    cluster_id: Option<i32>,
) -> Result<DbConversationSummary, AppCommandError> {
    set_conversation_cluster_core(
        &EventEmitter::Tauri(app),
        &db,
        conversation_id,
        cluster_id,
    )
    .await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn handoff_conversation(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    source_id: i32,
    agent_type: AgentType,
    title: Option<String>,
) -> Result<HandoffConversationResult, AppCommandError> {
    handoff_conversation_core(
        &EventEmitter::Tauri(app),
        &db,
        source_id,
        agent_type,
        title,
    )
    .await
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(feature = "tauri-runtime", tauri::command)]
pub async fn open_side_conversation(
    app: tauri::AppHandle,
    db: tauri::State<'_, AppDatabase>,
    source_id: i32,
    title: Option<String>,
) -> Result<OpenSideConversationResult, AppCommandError> {
    open_side_conversation_core(&EventEmitter::Tauri(app), &db, source_id, title).await
}
