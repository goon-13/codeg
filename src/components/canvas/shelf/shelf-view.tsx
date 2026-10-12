"use client"

import { useEffect, useMemo, useState } from "react"

import { useAppWorkspaceStore } from "@/stores/app-workspace-store"

import { buildShelfRows } from "./shelf-model"
import { ShelfProjectRowView } from "./shelf-project-row"
import {
  loadShelfCollapsedFolderIds,
  loadShelfExpandedConversationIds,
  saveShelfCollapsedFolderIds,
  saveShelfExpandedConversationIds,
} from "./shelf-storage"

function toggleMember(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]
}

export function ShelfView() {
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

  useEffect(() => {
    saveShelfExpandedConversationIds(expandedIds)
  }, [expandedIds])

  useEffect(() => {
    saveShelfCollapsedFolderIds(collapsedFolderIds)
  }, [collapsedFolderIds])

  const expanded = useMemo(() => new Set(expandedIds), [expandedIds])
  const collapsed = useMemo(
    () => new Set(collapsedFolderIds),
    [collapsedFolderIds]
  )

  return (
    <div
      data-testid="shelf-view"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background"
    >
      {rows.map((row) => (
        <ShelfProjectRowView
          key={row.folder.id}
          row={row}
          collapsed={collapsed.has(row.folder.id)}
          expandedIds={expanded}
          onToggleCollapsed={() =>
            setCollapsedFolderIds((ids) => toggleMember(ids, row.folder.id))
          }
          onToggleExpand={(conversationId) =>
            setExpandedIds((ids) => toggleMember(ids, conversationId))
          }
        />
      ))}
    </div>
  )
}
