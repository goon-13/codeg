"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { useAcpActions } from "@/contexts/acp-connections-context"
import { moveConversation } from "@/lib/api"
import type { AgentType } from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"

import { ShelfOutline } from "./shelf-outline"
import {
  applyShelfOrder,
  buildShelfRows,
  defaultVisibleConversationIds,
  defaultVisibleFolderIds,
  mergePersistedShelfOrder,
  moveShelfOrderId,
  shelfDraftContextKey,
  shelfLiveSurfaceKeys,
  type ShelfOrderSnapshot,
  type ShelfProjectRow,
} from "./shelf-model"
import { ShelfProjectRowView } from "./shelf-project-row"
import { ShelfComposerFocusProvider } from "./shelf-session-card"
import {
  loadShelfCollapsedFolderIds,
  loadShelfConversationOrder,
  loadShelfExpandedConversationIds,
  loadShelfFolderOrder,
  loadShelfVisibleConversationIds,
  loadShelfVisibleFolderIds,
  saveShelfCollapsedFolderIds,
  saveShelfConversationOrder,
  saveShelfExpandedConversationIds,
  saveShelfFolderOrder,
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

function scrollShelfTarget(selector: string) {
  document
    .querySelector(selector)
    ?.scrollIntoView({ block: "nearest", inline: "nearest" })
}

export function ShelfView() {
  const t = useTranslations("Canvas")
  const { registerLiveSurfaceKeys } = useAcpActions()
  const folders = useAppWorkspaceStore((s) => s.folders)
  const conversations = useAppWorkspaceStore((s) => s.conversations)
  const [folderOrder, setFolderOrder] = useState(loadShelfFolderOrder)
  const [conversationOrder, setConversationOrder] = useState(
    loadShelfConversationOrder
  )
  const liveRows = useMemo(
    () =>
      mergePersistedShelfOrder(
        buildShelfRows(folders, conversations),
        folderOrder,
        conversationOrder
      ),
    [folders, conversations, folderOrder, conversationOrder]
  )
  const snapshotRef = useRef<ShelfOrderSnapshot | null>(null)
  const rows = useMemo(() => {
    const applied = applyShelfOrder(liveRows, snapshotRef.current)
    snapshotRef.current = applied.snapshot
    return applied.rows
  }, [liveRows])
  const [expandedIds, setExpandedIds] = useState(
    loadShelfExpandedConversationIds
  )
  const [collapsedFolderIds, setCollapsedFolderIds] = useState(
    loadShelfCollapsedFolderIds
  )
  const [visibleIds, setVisibleIds] = useState<number[] | null>(
    loadShelfVisibleFolderIds
  )
  const [visibleConversationIds, setVisibleConversationIds] = useState<
    number[] | null
  >(loadShelfVisibleConversationIds)
  const [drafts, setDrafts] = useState<
    { folderId: number; agentType: AgentType }[]
  >([])
  const [draftContextByConversation, setDraftContextByConversation] = useState<
    Record<number, string>
  >({})

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
    saveShelfVisibleConversationIds(visibleConversationIds)
  }, [visibleConversationIds])

  useEffect(() => {
    saveShelfFolderOrder(folderOrder)
  }, [folderOrder])

  useEffect(() => {
    saveShelfConversationOrder(conversationOrder)
  }, [conversationOrder])

  const collapsingIdsRef = useRef(new Set<number>())
  const expanded = useMemo(() => new Set(expandedIds), [expandedIds])
  const collapsed = useMemo(
    () => new Set(collapsedFolderIds),
    [collapsedFolderIds]
  )
  const workingIds = visibleIds ?? defaultVisibleFolderIds(rows)
  const shownRows = rows.filter((row) => workingIds.includes(row.folder.id))
  const conversationWorkingIds = workingConversationIds(
    rows,
    visibleConversationIds
  )
  const moveTargets = rows.map((row) => ({
    id: row.folder.id,
    name: row.folder.name,
  }))

  useEffect(() => {
    const keys = shelfLiveSurfaceKeys(
      shownRows,
      expanded,
      visibleConversationIds
    )
    for (const draft of drafts) {
      keys.add(shelfDraftContextKey(draft.folderId))
    }
    for (const key of Object.values(draftContextByConversation)) {
      keys.add(key)
    }
    registerLiveSurfaceKeys("shelf", keys)
    return () => registerLiveSurfaceKeys("shelf", new Set())
  }, [
    shownRows,
    expanded,
    visibleConversationIds,
    drafts,
    draftContextByConversation,
    registerLiveSurfaceKeys,
  ])

  function setMembersAndUnfreeze(
    nextFolders: number[],
    nextConversations: number[]
  ) {
    snapshotRef.current = null
    setVisibleIds(nextFolders)
    setVisibleConversationIds(nextConversations)
  }

  return (
    <ShelfComposerFocusProvider>
    <div
      data-testid="shelf-view"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <ShelfOutline
          rows={rows}
          visibleFolderIds={workingIds}
          visibleConversationIds={conversationWorkingIds}
          folderOrder={folderOrder ?? shownRows.map((row) => row.folder.id)}
          conversationOrderByFolder={conversationOrder ?? {}}
          onToggleFolder={(folderId) => {
            setMembersAndUnfreeze(
              toggleMember(workingIds, folderId),
              conversationWorkingIds
            )
          }}
          onToggleConversation={(conversationId) => {
            setMembersAndUnfreeze(
              workingIds,
              toggleMember(conversationWorkingIds, conversationId)
            )
          }}
          onMoveFolder={(folderId, delta) => {
            snapshotRef.current = null
            setFolderOrder(
              moveShelfOrderId(
                shownRows.map((row) => row.folder.id),
                folderId,
                delta
              )
            )
          }}
          onMoveConversation={(conversationId, folderId, delta) => {
            const row = shownRows.find((item) => item.folder.id === folderId)
            if (!row) return
            snapshotRef.current = null
            const current =
              conversationOrder?.[folderId] ??
              row.conversations
                .filter((item) => conversationWorkingIds.includes(item.id))
                .map((item) => item.id)
            setConversationOrder({
              ...(conversationOrder ?? {}),
              [folderId]: moveShelfOrderId(current, conversationId, delta),
            })
          }}
          onJumpFolder={(folderId) => {
            if (!workingIds.includes(folderId)) {
              setMembersAndUnfreeze(
                [...workingIds, folderId],
                conversationWorkingIds
              )
            }
            requestAnimationFrame(() =>
              scrollShelfTarget(`[data-shelf-folder="${folderId}"]`)
            )
          }}
          onJumpConversation={(conversationId, folderId) => {
            const nextFolders = workingIds.includes(folderId)
              ? workingIds
              : [...workingIds, folderId]
            const nextConversations = conversationWorkingIds.includes(
              conversationId
            )
              ? conversationWorkingIds
              : [...conversationWorkingIds, conversationId]
            if (
              nextFolders !== workingIds ||
              nextConversations !== conversationWorkingIds
            ) {
              setMembersAndUnfreeze(nextFolders, nextConversations)
            }
            setExpandedIds((ids) =>
              ids.includes(conversationId) ? ids : [...ids, conversationId]
            )
            requestAnimationFrame(() =>
              scrollShelfTarget(`[data-shelf-card="${conversationId}"]`)
            )
          }}
        />
      </div>
      {shownRows.map((row) => (
        <ShelfProjectRowView
          key={row.folder.id}
          row={row}
          collapsed={collapsed.has(row.folder.id)}
          expandedIds={expanded}
          visibleConversationIds={visibleConversationIds}
          moveTargets={moveTargets.filter((item) => item.id !== row.folder.id)}
          onToggleCollapsed={() =>
            setCollapsedFolderIds((ids) => toggleMember(ids, row.folder.id))
          }
          onToggleExpand={(conversationId) =>
            setExpandedIds((ids) => {
              if (ids.includes(conversationId)) {
                collapsingIdsRef.current.add(conversationId)
                queueMicrotask(() => {
                  collapsingIdsRef.current.delete(conversationId)
                })
              }
              return toggleMember(ids, conversationId)
            })
          }
          isTransientUnmount={(conversationId) =>
            collapsingIdsRef.current.has(conversationId)
          }
          onHideProjectFromShelf={() => {
            setMembersAndUnfreeze(
              workingIds.filter((id) => id !== row.folder.id),
              conversationWorkingIds
            )
          }}
          onHideConversationFromShelf={(conversationId) =>
            setMembersAndUnfreeze(
              workingIds,
              conversationWorkingIds.filter((id) => id !== conversationId)
            )
          }
          onAddConversationToShelf={(conversationId) =>
            setMembersAndUnfreeze(
              workingIds,
              conversationWorkingIds.includes(conversationId)
                ? conversationWorkingIds
                : [...conversationWorkingIds, conversationId]
            )
          }
          onNewConversation={() => {
            setDrafts((current) =>
              current.some((draft) => draft.folderId === row.folder.id)
                ? current
                : [
                    ...current,
                    {
                      folderId: row.folder.id,
                      agentType: agentForFolder(
                        row.folder.default_agent_type
                      ),
                    },
                  ]
            )
            setCollapsedFolderIds((ids) =>
              ids.filter((item) => item !== row.folder.id)
            )
          }}
          draft={
            drafts.find((draft) => draft.folderId === row.folder.id) ?? null
          }
          onDraftAgentChange={(agentType) =>
            setDrafts((current) =>
              current.map((draft) =>
                draft.folderId === row.folder.id
                  ? { ...draft, agentType }
                  : draft
              )
            )
          }
          onDiscardDraft={() =>
            setDrafts((current) =>
              current.filter((draft) => draft.folderId !== row.folder.id)
            )
          }
          onDraftCreated={(conversationId, folderId) => {
            setDrafts((current) =>
              current.filter((draft) => draft.folderId !== folderId)
            )
            setDraftContextByConversation((current) => ({
              ...current,
              [conversationId]: shelfDraftContextKey(folderId),
            }))
            setMembersAndUnfreeze(
              workingIds,
              conversationWorkingIds.includes(conversationId)
                ? conversationWorkingIds
                : [...conversationWorkingIds, conversationId]
            )
            setExpandedIds((ids) =>
              ids.includes(conversationId) ? ids : [...ids, conversationId]
            )
          }}
          contextKeys={draftContextByConversation}
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
    </ShelfComposerFocusProvider>
  )
}
