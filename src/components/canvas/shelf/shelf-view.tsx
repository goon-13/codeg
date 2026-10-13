"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { createConversation, moveConversation } from "@/lib/api"
import type { AgentType } from "@/lib/types"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"

import {
  buildShelfRows,
  defaultVisibleConversationIds,
  defaultVisibleFolderIds,
  type ShelfProjectRow,
} from "./shelf-model"
import { ShelfProjectRowView } from "./shelf-project-row"
import { jumpButtonsFromMetrics, type ShelfJumpButtons } from "./shelf-scroll"
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

const EMPTY_JUMP: ShelfJumpButtons = { showTop: false, showBottom: false }

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
  const workingIds = visibleIds ?? defaultVisibleFolderIds(rows)
  const shownRows = showAll
    ? rows
    : rows.filter((row) => workingIds.includes(row.folder.id))
  const conversationWorkingIds = workingConversationIds(
    rows,
    visibleConversationIds
  )
  const moveTargets = rows.map((row) => ({
    id: row.folder.id,
    name: row.folder.name,
  }))

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
    showAll,
    showAllConversationFolderIds,
    visibleConversationIds,
    visibleIds,
  ])

  return (
    <div
      data-testid="shelf-view"
      className="relative flex h-full min-h-0 flex-col bg-background"
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
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          data-testid="shelf-scroller"
          className="h-full overflow-y-auto"
        >
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
              moveTargets={moveTargets.filter(
                (item) => item.id !== row.folder.id
              )}
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
        <div
          data-testid="shelf-jump"
          className="pointer-events-none absolute bottom-3 left-0 z-10 grid w-[188px] grid-cols-2"
        >
          <div className="flex justify-center">
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
          </div>
          <div className="flex justify-center">
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
      </div>
    </div>
  )
}
