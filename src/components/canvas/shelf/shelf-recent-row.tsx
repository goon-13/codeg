"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ChevronsDown, ChevronsUp } from "lucide-react"
import { useTranslations } from "next-intl"

import { AgentIcon } from "@/components/agent-icon"
import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatConversationTitle } from "@/lib/conversation-title"
import type { ConversationStatus, DbConversationSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

import { fitRecentStrip, nextRecentPage } from "./shelf-model"

const GAP = 8
const FALLBACK_CHIP_WIDTH = 144
const FALLBACK_MORE_WIDTH = 20

interface ShelfRecentRowProps {
  conversations: DbConversationSummary[]
  onOpenConversation: (conversationId: number, folderId: number) => void
  onExpandedChange?: (open: boolean) => void
}

export function ShelfRecentRow({
  conversations,
  onOpenConversation,
  onExpandedChange,
}: ShelfRecentRowProps) {
  const t = useTranslations("Canvas")
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const [chipWidths, setChipWidths] = useState<number[]>([])
  const [moreWidth, setMoreWidth] = useState(FALLBACK_MORE_WIDTH)
  const [panelOffset, setPanelOffset] = useState(0)
  const [panelIds, setPanelIds] = useState<number[]>([])
  const [panelDone, setPanelDone] = useState(false)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      setContainerWidth(track.clientWidth)
      const chips = measureRef.current?.querySelectorAll<HTMLElement>(
        "[data-recent-measure-chip]"
      )
      if (chips && chips.length > 0) {
        setChipWidths([...chips].map((el) => el.offsetWidth))
      } else {
        setChipWidths(conversations.map(() => FALLBACK_CHIP_WIDTH))
      }
      const more = measureRef.current?.querySelector<HTMLElement>(
        "[data-recent-measure-more]"
      )
      if (more) setMoreWidth(more.offsetWidth)
    }
    measure()
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    observer?.observe(track)
    return () => observer?.disconnect()
  }, [conversations])

  const ids = conversations.map((c) => c.id)
  const byId = useMemo(() => {
    const map = new Map<number, DbConversationSummary>()
    for (const c of conversations) map.set(c.id, c)
    return map
  }, [conversations])
  const fitted = fitRecentStrip({
    ids,
    chipWidths:
      chipWidths.length === ids.length
        ? chipWidths
        : ids.map(() => FALLBACK_CHIP_WIDTH),
    containerWidth,
    moreWidth,
    gap: GAP,
    expanded: false,
  })
  const shown = conversations.slice(0, fitted.visibleCount)
  const extra = expanded
    ? panelIds
        .map((id) => byId.get(id))
        .filter((c): c is DbConversationSummary => c != null)
    : []
  const trackConversations = expanded ? [...shown, ...extra] : shown
  const showMore =
    fitted.overflowCount > 0 ||
    conversations.length > shown.length ||
    expanded
  const shownIds = shown.map((c) => c.id)

  function openPanel() {
    const page = nextRecentPage(ids, shownIds, 0)
    setPanelIds(page.ids)
    setPanelOffset(page.nextOffset)
    setPanelDone(page.done)
    setExpanded(true)
    onExpandedChange?.(true)
  }

  function closePanel() {
    setExpanded(false)
    setPanelIds([])
    setPanelOffset(0)
    setPanelDone(false)
    onExpandedChange?.(false)
  }

  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root) return
      if (event.target instanceof Node && !root.contains(event.target)) {
        closePanel()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [expanded, onExpandedChange])

  function onTrackScroll() {
    const track = trackRef.current
    if (!track || !expanded || panelDone) return
    if (track.scrollHeight - track.scrollTop - track.clientHeight > 48) return
    const page = nextRecentPage(ids, shownIds, panelOffset)
    setPanelIds((current) => [...current, ...page.ids])
    setPanelOffset(page.nextOffset)
    setPanelDone(page.done)
  }

  if (conversations.length === 0) return null

  return (
    <div
      ref={rootRef}
      data-testid="shelf-recent-row"
      className="relative flex h-full min-h-0 min-w-0 flex-1 items-stretch overflow-hidden"
    >
      <p
        className={cn(
          "shrink-0 px-2 text-xs font-semibold text-muted-foreground",
          expanded ? "self-start pt-1.5" : "self-center"
        )}
      >
        {t("recentConversations")}
      </p>
      <div
        ref={trackRef}
        data-testid={expanded ? "shelf-recent-panel" : "shelf-recent-chips"}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 gap-2 pr-2.5",
          expanded
            ? "h-full flex-wrap content-start overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-thin [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40"
            : "items-center overflow-hidden"
        )}
        onScroll={expanded ? onTrackScroll : undefined}
      >
        {trackConversations.map((conversation) => (
          <RecentChip
            key={conversation.id}
            conversation={conversation}
            onOpen={() =>
              onOpenConversation(conversation.id, conversation.folder_id)
            }
          />
        ))}
      </div>
      {showMore ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="shelf-recent-more"
                aria-expanded={expanded}
                aria-label={
                  expanded ? t("recentCollapse") : t("recentMore")
                }
                className={cn(
                  "mr-1.5 flex size-5 shrink-0 items-center justify-center rounded-[0.375rem]",
                  "text-muted-foreground outline-none",
                  "transition-colors duration-150 hover:bg-foreground/10 hover:text-foreground",
                  expanded ? "mt-1.5 self-start" : "self-center"
                )}
                onClick={() => (expanded ? closePanel() : openPanel())}
              >
                {expanded ? (
                  <ChevronsUp className="size-3.5" />
                ) : (
                  <ChevronsDown className="size-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {expanded
                ? t("recentCollapse")
                : `${t("recentMore")} · ${fitted.overflowCount}`}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none absolute -z-10 flex h-0 overflow-hidden opacity-0"
      >
        {conversations.map((conversation) => (
          <span
            key={conversation.id}
            data-recent-measure-chip=""
            className="inline-flex"
          >
            <RecentChip conversation={conversation} />
          </span>
        ))}
        <span data-recent-measure-more="" className="inline-flex">
          <button
            type="button"
            className="flex size-5 items-center justify-center rounded-[0.375rem]"
          >
            <ChevronsDown className="size-3.5" />
          </button>
        </span>
      </div>
    </div>
  )
}

function RecentChip({
  conversation,
  onOpen,
}: {
  conversation: DbConversationSummary
  onOpen?: () => void
}) {
  const t = useTranslations("Canvas")
  const status = conversation.status as ConversationStatus
  const running = status === "in_progress"
  const title = conversation.title
    ? formatConversationTitle(conversation.title)
    : t("untitled")
  const interactive = onOpen != null
  const Comp = interactive ? "button" : "div"
  return (
    <Comp
      {...(interactive
        ? { type: "button" as const, onClick: onOpen }
        : {})}
      tabIndex={interactive ? 0 : -1}
      data-testid={
        interactive ? `shelf-recent-chip-${conversation.id}` : undefined
      }
      title={title}
      className={cn(
        "inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-lg border bg-card px-2 text-left",
        "border-foreground/15 hover:border-foreground/30",
        running && "ring-1 ring-primary/30"
      )}
    >
      <ConversationStatusDot
        status={status}
        size="sm"
        className={cn(running && "motion-safe:animate-pulse")}
      />
      <AgentIcon
        agentType={conversation.agent_type}
        className="size-3 shrink-0"
      />
      <span className="max-w-[8rem] truncate text-[12px] font-medium">
        {title}
      </span>
    </Comp>
  )
}
