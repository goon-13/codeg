"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAcpActions } from "@/contexts/acp-connections-context"
import { createConversation, moveConversation } from "@/lib/api"
import type { AgentType } from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"

import {
  buildShelfRows,
  defaultVisibleConversationIds,
  defaultVisibleFolderIds,
  shelfLiveSurfaceKeys,
  type ShelfProjectRow,
} from "./shelf-model"
import { ShelfProjectRowView } from "./shelf-project-row"
import {
  loadShelfCollapsedFolderIds,
  loadShelfExpandedConversationIds,
  loadShelfShowAll,
  loadShelfShowAllConversationFolderIds,
  loadShelfVisibleConversationIds,
  loadShelfVisibleFolderIds,
  saveShelfCollapsedFolderIds,
  saveShelfExpandedConversationIds,
  saveShelfShowAll,
  saveShelfShowAllConversationFolderIds,
  saveShelfVisibleConversationIds,
  saveShelfVisibleFolderIds,
} from "./shelf-storage"

function toggleMember(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

function agentForFolder(defaultAgent: AgentType | null): AgentType {
  return defaultAgent ?? "claude_code"
}

function workingConversationIds(
  rows: ShelfProjectRow[],
  visibleIds: number[] | null
): number[] {
  if (visibleIds != null) return visibleIds
  return rows.flatMap((row) => defaultVisibleConversationIds(row.conversations))
}

export function ShelfView() {
  const t = useTranslations("Canvas")
  const folders = useAppWorkspaceStore((s) => s.folders)
  const conversations = useAppWorkspaceStore((s) => s.conversations)
  const rows = useMemo(
    () => buildShelfRows(folders, conversations),
    [folders, conversations]
  )
  const [expandedIds, setExpandedIds] = useState(
    loadShelfExpandedConversationIds
  )
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(
    loadShelfCollapsedFolderIds
  )
  const [visibleIds, setVisibleIds] = useState<number[] | null>(
    loadShelfVisibleFolderIds
  )
  const [showAll, setShowAll] = useState(loadShelfShowAll)
  const [visibleConversationIds, setVisibleConversationIds] = useState<
    number[] | null
  >(loadShelfVisibleConversationIds)
  const [showAllConversationFolderIds, setShowAllConversationFolderIds] =
    useState(loadShelfShowAllConversationFolderIds)

  useEffect(() => {
    saveShelfExpandedConversationIds(expandedIds)
  }, [expandedIds])

  useEffect(() => {
    saveShelfCollapsedFolderIds(collapsedFolderIds)
  }, [collapsedFolderIds])

  useEffect(() => {
    saveShelfVisibleFolderIds(visibleIds)
  }, [visibleIds])

  useEffect(() => {
    saveShelfShowAll(showAll)
  }, [showAll])

  useEffect(() => {
    saveShelfVisibleConversationIds(visibleConversationIds)
  }, [visibleConversationIds])

  useEffect(() => {
    saveShelfShowAllConversationFolderIds(showAllConversationFolderIds)
  }, [showAllConversationFolderIds])

  const expanded = useMemo(() => new Set(expandedIds), [expandedIds])
  const collapsed = useMemo(
    () => new Set(collapsedFolderIds),
    [collapsedFolderIds]
  )
  const workingIds = useMemo(
    () => visibleIds ?? defaultVisibleFolderIds(rows),
    [visibleIds, rows]
  )
  const shownRows = useMemo(
    () =>
      showAll ? rows : rows.filter((row) => workingIds.includes(row.folder.id)),
    [showAll, rows, workingIds]
  )
  const conversationWorkingIds = workingConversationIds(
    rows,
    visibleConversationIds
  )
  const { registerLiveSurfaceKeys } = useAcpActions()
  const liveKeys = useMemo(
    () =>
      shelfLiveSurfaceKeys(
        shownRows,
        expanded,
        visibleConversationIds,
        new Set(showAllConversationFolderIds)
      ),
    [shownRows, expanded, visibleConversationIds, showAllConversationFolderIds]
  )
  useEffect(() => {
    registerLiveSurfaceKeys("shelf", liveKeys)
    return () => registerLiveSurfaceKeys("shelf", new Set())
  }, [liveKeys, registerLiveSurfaceKeys])
  const moveTargets = rows.map((row) => ({
    id: row.folder.id,
    name: row.folder.name,
  }))

  return (
    <div
      data-testid="shelf-view"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <Button
          type="button"
          variant={showAll ? "ghost" : "secondary"}
          size="xs"
          aria-pressed={!showAll}
          onClick={() => {
            setVisibleIds(defaultVisibleFolderIds(rows))
            setShowAll(false)
          }}
        >
          {t("showWorkingProjects")}
        </Button>
        <Button
          type="button"
          variant={showAll ? "secondary" : "ghost"}
          size="xs"
          aria-pressed={showAll}
          onClick={() => setShowAll(true)}
        >
          {t("showAllProjects")}
        </Button>
      </div>
      {shownRows.map((row) => (
        <ShelfProjectRowView
          key={row.folder.id}
          row={row}
          collapsed={collapsed.has(row.folder.id)}
          expandedIds={expanded}
          visibleConversationIds={visibleConversationIds}
          showAllConversations={showAllConversationFolderIds.includes(
            row.folder.id
          )}
          moveTargets={moveTargets.filter((item) => item.id !== row.folder.id)}
          onToggleCollapsed={() =>
            setCollapsedFolderIds((ids) => toggleMember(ids, row.folder.id))
          }
          onToggleExpand={(conversationId) =>
            setExpandedIds((ids) => toggleMember(ids, conversationId))
          }
          onHideProjectFromShelf={() => {
            setVisibleIds(workingIds.filter((id) => id !== row.folder.id))
            setShowAll(false)
          }}
          onShowAllConversations={(showAllConversations) =>
            setShowAllConversationFolderIds((ids) =>
              showAllConversations
                ? ids.includes(row.folder.id)
                  ? ids
                  : [...ids, row.folder.id]
                : ids.filter((id) => id !== row.folder.id)
            )
          }
          onHideConversationFromShelf={(conversationId) =>
            setVisibleConversationIds(
              conversationWorkingIds.filter((id) => id !== conversationId)
            )
          }
          onAddConversationToShelf={(conversationId) =>
            setVisibleConversationIds(
              conversationWorkingIds.includes(conversationId)
                ? conversationWorkingIds
                : [...conversationWorkingIds, conversationId]
            )
          }
          onNewConversation={async () => {
            const id = await createConversation(
              row.folder.id,
              agentForFolder(row.folder.default_agent_type)
            )
            setVisibleConversationIds(
              conversationWorkingIds.includes(id)
                ? conversationWorkingIds
                : [...conversationWorkingIds, id]
            )
            setExpandedIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
            setCollapsedFolderIds((ids) =>
              ids.filter((item) => item !== row.folder.id)
            )
          }}
          onMove={async (conversationId, toFolderId) => {
            try {
              await moveConversation(conversationId, toFolderId)
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t("moveRunningBlocked")
              )
            }
          }}
        />
      ))}
    </div>
  )
}
