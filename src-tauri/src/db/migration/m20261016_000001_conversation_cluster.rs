use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DbBackend, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Exclusive 1:N bag for "these regular conversations are the same job".
        // Not tags (M:N filter) and not parent_id (delegation children).
        // folder_id is the ROOT folder (worktree children resolve to it),
        // matching conversation_tag's scope rule.
        manager
            .create_table(
                Table::create()
                    .table(ConversationCluster::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(ConversationCluster::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(ConversationCluster::FolderId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ConversationCluster::Title)
                            .text()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ConversationCluster::CreatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(ConversationCluster::UpdatedAt)
                            .timestamp_with_time_zone()
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_conversation_cluster_folder_id")
                            .from(
                                ConversationCluster::Table,
                                ConversationCluster::FolderId,
                            )
                            .to(Folder::Table, Folder::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_conversation_cluster_folder_id")
                    .table(ConversationCluster::Table)
                    .col(ConversationCluster::FolderId)
                    .to_owned(),
            )
            .await?;

        // SQLite ADD COLUMN cannot attach a named FK to an existing table
        // reliably. The service layer treats a dangling cluster_id as "no
        // cluster" (list skips unknown ids) and SET-NULLs members before
        // deleting a cluster row.
        let conn = manager.get_connection();
        conn.execute(Statement::from_string(
            DbBackend::Sqlite,
            "ALTER TABLE conversation ADD COLUMN cluster_id INTEGER".to_string(),
        ))
        .await?;
        conn.execute(Statement::from_string(
            DbBackend::Sqlite,
            "ALTER TABLE conversation ADD COLUMN handoff_from_id INTEGER".to_string(),
        ))
        .await?;
        conn.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE INDEX IF NOT EXISTS idx_conversation_cluster_id \
             ON conversation (cluster_id)"
                .to_string(),
        ))
        .await?;
        conn.execute(Statement::from_string(
            DbBackend::Sqlite,
            "CREATE INDEX IF NOT EXISTS idx_conversation_handoff_from_id \
             ON conversation (handoff_from_id)"
                .to_string(),
        ))
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // SQLite cannot DROP COLUMN on older versions we still support; the
        // down path only drops the cluster table. Columns stay nullable no-ops.
        manager
            .drop_table(
                Table::drop()
                    .table(ConversationCluster::Table)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum ConversationCluster {
    Table,
    Id,
    FolderId,
    Title,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Folder {
    Table,
    Id,
}
