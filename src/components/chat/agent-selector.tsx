"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Check, ChevronDown } from "lucide-react"
import { useAcpAgents } from "@/hooks/use-acp-agents"
import type { AgentType, AcpAgentInfo } from "@/lib/types"
import { getAgentLabel } from "@/lib/custom-agents"
import { AgentIcon } from "@/components/agent-icon"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface AgentSelectorProps {
  defaultAgentType?: AgentType
  /** Fires on user click. The caller should treat this as confirmation. */
  onSelect: (agentType: AgentType) => void
  /**
   * Fires when `defaultAgentType` is missing/unavailable and the selector
   * had to pick a substitute on its own. Distinct from `onSelect` so the
   * caller can avoid promoting a system pick to a confirmed user choice
   * (which would otherwise mask a stale-default correction upstream).
   * When omitted, falls back to `onSelect` for backwards compatibility.
   */
  onFallback?: (agentType: AgentType) => void
  onAgentsLoaded?: (agents: AcpAgentInfo[]) => void
  onOpenAgentsSettings?: () => void
  /** Lock a bound conversation; draft pickers stay usable during startup. */
  disabled?: boolean
  /**
   * Where the pill sits inside the row it is given.
   */
  align?: "start" | "center"
}

export function AgentSelector({
  defaultAgentType,
  onSelect,
  onFallback,
  onAgentsLoaded,
  onOpenAgentsSettings,
  disabled = false,
  align = "start",
}: AgentSelectorProps) {
  const t = useTranslations("Folder.chat.agentSelector")
  const { agents: rawAgents } = useAcpAgents()
  const agents = useMemo<AcpAgentInfo[]>(
    () => rawAgents.filter((a) => a.enabled),
    [rawAgents]
  )
  const onSelectRef = useRef(onSelect)
  const onFallbackRef = useRef(onFallback)
  const onAgentsLoadedRef = useRef(onAgentsLoaded)
  const [open, setOpen] = useState(false)

  const selected = useMemo<AgentType | null>(() => {
    const found = defaultAgentType
      ? agents.find((a) => a.agent_type === defaultAgentType && a.available)
      : null
    if (found) return found.agent_type
    const first = agents.find((a) => a.available)
    return first?.agent_type ?? null
  }, [agents, defaultAgentType])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    onFallbackRef.current = onFallback
  }, [onFallback])

  useEffect(() => {
    onAgentsLoadedRef.current = onAgentsLoaded
  }, [onAgentsLoaded])

  useEffect(() => {
    onAgentsLoadedRef.current?.(agents)
    const found = defaultAgentType
      ? agents.find((a) => a.agent_type === defaultAgentType && a.available)
      : null
    if (found) return
    const first = agents.find((a) => a.available)
    if (!first) return
    const fallback = onFallbackRef.current
    if (fallback) {
      fallback(first.agent_type)
    } else {
      onSelectRef.current(first.agent_type)
    }
  }, [agents, defaultAgentType])

  const handleSelect = (agentType: AgentType) => {
    onSelect(agentType)
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
        <div>{t("noEnabledAgents")}</div>
        {onOpenAgentsSettings ? (
          <button
            type="button"
            onClick={onOpenAgentsSettings}
            className="mt-2 inline-flex items-center rounded-md border px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent cursor-pointer"
          >
            {t("openAgentsSettings")}
          </button>
        ) : null}
      </div>
    )
  }

  const selectedAgent = agents.find((a) => a.agent_type === selected)
  const notInstalledSelected = Boolean(
    selectedAgent?.available && !selectedAgent.installed_version
  )

  return (
    <div
      data-slot="agent-selector"
      className={cn(
        "flex min-w-0 items-center",
        align === "center" && "justify-center"
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-slot="agent-selector-trigger"
            disabled={disabled || selected == null}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={selected ? getAgentLabel(selected) : t("openMenu")}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground",
              disabled || selected == null
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer hover:bg-accent hover:text-foreground"
            )}
          >
            {selected ? (
              <>
                <span className="relative inline-flex shrink-0 items-center">
                  <AgentIcon agentType={selected} className="h-4 w-4" />
                  {notInstalledSelected ? (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-background"
                    />
                  ) : null}
                </span>
                <span className="max-w-[7rem] truncate">
                  {getAgentLabel(selected)}
                </span>
              </>
            ) : (
              <span>{t("openMenu")}</span>
            )}
            <ChevronDown className="size-3 shrink-0" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align={align === "center" ? "center" : "start"}
          role="listbox"
          className="w-56 gap-0.5 p-1"
        >
          {agents.map((agent) => {
            const isSelected = selected === agent.agent_type
            const notInstalled = agent.available && !agent.installed_version
            const label = getAgentLabel(agent.agent_type)
            return (
              <button
                ref={setItemRef(agent.agent_type)}
                data-slot="agent-pill"
                aria-pressed={isSelected}
                key={agent.agent_type}
                type="button"
                role="option"
                data-slot="agent-option"
                data-agent-type={agent.agent_type}
                aria-selected={isSelected}
                disabled={disabled || !agent.available}
                title={
                  notInstalled ? `${label} · ${t("notInstalled")}` : undefined
                }
                onClick={() => {
                  setOpen(false)
                  if (agent.agent_type !== selected) {
                    handleSelect(agent.agent_type)
                  }
                }}
                className={cn(
                  "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  disabled || !agent.available
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <span className="relative inline-flex shrink-0 items-center">
                  <AgentIcon agentType={agent.agent_type} className="h-4 w-4" />
                  {notInstalled ? (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500 ring-1 ring-background"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {isSelected ? (
                  <Check className="size-3.5 shrink-0 text-foreground" />
                ) : null}
              </button>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}
