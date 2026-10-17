"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { formatTokenCount } from "@/lib/token-format"
import { formatContextWindowPercent } from "@/lib/context-window"
import {
  TIMELINE_BAR_H,
  TIMELINE_BAR_W,
  TIMELINE_GAP,
  ROUND_GAP,
  type DashboardSeg,
} from "./dashboard-model"
import { DASHBOARD_CAT_CLASS } from "./session-dashboard-colors"
import { segHeightPx } from "./dashboard-model"
import type { RoundMapRound } from "./round-map-model"
import { RoundPeek } from "./round-peek"
import { useRunReveal } from "./run-reveal-context"
import { firstToolThreadIndex, toolCallIdFromSeg } from "./run-reveal-model"

const LEGEND_ORDER: DashboardSeg["cat"][] = [
  "read",
  "write",
  "search",
  "command",
  "fetch",
  "think",
  "todo",
  "task",
  "error",
  "text",
  "other",
]

export function SessionDashboard({
  segs,
  rounds,
  activeFirst,
  bar,
  pulsing,
  conversationId,
  onJump,
  onJumpUser,
  onRevealTool,
}: {
  segs: DashboardSeg[]
  rounds?: RoundMapRound[]
  activeFirst?: number
  bar: {
    used: number | null
    max: number | null
    percent: number | null
    warn: boolean
  }
  pulsing?: boolean
  conversationId?: number
  onJump?: (first: number) => void
  onJumpUser?: (threadIndex: number) => void
  onRevealTool?: (toolCallId: string) => void
}) {
  const t = useTranslations("Folder.chat.sessionDashboard")
  const reveal = useRunReveal()
  const [peekRound, setPeekRound] = useState<RoundMapRound | null>(null)
  const wasToolsExpanded = useRef(false)
  useEffect(() => {
    if (reveal.toolsExpanded && !wasToolsExpanded.current) {
      const idx = firstToolThreadIndex(segs)
      if (idx != null) onJump?.(idx)
    }
    wasToolsExpanded.current = reveal.toolsExpanded
  }, [reveal.toolsExpanded, segs, onJump])
  const legend: Record<DashboardSeg["cat"], string> = {
    read: t("legendRead"),
    write: t("legendWrite"),
    search: t("legendSearch"),
    command: t("legendCommand"),
    fetch: t("legendFetch"),
    think: t("legendThink"),
    todo: t("legendTodo"),
    task: t("legendTask"),
    error: t("legendError"),
    text: t("legendText"),
    other: t("legendOther"),
  }
  const hasStrip = segs.length > 0
  const hasBar = bar.percent != null || bar.used != null || bar.max != null
  if (!hasStrip && !hasBar) return null
  const grouped = (rounds ?? [])
    .filter((r) => r.segs.length > 0)
    .map((round) => ({ id: round.id, round, segs: round.segs }))

  const maxSize = segs.reduce((m, s) => Math.max(m, s.size), 0)
  const usedLabel =
    bar.used != null
      ? formatTokenCount(bar.used)
      : bar.percent != null
        ? formatContextWindowPercent(bar.percent)
        : ""
  const maxLabel = bar.max != null ? formatTokenCount(bar.max) : ""
  const fill = Math.max(0, Math.min(100, bar.percent ?? 0))

  return (
    <div
      data-session-dashboard=""
      data-conversation-id={
        conversationId != null ? String(conversationId) : undefined
      }
      className="group/dash relative z-10 shrink-0 border-b border-border/60 py-1.5"
    >
      {hasStrip ? (
        <div
          className="min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-block-strip=""
          aria-label={t("stripAria")}
          style={{ height: TIMELINE_BAR_H }}
        >
          <div
            className="flex h-full items-end"
            style={{
              gap: grouped.length > 0 ? ROUND_GAP : TIMELINE_GAP,
              minWidth: "100%",
            }}
          >
            {(grouped.length > 0
              ? grouped
              : [{ id: "flat", round: null as RoundMapRound | null, segs }]
            ).map((group) => {
              const roundOn =
                group.round != null &&
                (group.round.assistantThreadIndex === activeFirst ||
                  group.round.userThreadIndex === activeFirst ||
                  group.round.segs.some((s) => s.first === activeFirst))
              const buttons = group.segs.map((s) => {
                const on = activeFirst === s.first
                const h = segHeightPx(s.size, maxSize)
                const n = Math.max(1, s.count)
                return (
                  <button
                    key={`${s.cat}-${s.first}-${s.count}`}
                    type="button"
                    title={
                      s.label &&
                      s.label !== s.cat &&
                      s.label !== "text" &&
                      s.label !== "think"
                        ? `${legend[s.cat]} · ${s.label} ×${s.count}`
                        : `${legend[s.cat]} ×${s.count}`
                    }
                    data-block-active={on ? "1" : undefined}
                    data-kind={s.cat}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "flex shrink-0 items-end bg-transparent p-0",
                      on
                        ? "z-[1] opacity-100 ring-1 ring-foreground/80"
                        : "opacity-60 hover:opacity-90",
                      on && pulsing && "animate-pulse"
                    )}
                    style={{ gap: TIMELINE_GAP, height: TIMELINE_BAR_H }}
                    onClick={() => {
                      onJump?.(s.first)
                      const id = toolCallIdFromSeg(s)
                      if (id) onRevealTool?.(id)
                    }}
                  >
                    {Array.from({ length: n }, (_, i) => (
                      <i
                        key={i}
                        data-block-square=""
                        className={cn(
                          "block shrink-0",
                          DASHBOARD_CAT_CLASS[s.cat]
                        )}
                        style={{
                          width: TIMELINE_BAR_W,
                          height: h,
                          borderRadius: "2px 2px 0 0",
                        }}
                      />
                    ))}
                  </button>
                )
              })
              if (!group.round) return buttons
              return (
                <div
                  key={group.id}
                  data-round-seg=""
                  data-round-active={roundOn ? "1" : undefined}
                  className={cn(
                    "flex items-end rounded-sm px-0.5",
                    roundOn && "ring-1 ring-foreground/50"
                  )}
                  style={{ gap: TIMELINE_GAP }}
                  onMouseEnter={() => setPeekRound(group.round)}
                  onMouseLeave={() => setPeekRound(null)}
                >
                  {buttons}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {hasStrip || hasBar ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            data-run-reveal-tools=""
            aria-pressed={reveal.toolsExpanded}
            onClick={() => {
              if (!reveal.toolsExpanded) {
                const idx = firstToolThreadIndex(segs)
                if (idx != null) onJump?.(idx)
              }
              reveal.toggleTools()
            }}
            className={cn(
              "rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              reveal.toolsExpanded && "text-foreground ring-1 ring-foreground/50"
            )}
          >
            {t("toolsToggle")}
          </button>
          <button
            type="button"
            data-run-reveal-thinking=""
            aria-pressed={reveal.thinkingHidden}
            onClick={reveal.toggleThinking}
            className={cn(
              "rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              reveal.thinkingHidden && "text-foreground ring-1 ring-foreground/50"
            )}
          >
            {t("thinkingToggle")}
          </button>
        </div>
      ) : null}

      {hasBar ? (
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {usedLabel ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {usedLabel}
            </span>
          ) : null}
          <div
            data-context-bar=""
            aria-label={t("barAria")}
            className={cn(
              "flex h-1 min-w-0 flex-1 overflow-hidden rounded-sm",
              bar.warn ? "bg-destructive/20" : "bg-muted"
            )}
          >
            <div
              className={cn(
                "h-full",
                bar.warn ? "bg-destructive/80" : "bg-foreground/70"
              )}
              style={{ width: `${fill}%` }}
            />
          </div>
          {maxLabel ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {maxLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {peekRound ? (
        <RoundPeek
          round={peekRound}
          onJumpUser={
            peekRound.userThreadIndex != null
              ? () => onJumpUser?.(peekRound.userThreadIndex!)
              : undefined
          }
          onJumpAssistant={
            peekRound.assistantThreadIndex != null
              ? () => onJump?.(peekRound.assistantThreadIndex!)
              : undefined
          }
        />
      ) : null}

      <div
        className="pointer-events-none absolute left-0 right-0 top-full z-20 hidden rounded-md border border-border bg-popover px-2 py-1 shadow-md group-hover/dash:block"
        data-head-legend=""
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {LEGEND_ORDER.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-0.5 font-mono text-[9px] leading-none text-muted-foreground"
            >
              <i
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-[1px]",
                  DASHBOARD_CAT_CLASS[cat]
                )}
                aria-hidden
              />
              {legend[cat]}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

