use std::sync::Arc;

use axum::{extract::Extension, Json};
use serde::Deserialize;

use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::commands::conversation_clusters as cluster_commands;
use crate::models::{
    AgentType, ConversationClusterDetail, DbConversationSummary, HandoffConversationResult,
    OpenSideConversationResult,
};

pub async fn list_conversation_clusters(
    Extension(state): Extension<Arc<AppState>>,
) -> Result<Json<Vec<ConversationClusterDetail>>, AppCommandError> {
    Ok(Json(
        cluster_commands::list_conversation_clusters_core(&state.db).await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConversationClusterParams {
    pub folder_id: i32,
    pub title: String,
}

pub async fn create_conversation_cluster(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<CreateConversationClusterParams>,
) -> Result<Json<ConversationClusterDetail>, AppCommandError> {
    Ok(Json(
        cluster_commands::create_conversation_cluster_core(
            &state.emitter,
            &state.db,
            params.folder_id,
            params.title,
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateConversationClusterParams {
    pub cluster_id: i32,
    pub title: String,
}

pub async fn update_conversation_cluster(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<UpdateConversationClusterParams>,
) -> Result<Json<ConversationClusterDetail>, AppCommandError> {
    Ok(Json(
        cluster_commands::update_conversation_cluster_core(
            &state.emitter,
            &state.db,
            params.cluster_id,
            params.title,
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationClusterIdParams {
    pub cluster_id: i32,
}

pub async fn delete_conversation_cluster(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<ConversationClusterIdParams>,
) -> Result<Json<()>, AppCommandError> {
    cluster_commands::delete_conversation_cluster_core(
        &state.emitter,
        &state.db,
        params.cluster_id,
    )
    .await?;
    Ok(Json(()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetConversationClusterParams {
    pub conversation_id: i32,
    pub cluster_id: Option<i32>,
}

pub async fn set_conversation_cluster(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<SetConversationClusterParams>,
) -> Result<Json<DbConversationSummary>, AppCommandError> {
    Ok(Json(
        cluster_commands::set_conversation_cluster_core(
            &state.emitter,
            &state.db,
            params.conversation_id,
            params.cluster_id,
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffConversationParams {
    pub source_id: i32,
    pub agent_type: AgentType,
    #[serde(default)]
    pub title: Option<String>,
}

pub async fn handoff_conversation(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<HandoffConversationParams>,
) -> Result<Json<HandoffConversationResult>, AppCommandError> {
    Ok(Json(
        cluster_commands::handoff_conversation_core(
            &state.emitter,
            &state.db,
            params.source_id,
            params.agent_type,
            params.title,
        )
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenSideConversationParams {
    pub source_id: i32,
    #[serde(default)]
    pub title: Option<String>,
}

pub async fn open_side_conversation(
    Extension(state): Extension<Arc<AppState>>,
    Json(params): Json<OpenSideConversationParams>,
) -> Result<Json<OpenSideConversationResult>, AppCommandError> {
    Ok(Json(
        cluster_commands::open_side_conversation_core(
            &state.emitter,
            &state.db,
            params.source_id,
            params.title,
        )
        .await?,
    ))
}
