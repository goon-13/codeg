"use client"

import { X } from "lucide-react"
import { useTranslations } from "next-intl"

import { AgentIcon } from "@/components/agent-icon"
import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
import { Button } from "@/components/ui/button"
import { formatConversationTitle } from "@/lib/conversation-title"
import type { ConversationStatus, DbConversationSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

import { CanvasConversationSurface } from "../canvas-conversation-surface"
import { shelfContextKey } from "./shelf-model"

// Same box as the board detail card. Duplicated so this file does not import
// canvas-model.
const SHELF_EXPANDED_WIDTH = 520
const SHELF_EXPANDED_HEIGHT = 560

interface ShelfSessionCardProps {
  conversation: DbConversationSummary
  expanded: boolean
  onToggleExpand: () => void
}

export function ShelfSessionCard({
  conversation,
  expanded,
  onToggleExpand,
}: ShelfSessionCardProps) {
  const t = useTranslations("Canvas")
  const status = conversation.status as ConversationStatus
  const running = status === "in_progress"
  const title = conversation.title
    ? formatConversationTitle(conversation.title)
    : t("untitled")

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggleExpand}
        className={cn(
          "flex w-[216px] h-[126px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card px-2.5 py-2 text-left transition-colors",
          "border-foreground/15 hover:border-foreground/30",
          running && "ring-1 ring-primary/30"
        )}
      >
        <span className="flex items-center gap-1.5">
          <AgentIcon
            agentType={conversation.agent_type}
            className="size-3.5 shrink-0"
          />
          <ConversationStatusDot
            status={status}
            size="sm"
            className={cn(running && "motion-safe:animate-pulse")}
          />
        </span>
        <span className="mt-1 line-clamp-3 text-[13px] font-medium leading-snug">
          {title}
        </span>
      </button>
    )
  }

  return (
    <div
      className="flex w-[520px] h-[560px] shrink-0 flex-col overflow-hidden rounded-xl border border-primary bg-card ring-2 ring-primary/25"
      style={{ width: SHELF_EXPANDED_WIDTH, height: SHELF_EXPANDED_HEIGHT }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-1.5">
        <AgentIcon
          agentType={conversation.agent_type}
          className="size-3.5 shrink-0"
        />
        <ConversationStatusDot
          status={status}
          size="sm"
          className={cn(running && "motion-safe:animate-pulse")}
        />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
          onClick={onToggleExpand}
        >
          {title}
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("closeExpanded")}
          onClick={onToggleExpand}
        >
          <X />
        </Button>
      </div>
      <CanvasConversationSurface
        key={conversation.id}
        contextKey={shelfContextKey(conversation.id)}
        conversationId={conversation.id}
        agentType={conversation.agent_type}
        isActive={expanded}
        className="min-h-0 flex-1"
      />
    </div>
  )
}
