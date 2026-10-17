use std::sync::Arc;

use axum::{extract::Extension, Json};

use crate::app_error::AppCommandError;
use crate::app_state::AppState;
use crate::commands::plan::{
    plan_read_text_core, plan_status_core, plan_write_text_core, PlanStatus, PlanText, RelParams,
    WriteParams,
};

pub async fn plan_status(
    Extension(_state): Extension<Arc<AppState>>,
) -> Result<Json<PlanStatus>, AppCommandError> {
    Ok(Json(plan_status_core()?))
}

pub async fn plan_read_text(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<RelParams>,
) -> Result<Json<PlanText>, AppCommandError> {
    Ok(Json(plan_read_text_core(&params.rel)?))
}

pub async fn plan_write_text(
    Extension(_state): Extension<Arc<AppState>>,
    Json(params): Json<WriteParams>,
) -> Result<Json<PlanText>, AppCommandError> {
    Ok(Json(plan_write_text_core(
        &params.rel,
        &params.content,
        &params.etag,
    )?))
}
