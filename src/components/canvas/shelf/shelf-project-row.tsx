"use client"

import { useEffect, useRef } from "react"
import { Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"

import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { AgentType } from "@/lib/types"
import { cn } from "@/lib/utils"

import { visibleShelfConversations, type ShelfProjectRow } from "./shelf-model"
import { horizontalWheelDelta, isNestedVerticalScroller } from "./shelf-scroll"
import { ShelfDraftCard, ShelfSessionCard } from "./shelf-session-card"

interface MoveTarget {
  id: number
  name: string
}

interface ShelfProjectRowViewProps {
  row: ShelfProjectRow
  collapsed: boolean
  expandedIds: ReadonlySet<number>
  visibleConversationIds: number[] | null
  moveTargets: MoveTarget[]
  onToggleCollapsed: () => void
  onToggleExpand: (conversationId: number) => void
  onHideProjectFromShelf: () => void
  onHideConversationFromShelf: (conversationId: number) => void
  onAddConversationToShelf: (conversationId: number) => void
  onNewConversation: () => void | Promise<void>
  onMove: (conversationId: number, toFolderId: number) => void | Promise<void>
  isTransientUnmount?: (conversationId: number) => boolean
  draft?: { agentType: AgentType; nonce: string } | null
  onDraftAgentChange?: (agentType: AgentType) => void
  onDiscardDraft?: () => void
  onDraftCreated?: (conversationId: number, folderId: number) => void
  contextKeys?: Record<number, string>
}

export function ShelfProjectRowView({
  row,
  collapsed,
  expandedIds,
  visibleConversationIds,
  moveTargets,
  onToggleCollapsed,
  onToggleExpand,
  onHideProjectFromShelf,
  onHideConversationFromShelf,
  onAddConversationToShelf,
  onNewConversation,
  onMove,
  isTransientUnmount,
  draft,
  onDraftAgentChange,
  onDiscardDraft,
  onDraftCreated,
  contextKeys,
}: ShelfProjectRowViewProps) {
  const t = useTranslations("Canvas")
  const filmRef = useRef<HTMLDivElement>(null)
  const shown = visibleShelfConversations(
    row.conversations,
    visibleConversationIds,
    false
  )
  const shelfIds = new Set(
    visibleShelfConversations(
      row.conversations,
      visibleConversationIds,
      false
    ).map((c) => c.id)
  )
  const hasExpanded =
    shown.some((c) => expandedIds.has(c.id)) || Boolean(draft)

  useEffect(() => {
    const el = filmRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      const delta = horizontalWheelDelta({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        nestedVerticalScrollable: isNestedVerticalScroller(event.target, el),
      })
      if (delta == null) return
      event.preventDefault()
      el.scrollLeft += delta
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  return (
    <div
      data-testid="shelf-row"
      data-shelf-folder={row.folder.id}
      className={cn(
        "flex shrink-0 items-stretch border-b border-border",
        hasExpanded ? "min-h-[560px]" : "min-h-[148px]"
      )}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const raw = event.dataTransfer.getData(
          "application/x-codeg-conversation"
        )
        const conversationId = Number(raw)
        if (!Number.isInteger(conversationId) || conversationId <= 0) return
        if (row.conversations.some((item) => item.id === conversationId)) return
        void onMove(conversationId, row.folder.id)
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex w-[188px] shrink-0 flex-col border-r border-border bg-muted/30 p-3">
            <div className="flex items-start gap-1">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                aria-expanded={!collapsed}
                title={collapsed ? t("expandProject") : t("collapseProject")}
                onClick={onToggleCollapsed}
              >
                {row.folder.name}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                aria-label={t("hideProjectFromShelf")}
                onClick={onHideProjectFromShelf}
              >
                <X />
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <ConversationStatusDot status="in_progress" size="sm" />
              {t("runningCount", { count: row.counts.running })}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <ConversationStatusDot status="pending_review" size="sm" />
              {t("waitingCount", { count: row.counts.waiting })}
            </p>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => void onNewConversation()}>
            {t("newInProject")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={onHideProjectFromShelf}>
            {t("hideProjectFromShelf")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <div
        ref={filmRef}
        hidden={collapsed}
        data-testid="shelf-row-cards"
        className={cn(
          // overflow-y-hidden must be explicit: overflow-x-auto otherwise
          // computes overflow-y to auto, and StickToBottom's height:100%
          // transcript viewport collapses to 0 inside that nested scroller.
          "flex min-h-0 min-w-0 flex-1 items-start gap-2 overflow-x-auto overflow-y-hidden p-2.5",
          collapsed && "hidden"
        )}
      >
        {draft && onDraftAgentChange && onDiscardDraft && onDraftCreated ? (
          <ShelfDraftCard
            folderId={row.folder.id}
            folderPath={row.folder.path}
            nonce={draft.nonce}
            agentType={draft.agentType}
            onAgentTypeChange={onDraftAgentChange}
            onDiscard={onDiscardDraft}
            onCreated={onDraftCreated}
          />
        ) : null}
        {shown.map((conversation) => (
          <ShelfSessionCard
            key={conversation.id}
            conversation={conversation}
            expanded={expandedIds.has(conversation.id)}
            onShelf={shelfIds.has(conversation.id)}
            moveTargets={moveTargets}
            contextKey={contextKeys?.[conversation.id]}
            onToggleExpand={() => onToggleExpand(conversation.id)}
            onMove={(toFolderId) => void onMove(conversation.id, toFolderId)}
            onHideFromShelf={() => onHideConversationFromShelf(conversation.id)}
            onAddToShelf={() => onAddConversationToShelf(conversation.id)}
            isTransientUnmount={
              isTransientUnmount
                ? () => isTransientUnmount(conversation.id)
                : undefined
            }
          />
        ))}
        {shown.length === 0 && !draft ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {t("emptyRegion")}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="mt-1 shrink-0"
          aria-label={t("newInProject")}
          onClick={() => void onNewConversation()}
        >
          <Plus />
          {t("newInProject")}
        </Button>
      </div>
    </div>
  )
}
