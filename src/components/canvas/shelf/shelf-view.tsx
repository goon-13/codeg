"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAcpActions } from "@/contexts/acp-connections-context"
import { createConversation, moveConversation } from "@/lib/api"
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
  shelfLiveSurfaceKeys,
  type ShelfOrderSnapshot,
  type ShelfProjectRow,
} from "./shelf-model"
import { ShelfProjectRowView } from "./shelf-project-row"
import { jumpButtonsFromMetrics, type ShelfJumpButtons } from "./shelf-scroll"
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

const EMPTY_JUMP: ShelfJumpButtons = { showTop: false, showBottom: false }

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
  const [surfaceByCard, setSurfaceByCard] = useState<Record<number, number>>({})
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [jump, setJump] = useState<ShelfJumpButtons>(EMPTY_JUMP)

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
  const pendingShelfScrollId = useRef<number | null>(null)
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
      visibleConversationIds,
      surfaceByCard
    )
    registerLiveSurfaceKeys("shelf", keys)
    return () => registerLiveSurfaceKeys("shelf", new Set())
  }, [
    shownRows,
    expanded,
    visibleConversationIds,
    surfaceByCard,
    registerLiveSurfaceKeys,
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
  }, [
    collapsedFolderIds,
    expandedIds,
    rows,
    visibleConversationIds,
    visibleIds,
  ])

  const setMembersAndUnfreeze = useCallback(
    (nextFolders: number[], nextConversations: number[]) => {
      snapshotRef.current = null
      setVisibleIds(nextFolders)
      setVisibleConversationIds(nextConversations)
    },
    []
  )

  const revealConversation = useCallback(
    (conversationId: number, folderId: number, afterId?: number) => {
      const nextFolders = workingIds.includes(folderId)
        ? workingIds
        : [...workingIds, folderId]
      const nextConversations = conversationWorkingIds.includes(conversationId)
        ? conversationWorkingIds
        : [...conversationWorkingIds, conversationId]
      if (nextFolders !== workingIds) {
        setVisibleIds(nextFolders)
      }
      if (nextConversations !== conversationWorkingIds) {
        setVisibleConversationIds(nextConversations)
      }
      setConversationOrder((prev) => {
        const current =
          prev?.[folderId] ??
          rows
            .find((row) => row.folder.id === folderId)
            ?.conversations.map((c) => c.id) ??
          []
        if (current.includes(conversationId)) return prev
        const idx = afterId != null ? current.indexOf(afterId) : -1
        const nextIds =
          idx >= 0
            ? [
                ...current.slice(0, idx + 1),
                conversationId,
                ...current.slice(idx + 1),
              ]
            : [...current, conversationId]
        const snap = snapshotRef.current
        if (snap) {
          snapshotRef.current = {
            ...snap,
            conversationIdsByFolder: {
              ...snap.conversationIdsByFolder,
              [folderId]: nextIds,
            },
          }
        }
        return { ...(prev ?? {}), [folderId]: nextIds }
      })
      setExpandedIds([conversationId])
      pendingShelfScrollId.current = conversationId
    },
    [conversationWorkingIds, rows, workingIds]
  )

  const backToSource = useCallback((cardId: number) => {
    setSurfaceByCard((prev) => {
      if (!(cardId in prev)) return prev
      const next = { ...prev }
      delete next[cardId]
      return next
    })
  }, [])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          conversationId?: unknown
          folderId?: unknown
          afterId?: unknown
        }>
      ).detail
      if (detail == null || typeof detail !== "object") return
      const { conversationId, folderId, afterId } = detail
      if (
        typeof conversationId !== "number" ||
        typeof folderId !== "number" ||
        !Number.isInteger(conversationId) ||
        !Number.isInteger(folderId)
      ) {
        return
      }
      revealConversation(
        conversationId,
        folderId,
        typeof afterId === "number" ? afterId : undefined
      )
    }
    window.addEventListener("codeg:shelf-open-conversation", onOpen)
    return () =>
      window.removeEventListener("codeg:shelf-open-conversation", onOpen)
  }, [revealConversation])

  useEffect(() => {
    const onSide = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          sourceId?: unknown
          sideId?: unknown
          folderId?: unknown
        }>
      ).detail
      if (detail == null || typeof detail !== "object") return
      const { sourceId, sideId, folderId } = detail
      if (
        typeof sourceId !== "number" ||
        typeof sideId !== "number" ||
        typeof folderId !== "number" ||
        !Number.isInteger(sourceId) ||
        !Number.isInteger(sideId) ||
        !Number.isInteger(folderId)
      ) {
        return
      }
      setSurfaceByCard((prev) => ({ ...prev, [sourceId]: sideId }))
      revealConversation(sourceId, folderId)
    }
    window.addEventListener("codeg:shelf-open-side", onSide)
    return () => window.removeEventListener("codeg:shelf-open-side", onSide)
  }, [revealConversation])

  useLayoutEffect(() => {
    const id = pendingShelfScrollId.current
    if (id == null) return
    const node = document.querySelector(`[data-shelf-card="${id}"]`)
    if (!node) return
    node.scrollIntoView({ block: "nearest", inline: "center" })
    pendingShelfScrollId.current = null
  }, [
    collapsedFolderIds,
    expandedIds,
    rows,
    visibleConversationIds,
    visibleIds,
  ])

  return (
    <ShelfComposerFocusProvider>
      <div
        data-testid="shelf-view"
        className="relative flex h-full min-h-0 flex-col bg-background"
      >
        <div className="flex min-h-0 flex-1">

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
            onJumpConversation={revealConversation}
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
                surfaceByCard={surfaceByCard}
                onBackToSource={backToSource}
                moveTargets={moveTargets.filter(
                  (item) => item.id !== row.folder.id
                )}
                onToggleCollapsed={() =>
                  setCollapsedFolderIds((ids) =>
                    toggleMember(ids, row.folder.id)
                  )
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
                onNewConversation={async () => {
                  const id = await createConversation(
                    row.folder.id,
                    agentForFolder(row.folder.default_agent_type)
                  )
                  setMembersAndUnfreeze(
                    workingIds,
                    conversationWorkingIds.includes(id)
                      ? conversationWorkingIds
                      : [...conversationWorkingIds, id]
                  )
                  setExpandedIds((ids) =>
                    ids.includes(id) ? ids : [...ids, id]
                  )
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
        </div>
        <div
          data-testid="shelf-jump"
          className="pointer-events-none absolute bottom-3 left-12 z-10 flex w-[188px] justify-center gap-1"
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
