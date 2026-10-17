use sea_orm::entity::prelude::*;

/// Exclusive bag of regular conversations that are the same job / theme.
///
/// `folder_id` is the ROOT folder that owns the cluster — never a worktree
/// child. Conversations of that folder family may join; one conversation
/// sits in at most one cluster. Hard-deleted: members' `cluster_id` is
/// cleared by the service first (SQLite cannot attach ON DELETE SET NULL
/// to the ALTER COLUMN). See `m20261016_000001_conversation_cluster`.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "conversation_cluster")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub folder_id: i32,
    #[sea_orm(column_type = "Text")]
    pub title: String,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::folder::Entity",
        from = "Column::FolderId",
        to = "super::folder::Column::Id",
        on_delete = "Cascade"
    )]
    Folder,
}

impl Related<super::folder::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Folder.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
