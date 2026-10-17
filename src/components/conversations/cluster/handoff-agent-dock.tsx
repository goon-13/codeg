"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"
import { AgentIcon } from "@/components/agent-icon"
import { shelfContextKey } from "@/components/canvas/shelf/shelf-model"
import { loadCanvasLayoutMode } from "@/components/canvas/shelf/shelf-storage"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAcpAgents } from "@/hooks/use-acp-agents"
import {
  compareAgentType,
  type AgentType,
  type DbConversationSummary,
} from "@/lib/types"
import { getAgentLabel } from "@/lib/custom-agents"
import { handoffConversation } from "@/lib/api"
import { buildHandoffPacket, extractHandoffTurns } from "@/lib/handoff-packet"
import {
  emitAppendTextToSession,
  emitAttachSessionToSession,
} from "@/lib/session-attachment-events"
import { useTabStore } from "@/contexts/tab-context"
import { toast } from "sonner"
import { toErrorMessage } from "@/lib/app-error"
import type { MessageTurn } from "@/lib/types"
import { cn } from "@/lib/utils"

const SHELF_OPEN_CONVERSATION_EVENT = "codeg:shelf-open-conversation"
const SHELF_PACKET_FRAMES = 45

function deliverHandoffPacket(args: {
  tabId: string
  packet: string
  summary: DbConversationSummary
  conversationId: number
  waitForShelfCard: boolean
}) {
  const send = () => {
    emitAppendTextToSession({ tabId: args.tabId, text: args.packet })
    emitAttachSessionToSession({
      tabId: args.tabId,
      conversation: args.summary,
    })
  }
  if (!args.waitForShelfCard) {
    window.setTimeout(send, 0)
    return
  }
  const selector = `[data-shelf-card="${args.conversationId}"] [contenteditable="true"]`
  let frames = 0
  const tick = () => {
    if (document.querySelector(selector) || frames >= SHELF_PACKET_FRAMES) {
      window.setTimeout(send, 0)
      return
    }
    frames += 1
    window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}

export type HandoffSource = {
  id: number
  folderId: number
  agentType: AgentType
  title: string | null
  summary: DbConversationSummary
  turns?: MessageTurn[]
}

export function HandoffAgentDock({ source }: { source: HandoffSource }) {
  const t = useTranslations("Folder.handoff")
  const { agents: rawAgents } = useAcpAgents()
  const openTab = useTabStore((s) => s.openTab)

  const others = rawAgents
    .filter(
      (a) => a.enabled && a.available && a.agent_type !== source.agentType
    )
    .slice()
    .sort((a, b) => compareAgentType(a.agent_type, b.agent_type))

  const runHandoff = useCallback(
    async (agentType: AgentType) => {
      try {
        const result = await handoffConversation({
          sourceId: source.id,
          agentType,
        })
        const shelf = loadCanvasLayoutMode() === "shelf"
        if (shelf) {
          window.dispatchEvent(
            new CustomEvent(SHELF_OPEN_CONVERSATION_EVENT, {
              detail: {
                conversationId: result.conversationId,
                folderId: source.folderId,
                afterId: source.id,
              },
            })
          )
        } else {
          openTab(
            source.folderId,
            result.conversationId,
            agentType,
            false,
            source.title ?? undefined
          )
        }
        const tabId = shelf
          ? shelfContextKey(result.conversationId)
          : `conv-${source.folderId}-${agentType}-${result.conversationId}`
        const packet = buildHandoffPacket({
          goal: "",
          sourceTitle: source.title ?? "",
          turns: extractHandoffTurns(source.turns ?? []),
        })
        deliverHandoffPacket({
          tabId,
          packet,
          summary: source.summary,
          conversationId: result.conversationId,
          waitForShelfCard:
            shelf && document.querySelector("[data-testid=shelf-view]") != null,
        })
      } catch (err) {
        toast.error(toErrorMessage(err))
      }
    },
    [openTab, source]
  )

  const sourceLabel = getAgentLabel(source.agentType)

  return (
    <div
      data-handoff-dock
      className="flex shrink-0 items-center"
      aria-label={t("dockLabel")}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-handoff-trigger
            disabled={others.length === 0}
            aria-label={t("dockLabel")}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground",
              others.length === 0
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer hover:bg-accent hover:text-foreground"
            )}
          >
            <AgentIcon agentType={source.agentType} className="h-4 w-4" />
            <span className="max-w-[7rem] truncate">{sourceLabel}</span>
            {others.length > 0 ? (
              <ChevronDown className="size-3 shrink-0" aria-hidden />
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-56">
          <DropdownMenuItem disabled>
            {t("currentSession")}: {sourceLabel}
          </DropdownMenuItem>
          {others.map((agent) => (
            <DropdownMenuItem
              key={agent.agent_type}
              data-handoff-agent={agent.agent_type}
              onSelect={() => {
                void runHandoff(agent.agent_type)
              }}
            >
              <AgentIcon agentType={agent.agent_type} className="h-4 w-4" />
              {t("handoffTo", { agent: getAgentLabel(agent.agent_type) })}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
