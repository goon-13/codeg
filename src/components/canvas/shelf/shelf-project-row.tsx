"use client"

import { useTranslations } from "next-intl"

import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
import { cn } from "@/lib/utils"

import type { ShelfProjectRow } from "./shelf-model"
import { ShelfSessionCard } from "./shelf-session-card"

interface ShelfProjectRowViewProps {
  row: ShelfProjectRow
  collapsed: boolean
  expandedIds: ReadonlySet<number>
  onToggleCollapsed: () => void
  onToggleExpand: (conversationId: number) => void
}

export function ShelfProjectRowView({
  row,
  collapsed,
  expandedIds,
  onToggleCollapsed,
  onToggleExpand,
}: ShelfProjectRowViewProps) {
  const t = useTranslations("Canvas")

  return (
    <div className="flex min-h-[148px] border-b border-border">
      <div className="w-[188px] shrink-0 border-r border-border bg-muted/30 p-3">
        <button
          type="button"
          className="block w-full truncate text-left text-sm font-semibold"
          aria-expanded={!collapsed}
          title={collapsed ? t("expandProject") : t("collapseProject")}
          onClick={onToggleCollapsed}
        >
          {row.folder.name}
        </button>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <ConversationStatusDot status="in_progress" size="sm" />
          {t("runningCount", { count: row.counts.running })}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <ConversationStatusDot status="pending_review" size="sm" />
          {t("waitingCount", { count: row.counts.waiting })}
        </p>
      </div>
      <div
        hidden={collapsed}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-2 overflow-x-auto overflow-y-hidden p-2.5",
          collapsed && "hidden"
        )}
      >
        {row.conversations.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {t("emptyRegion")}
          </p>
        ) : (
          row.conversations.map((conversation) => (
            <ShelfSessionCard
              key={conversation.id}
              conversation={conversation}
              expanded={expandedIds.has(conversation.id)}
              onToggleExpand={() => onToggleExpand(conversation.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
