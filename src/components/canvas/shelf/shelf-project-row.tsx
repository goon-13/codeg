"use client"

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
import { cn } from "@/lib/utils"

import {
  visibleShelfConversations,
  type ShelfProjectRow,
} from "./shelf-model"
import { ShelfSessionCard } from "./shelf-session-card"

interface MoveTarget {
  id: number
  name: string
}

interface ShelfProjectRowViewProps {
  row: ShelfProjectRow
  collapsed: boolean
  expandedIds: ReadonlySet<number>
  visibleConversationIds: number[] | null
  showAllConversations: boolean
  moveTargets: MoveTarget[]
  onToggleCollapsed: () => void
  onToggleExpand: (conversationId: number) => void
  onHideProjectFromShelf: () => void
  onShowAllConversations: (showAll: boolean) => void
  onHideConversationFromShelf: (conversationId: number) => void
  onAddConversationToShelf: (conversationId: number) => void
  onNewConversation: () => void | Promise<void>
  onMove: (conversationId: number, toFolderId: number) => void | Promise<void>
}

export function ShelfProjectRowView({
  row,
  collapsed,
  expandedIds,
  visibleConversationIds,
  showAllConversations,
  moveTargets,
  onToggleCollapsed,
  onToggleExpand,
  onHideProjectFromShelf,
  onShowAllConversations,
  onHideConversationFromShelf,
  onAddConversationToShelf,
  onNewConversation,
  onMove,
}: ShelfProjectRowViewProps) {
  const t = useTranslations("Canvas")
  const shown = visibleShelfConversations(
    row.conversations,
    visibleConversationIds,
    showAllConversations
  )
  const shelfIds = new Set(
    visibleShelfConversations(row.conversations, visibleConversationIds, false).map(
      (c) => c.id
    )
  )
  const hasExpanded = shown.some((c) => expandedIds.has(c.id))

  return (
    <div
      data-testid="shelf-row"
      className={cn(
        "flex shrink-0 items-stretch border-b border-border",
        hasExpanded ? "min-h-[560px]" : "min-h-[148px]"
      )}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const raw = event.dataTransfer.getData("application/x-codeg-conversation")
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
            <div className="mt-2 flex flex-wrap gap-1">
              <Button
                type="button"
                variant={showAllConversations ? "ghost" : "secondary"}
                size="xs"
                aria-pressed={!showAllConversations}
                onClick={() => onShowAllConversations(false)}
              >
                {t("showShelfConversations")}
              </Button>
              <Button
                type="button"
                variant={showAllConversations ? "secondary" : "ghost"}
                size="xs"
                aria-pressed={showAllConversations}
                onClick={() => onShowAllConversations(true)}
              >
                {t("showAllSessions")}
              </Button>
            </div>
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
        hidden={collapsed}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 items-start gap-2 overflow-x-auto p-2.5",
          collapsed && "hidden"
        )}
      >
        {shown.map((conversation) => (
          <ShelfSessionCard
            key={conversation.id}
            conversation={conversation}
            expanded={expandedIds.has(conversation.id)}
            onShelf={shelfIds.has(conversation.id)}
            moveTargets={moveTargets}
            onToggleExpand={() => onToggleExpand(conversation.id)}
            onMove={(toFolderId) => void onMove(conversation.id, toFolderId)}
            onHideFromShelf={() => onHideConversationFromShelf(conversation.id)}
            onAddToShelf={() => onAddConversationToShelf(conversation.id)}
          />
        ))}
        {shown.length === 0 ? (
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
