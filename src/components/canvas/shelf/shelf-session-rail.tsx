"use client"

import { useTranslations } from "next-intl"

import { AgentIcon } from "@/components/agent-icon"
import { SidebarClusterHeader } from "@/components/conversations/cluster/sidebar-cluster-header"
import { formatConversationTitle } from "@/lib/conversation-title"
import type { DbConversationSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

import type { ShelfRailRow } from "./shelf-session-rail-model"

export function ShelfSessionRail({
  rows,
  open,
  onOpenChange,
  onToggleCluster,
  onSelectConversation,
  onRename,
  onDissolve,
  activeId = null,
}: {
  rows: readonly ShelfRailRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggleCluster: (clusterId: number) => void
  onSelectConversation: (conversation: DbConversationSummary) => void
  onRename: (clusterId: number, title: string) => void
  onDissolve: (clusterId: number) => void
  activeId?: number | null
}) {
  const t = useTranslations("Canvas")
  const tSide = useTranslations("Folder.side")
  const toggleLabel = open
    ? t("shelfSessionRailCollapse")
    : t("shelfSessionRailExpand")

  return (
    <div
      data-shelf-session-rail
      data-open={open ? "true" : "false"}
      className={
        open
          ? "flex w-[18rem] shrink-0 flex-col self-stretch overflow-hidden border-r border-border"
          : "flex w-12 shrink-0 flex-col self-stretch overflow-hidden border-r"
      }
    >
      <div className="flex h-8 shrink-0 items-center px-1">
        <button
          type="button"
          className="h-8 w-full truncate text-xs"
          aria-expanded={open}
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => onOpenChange(!open)}
        >
          {t("shelfSessionRail")}
        </button>
      </div>
      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((row) => {
            if (row.kind === "folder") {
              return (
                <div
                  key={`folder-${row.folderId}`}
                  className="px-2 py-1 text-xs text-muted-foreground"
                >
                  {row.title}
                </div>
              )
            }
            if (row.kind === "cluster") {
              return (
                <SidebarClusterHeader
                  key={`cluster-${row.clusterId}`}
                  clusterId={row.clusterId}
                  title={row.title}
                  memberCount={row.memberCount}
                  agentTypes={row.agentTypes}
                  expanded={row.expanded}
                  depth={row.depth}
                  onToggle={onToggleCluster}
                  onRename={onRename}
                  onDissolve={onDissolve}
                />
              )
            }
            const conversation = row.conversation
            const side = conversation.kind === "side"
            return (
              <button
                key={`conversation-${conversation.id}`}
                type="button"
                data-rail-conversation={conversation.id}
                data-side-row={side ? "" : undefined}
                className={cn(
                  "flex h-8 w-full items-center gap-1.5 text-left text-xs",
                  activeId === conversation.id && "bg-sidebar-accent"
                )}
                style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                onClick={() => onSelectConversation(conversation)}
              >
                <AgentIcon
                  agentType={conversation.agent_type}
                  className="h-[14px] w-[14px] shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">
                  {formatConversationTitle(conversation.title)}
                </span>
                {side ? (
                  <span className="inline-flex shrink-0 items-center rounded-full border border-border px-1.5 leading-none text-muted-foreground">
                    {tSide("tag")}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
