"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, ListTree } from "lucide-react"
import { useTranslations } from "next-intl"

import { AgentIcon } from "@/components/agent-icon"
import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
import { Button } from "@/components/ui/button"
import { formatConversationTitle } from "@/lib/conversation-title"
import type { ConversationStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

import { filterShelfMiniRows, type ShelfProjectRow } from "./shelf-model"

const MOVE_BUTTON_CLASS = cn(
  "flex size-5 shrink-0 items-center justify-center rounded-[0.375rem]",
  "text-muted-foreground outline-none",
  "transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground",
  "disabled:pointer-events-none disabled:opacity-25"
)

function conversationTitle(
  title: string | null,
  untitled: string
): string {
  return title ? formatConversationTitle(title) : untitled
}

export function ShelfOutline({
  rows,
  visibleFolderIds,
  visibleConversationIds,
  folderOrder,
  conversationOrderByFolder,
  onToggleFolder,
  onToggleConversation,
  onMoveFolder,
  onMoveConversation,
  onJumpFolder,
  onJumpConversation,
  portalTarget,
}: {
  rows: ShelfProjectRow[]
  visibleFolderIds: number[]
  visibleConversationIds: number[]
  folderOrder: number[]
  conversationOrderByFolder: Record<number, number[]>
  onToggleFolder: (folderId: number) => void
  onToggleConversation: (conversationId: number, folderId: number) => void
  onMoveFolder: (folderId: number, delta: number) => void
  onMoveConversation: (
    conversationId: number,
    folderId: number,
    delta: number
  ) => void
  onJumpFolder: (folderId: number) => void
  onJumpConversation: (conversationId: number, folderId: number) => void
  portalTarget?: RefObject<HTMLElement | null>
}) {
  const t = useTranslations("Canvas")
  const untitled = t("untitled")
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [jumpedId, setJumpedId] = useState<number | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(
    () => new Set()
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target
      if (!(node instanceof Node)) return
      if (rootRef.current?.contains(node)) return
      if (panelRef.current?.contains(node)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])
  const folderSet = new Set(visibleFolderIds)
  const conversationSet = new Set(visibleConversationIds)
  const visibleRows = useMemo(
    () => filterShelfMiniRows(rows, query),
    [rows, query]
  )
  const folderIds = folderOrder.length
    ? folderOrder.filter((id) => rows.some((item) => item.folder.id === id))
    : rows.map((item) => item.folder.id)

  function mountPanel(panel: ReactNode) {
    const target = portalTarget?.current
    return target ? createPortal(panel, target) : panel
  }

  return (
    <div ref={rootRef} className="flex flex-col items-start">
      <Button
        type="button"
        variant="outline"
        size="xs"
        data-testid="shelf-outline-trigger"
        aria-expanded={open}
        aria-label={t("shelfOutlineSummary", {
          projects: visibleFolderIds.length,
          sessions: visibleConversationIds.length,
        })}
        className="gap-1.5 rounded-full bg-background/90 text-[0.8125rem] hover:bg-muted/90"
        onClick={() => setOpen((value) => !value)}
      >
        <ListTree className="size-3.5 text-muted-foreground" />
        {t("shelfOutlineShort")}
        <span className="tabular-nums text-muted-foreground">
          {visibleFolderIds.length}·{visibleConversationIds.length}
        </span>
      </Button>
      {open
        ? mountPanel(
      <div
        ref={panelRef}
        data-testid="shelf-outline-panel"
        className="pointer-events-auto mt-1.5 w-[24rem] max-h-[min(36rem,70vh)] overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
      >
        <div className="border-b border-border px-3 py-2">
          <input
            type="search"
            value={query}
            placeholder={t("shelfOutlineTitle")}
            className="h-8 w-full rounded-lg bg-foreground/5 px-2.5 text-[0.8125rem] outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {visibleRows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[0.8125rem] text-muted-foreground">
              {t("shelfOutlineEmpty")}
            </p>
          ) : (
            visibleRows.map((row) => {
              const folderOn = folderSet.has(row.folder.id)
              const folderPos = folderIds.indexOf(row.folder.id)
              const convIds =
                conversationOrderByFolder[row.folder.id] ??
                row.conversations.map((item) => item.id)
              return (
                <div
                  key={row.folder.id}
                  data-testid={`shelf-mini-row-${row.folder.id}`}
                  className="mb-2 last:mb-0"
                >
                  <div
                    className={cn(
                      "flex items-center gap-1.5 px-1 py-1",
                      !folderOn && "opacity-50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={folderOn}
                      aria-label={row.folder.name}
                      className="size-3.5 accent-primary"
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => onToggleFolder(row.folder.id)}
                    />
                    <button
                      type="button"
                      data-testid={`shelf-outline-title-folder-${row.folder.id}`}
                      className="min-w-0 flex-1 truncate text-left text-[0.8125rem] font-medium"
                      onClick={() => {
                        setJumpedId(null)
                        onJumpFolder(row.folder.id)
                      }}
                    >
                      {row.folder.name}
                    </button>
                    <span className="text-[0.625rem] tabular-nums text-muted-foreground">
                      {row.counts.running}/{row.counts.waiting}
                    </span>
                    <button
                      type="button"
                      aria-label={t("shelfMoveUp")}
                      className={MOVE_BUTTON_CLASS}
                      disabled={folderPos <= 0}
                      onClick={(event) => {
                        event.stopPropagation()
                        onMoveFolder(row.folder.id, -1)
                      }}
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("shelfMoveDown")}
                      className={MOVE_BUTTON_CLASS}
                      disabled={
                        folderPos < 0 || folderPos >= folderIds.length - 1
                      }
                      onClick={(event) => {
                        event.stopPropagation()
                        onMoveFolder(row.folder.id, 1)
                      }}
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>
                  <div className="relative">
                  <div
                    data-testid={`shelf-mini-track-${row.folder.id}`}
                    className={cn(
                      "gap-1.5 px-1 pb-1",
                      expandedFolders.has(row.folder.id)
                        ? "grid grid-cols-3 overflow-visible"
                        : "flex overflow-x-auto"
                    )}
                  >
                    {row.conversations.map((conversation) => {
                      const on = conversationSet.has(conversation.id)
                      const status = conversation.status as ConversationStatus
                      const running = status === "in_progress"
                      const title = conversationTitle(
                        conversation.title,
                        untitled
                      )
                      const convPos = convIds.indexOf(conversation.id)
                      const jumped = jumpedId === conversation.id
                      const miniOpen = expandedFolders.has(row.folder.id)
                      return (
                        <div
                          key={conversation.id}
                          data-testid={`shelf-mini-card-${conversation.id}`}
                          className={cn(
                            "group relative h-[4.5rem] overflow-hidden rounded-lg border bg-card p-1.5",
                            miniOpen ? "min-w-0 w-auto" : "w-[7rem] shrink-0",
                            on
                              ? "border-foreground/15 hover:border-foreground/30"
                              : "border-foreground/10 opacity-50",
                            jumped && "border-primary ring-2 ring-primary/25"
                          )}
                          onKeyDown={(event) => {
                            if (!event.altKey) return
                            if (event.key === "ArrowUp") {
                              event.preventDefault()
                              onMoveConversation(
                                conversation.id,
                                row.folder.id,
                                -1
                              )
                            }
                            if (event.key === "ArrowDown") {
                              event.preventDefault()
                              onMoveConversation(
                                conversation.id,
                                row.folder.id,
                                1
                              )
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            aria-label={title}
                            className="absolute top-1 right-1 size-3 accent-primary"
                            onClick={(event) => event.stopPropagation()}
                            onChange={() =>
                              onToggleConversation(
                                conversation.id,
                                row.folder.id
                              )
                            }
                          />
                          <div className="flex items-center gap-1 pr-4">
                            <ConversationStatusDot
                              status={status}
                              size="sm"
                              title={status}
                              className={cn(
                                running && "motion-safe:animate-pulse"
                              )}
                            />
                            <AgentIcon
                              agentType={conversation.agent_type}
                              className="size-3 shrink-0"
                            />
                          </div>
                          <button
                            type="button"
                            data-testid={`shelf-outline-title-conversation-${conversation.id}`}
                            className="mt-1 line-clamp-2 w-full pr-3.5 text-left text-[0.6875rem] leading-tight"
                            onClick={() => {
                              setJumpedId(conversation.id)
                              onJumpConversation(
                                conversation.id,
                                row.folder.id
                              )
                            }}
                          >
                            {title}
                          </button>
                          <div className="absolute bottom-0.5 left-0.5 flex flex-col opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                            <button
                              type="button"
                              aria-label={t("shelfMoveUp")}
                              className={MOVE_BUTTON_CLASS}
                              disabled={convPos <= 0}
                              onClick={(event) => {
                                event.stopPropagation()
                                onMoveConversation(
                                  conversation.id,
                                  row.folder.id,
                                  -1
                                )
                              }}
                            >
                              <ChevronUp className="size-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={t("shelfMoveDown")}
                              className={MOVE_BUTTON_CLASS}
                              disabled={
                                convPos < 0 || convPos >= convIds.length - 1
                              }
                              onClick={(event) => {
                                event.stopPropagation()
                                onMoveConversation(
                                  conversation.id,
                                  row.folder.id,
                                  1
                                )
                              }}
                            >
                              <ChevronDown className="size-3" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {row.conversations.length > 3 ? (
                    <button
                      type="button"
                      data-testid={`shelf-mini-expand-${row.folder.id}`}
                      aria-label={
                        expandedFolders.has(row.folder.id)
                          ? t("shelfMiniCollapse")
                          : t("shelfMiniExpand")
                      }
                      className={cn(
                        MOVE_BUTTON_CLASS,
                        "absolute top-0 right-1 z-10 bg-popover"
                      )}
                      onClick={(event) => {
                        event.stopPropagation()
                        setExpandedFolders((current) => {
                          const next = new Set(current)
                          if (next.has(row.folder.id)) next.delete(row.folder.id)
                          else next.add(row.folder.id)
                          return next
                        })
                      }}
                    >
                      {expandedFolders.has(row.folder.id) ? (
                        <ChevronsUp className="size-3.5" />
                      ) : (
                        <ChevronsDown className="size-3.5" />
                      )}
                    </button>
                  ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
        )
        : null}
    </div>
  )
}
