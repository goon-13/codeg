"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  useAcpActions,
  useConnectionStore,
} from "@/contexts/acp-connections-context"
import { moveConversation } from "@/lib/api"
import type { AgentType } from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { cn } from "@/lib/utils"

import { ShelfOutline } from "./shelf-outline"
import {
  applyShelfOrder,
  buildShelfRows,
  defaultVisibleConversationIds,
  defaultVisibleFolderIds,
  mergePersistedShelfOrder,
  moveShelfOrderId,
  recentShelfConversations,
  SHELF_RECENT_CHROME_HEIGHT,
  SHELF_RECENT_OPEN_HEIGHT,
  newShelfDraftNonce,
  intersectShelfLiveKeys,
  shelfDraftContextKey,
  shelfLiveSurfaceKeys,
  type ShelfOrderSnapshot,
  type ShelfProjectRow,
} from "./shelf-model"
import { ShelfProjectRowView } from "./shelf-project-row"
import { ShelfRecentRow } from "./shelf-recent-row"
import { jumpButtonsFromMetrics, type ShelfJumpButtons } from "./shelf-scroll"
import {
  ShelfComposerFocusProvider,
  useShelfComposerFocus,
} from "./shelf-session-card"
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
  return defaultAgent ?? "grok"
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

const EMPTY_JUMP: ShelfJumpButtons = { showTop: false, showBottom: false }

function ShelfHeldKeysRegistrar({
  mountedKeys,
}: {
  mountedKeys: ReadonlySet<string>
}) {
  const { liveKeys } = useShelfComposerFocus()
  const { registerLiveSurfaceKeys } = useAcpActions()
  useEffect(() => {
    const held = intersectShelfLiveKeys(liveKeys, mountedKeys)
    registerLiveSurfaceKeys("shelf", held)
    return () => registerLiveSurfaceKeys("shelf", new Set())
  }, [liveKeys, mountedKeys, registerLiveSurfaceKeys])
  return null
}

function ShelfAdoptLive({ mountedKeys }: { mountedKeys: ReadonlySet<string> }) {
  const { adopt } = useShelfComposerFocus()
  const connectionStore = useConnectionStore()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const alive: string[] = []
    for (const key of mountedKeys) {
      const status = connectionStore.getConnection(key)?.status
      if (
        status === "connected" ||
        status === "prompting" ||
        status === "connecting"
      ) {
        alive.push(key)
      }
    }
    if (alive.length > 0) adopt(alive)
  }, [adopt, connectionStore, mountedKeys])
  return null
}

export function ShelfView() {
  const t = useTranslations("Canvas")
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
    { folderId: number; nonce: string; agentType: AgentType }[]
  >([])
  const [draftContextByConversation, setDraftContextByConversation] = useState<
    Record<number, string>
  >({})
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [jump, setJump] = useState<ShelfJumpButtons>(EMPTY_JUMP)
  const [recentOpen, setRecentOpen] = useState(false)
  const outlineLayerRef = useRef<HTMLDivElement>(null)

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
  const recentConversations = useMemo(
    () => recentShelfConversations(conversations),
    [conversations]
  )

  const mountedKeys = useMemo(() => {
    const keys = shelfLiveSurfaceKeys(
      shownRows,
      expanded,
      visibleConversationIds
    )
    for (const draft of drafts) {
      keys.add(shelfDraftContextKey(draft.folderId, draft.nonce))
    }
    for (const key of Object.values(draftContextByConversation)) {
      keys.add(key)
    }
    return keys
  }, [
    shownRows,
    expanded,
    visibleConversationIds,
    drafts,
    draftContextByConversation,
  ])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const update = () => setJump(jumpButtonsFromMetrics(scroller))
    update()
    scroller.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
    observer?.observe(scroller)
    const content = scroller.firstElementChild
    if (content) observer?.observe(content)

    return () => {
      scroller.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
      observer?.disconnect()
    }
  }, [collapsedFolderIds, expandedIds, rows, visibleConversationIds, visibleIds])

  function setMembersAndUnfreeze(
    nextFolders: number[],
    nextConversations: number[]
  ) {
    snapshotRef.current = null
    setVisibleIds(nextFolders)
    setVisibleConversationIds(nextConversations)
  }

  function jumpToConversation(conversationId: number, folderId: number) {
    const nextFolders = workingIds.includes(folderId)
      ? workingIds
      : [...workingIds, folderId]
    const nextConversations = conversationWorkingIds.includes(conversationId)
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
  }

  return (
    <ShelfComposerFocusProvider>
      <ShelfHeldKeysRegistrar mountedKeys={mountedKeys} />
      <ShelfAdoptLive mountedKeys={mountedKeys} />
      <div
        data-testid="shelf-view"
        className="relative flex h-full min-h-0 flex-col bg-background"
      >
        <div
          data-testid="shelf-chrome"
          className={cn(
            "sticky top-0 z-20 flex shrink-0 items-stretch overflow-hidden border-b border-border bg-background",
            recentOpen ? "h-[112px]" : "h-[52px]"
          )}
        >
          <div
            data-testid="shelf-outline-anchor"
            className={cn(
              "relative z-30 flex w-[188px] shrink-0 overflow-visible border-r border-border bg-muted/30 px-3",
              recentOpen ? "items-start pt-1.5" : "items-center"
            )}
          >
            <ShelfOutline
              portalTarget={outlineLayerRef}
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
              onJumpConversation={jumpToConversation}
            />
          </div>
          <ShelfRecentRow
            conversations={recentConversations}
            onOpenConversation={jumpToConversation}
            onExpandedChange={setRecentOpen}
          />
        </div>
        <div
          ref={outlineLayerRef}
          data-testid="shelf-outline-layer"
          className="pointer-events-none absolute left-3 z-40"
          style={{
            top: recentOpen
              ? SHELF_RECENT_OPEN_HEIGHT
              : SHELF_RECENT_CHROME_HEIGHT,
          }}
        />
        <div
          ref={scrollerRef}
          data-testid="shelf-scroller"
          className="min-h-0 flex-1 overflow-y-auto"
        >
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
                          nonce: newShelfDraftNonce(),
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
                drafts.find((draft) => draft.folderId === row.folder.id) ??
                null
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
                setDraftContextByConversation((current) => {
                  const next = { ...current }
                  delete next[conversationId]
                  return next
                })
                setMembersAndUnfreeze(
                  workingIds,
                  conversationWorkingIds.includes(conversationId)
                    ? conversationWorkingIds
                    : [...conversationWorkingIds, conversationId]
                )
                setExpandedIds((ids) =>
                  ids.includes(conversationId)
                    ? ids
                    : [...ids, conversationId]
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
        <div
          data-testid="shelf-jump"
          className="pointer-events-none absolute bottom-3 left-0 z-10 flex w-[188px] justify-center gap-1"
        >
          {jump.showTop ? (
            <Button
              className="pointer-events-auto rounded-full bg-background/90 hover:bg-muted/90"
              onClick={() => {
                scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
              }}
              size="icon"
              type="button"
              variant="outline"
              aria-label={t("scrollToTop")}
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          ) : null}
          {jump.showBottom ? (
            <Button
              className="pointer-events-auto rounded-full bg-background/90 hover:bg-muted/90"
              onClick={() => {
                const scroller = scrollerRef.current
                if (!scroller) return
                scroller.scrollTo({
                  top: scroller.scrollHeight,
                  behavior: "smooth",
                })
              }}
              size="icon"
              type="button"
              variant="outline"
              aria-label={t("scrollToBottom")}
            >
              <ArrowDownIcon className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
    </ShelfComposerFocusProvider>
  )
}
