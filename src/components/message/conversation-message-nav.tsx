"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDownIcon,
  ChevronRight,
  FileIcon,
  Loader2,
  MapPinned,
  RotateCw,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { useWorkspaceActions } from "@/contexts/workspace-context"
import type { FileChangeStat } from "@/lib/session-files"
import {
  MIN_RAIL_PROMPTS,
  clampWindowStart,
  maxTicksForTrack,
  tickTopPercent,
  tickWindowStart,
} from "@/lib/prompt-tick-layout"
import {
  CommitFileAdditions,
  CommitFileDeletions,
} from "@/components/ai-elements/commit"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fileNameOf,
  isRemovedFileDiff,
  normalizeSlashPath,
  toFolderRelativePath,
} from "@/lib/file-path-display"
import { cn } from "@/lib/utils"

/** One navigable user message. Present for every user turn, even when it made
 *  no file edits (`hasChanges === false`) so the list is a complete index —
 *  including the messages above the loaded window of a long conversation. */
export interface MessageNavEntry {
  /** Index into the rendered `threadItems` array — fed to `scrollToIndex`.
   *  Null for a message above the loaded window. */
  threadIndex: number | null
  /** Global turn index of a message above the loaded window (what paging it
   *  in needs); null for a loaded one. */
  turnIndex: number | null
  turnId: string
  /** 1-based position among the conversation's user messages. */
  ordinal: number
  label: string
  additions: number
  deletions: number
  files: FileChangeStat[]
  hasChanges: boolean
}

/** Cheap tick on the rail: no diff parsing. */
export interface PromptTickItem {
  turnId: string
  ordinal: number
  threadIndex: number | null
  turnIndex: number | null
  label: string
}

interface ConversationMessageNavProps {
  /** Number of user messages — drives the collapsed chip summary. The parent
   *  derives this cheaply (no diff parsing) so the chip can show without
   *  computing the expensive per-file `entries` until the panel is opened. */
  count: number
  /** Whether the panel is expanded. Owned by the parent so it can compute
   *  `entries` lazily — only while open. */
  expanded: boolean
  onToggle: (next: boolean) => void
  /** Per-message rows. Only populated while `expanded` (computed lazily). */
  entries: MessageNavEntry[]
  /** Jump to a message: the parent scrolls to a loaded one, or pages one
   *  above the loaded window in first. */
  onSelect: (entry: MessageNavEntry) => void
  /** The message being paged in for a jump, if any. */
  revealingTurnId?: string | null
  /** The messages above the loaded window aren't listed yet: their outline
   *  is loading, or failed to (offering `onRetryEarlier`). */
  earlier?: "loading" | "error" | null
  onRetryEarlier?: () => void
  /** Loaded user prompts for the tick map. Diff-free. */
  prompts?: PromptTickItem[]
  /** Transcript frame height; drives how many ticks fit. */
  trackHeightPx?: number
  /** 1-based ordinal of the in-view user prompt, if known. */
  activeOrdinal?: number | null
  /** Used when `entries` is empty (collapsed, lazy). */
  onJumpOrdinal?: (ordinal: number) => void
}

function stubEntry(prompt: PromptTickItem): MessageNavEntry {
  return {
    threadIndex: prompt.threadIndex,
    turnIndex: prompt.turnIndex,
    turnId: prompt.turnId,
    ordinal: prompt.ordinal,
    label: prompt.label,
    additions: 0,
    deletions: 0,
    files: [],
    hasChanges: false,
  }
}

/**
 * Per-conversation prompt-tick rail on the chat-column start edge.
 *
 * Ticks stay visible. The directory card flies out to inline-end only when
 * `expanded` (dense / window-above). `memo`'d so streaming while collapsed
 * does not re-render the rail unless its cheap props change.
 */
export const ConversationMessageNav = memo(function ConversationMessageNav({
  count,
  expanded,
  onToggle,
  entries,
  onSelect,
  revealingTurnId = null,
  earlier = null,
  onRetryEarlier,
  prompts = [],
  trackHeightPx = 0,
  activeOrdinal = null,
  onJumpOrdinal,
}: ConversationMessageNavProps) {
  const t = useTranslations("Folder.chat.messageNav")
  const { openSessionFileDiff } = useWorkspaceActions()
  const { activeFolder: folder } = useActiveFolder()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [peekOrdinal, setPeekOrdinal] = useState<number | null>(null)
  const [filter, setFilter] = useState("")
  const [panStart, setPanStart] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const handleFileClick = useCallback(
    (
      filePath: string,
      diff: string | null,
      ordinal: number,
      changeIndex: number
    ) => {
      openSessionFileDiff(
        filePath,
        diff ?? t("noDiffDataAvailable", { filePath }),
        `msg-${ordinal}-chg-${changeIndex + 1}`
      )
    },
    [openSessionFileDiff, t]
  )

  const windowSize = maxTicksForTrack(trackHeightPx)
  const promptCount = prompts.length
  const activePromptIndex =
    activeOrdinal == null
      ? -1
      : prompts.findIndex((p) => p.ordinal === activeOrdinal)

  useEffect(() => {
    setPanStart(null)
  }, [activeOrdinal])

  const windowStart = useMemo(() => {
    if (promptCount <= windowSize) return 0
    if (panStart != null) {
      return clampWindowStart(panStart, promptCount, windowSize)
    }
    const center =
      activePromptIndex >= 0 ? activePromptIndex : promptCount - 1
    return tickWindowStart(promptCount, windowSize, center)
  }, [promptCount, windowSize, panStart, activePromptIndex])

  const sampled = useMemo(() => {
    const size = Math.min(promptCount, windowSize)
    return Array.from({ length: size }, (_, i) => windowStart + i)
  }, [promptCount, windowSize, windowStart])
  const showCount = promptCount > windowSize || count > promptCount
  const currentSample =
    activePromptIndex >= 0 ? sampled.indexOf(activePromptIndex) : -1

  const panBy = useCallback(
    (dir: number) => {
      if (promptCount <= windowSize) return
      setPanStart((prev) => {
        const base =
          prev ?? tickWindowStart(
            promptCount,
            windowSize,
            activePromptIndex >= 0 ? activePromptIndex : promptCount - 1
          )
        return clampWindowStart(base + dir, promptCount, windowSize)
      })
    },
    [activePromptIndex, promptCount, windowSize]
  )

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return
      event.preventDefault()
      event.stopPropagation()
      if (promptCount <= windowSize) return
      panBy(event.deltaY > 0 ? 1 : -1)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [panBy, promptCount, windowSize])

  const selectPrompt = useCallback(
    (prompt: PromptTickItem) => {
      const entry =
        entries.find((e) => e.ordinal === prompt.ordinal) ??
        entries.find((e) => e.turnId === prompt.turnId)
      if (entry) {
        onSelect(entry)
        return
      }
      if (onJumpOrdinal) {
        onJumpOrdinal(prompt.ordinal)
        return
      }
      onSelect(stubEntry(prompt))
    },
    [entries, onJumpOrdinal, onSelect]
  )

  const peekPrompt =
    peekOrdinal == null || expanded
      ? null
      : (prompts.find((p) => p.ordinal === peekOrdinal) ?? null)
  const peekSampleIndex =
    peekPrompt == null
      ? -1
      : sampled.findIndex((i) => prompts[i]?.ordinal === peekPrompt.ordinal)

  const filterQuery = filter.trim().toLowerCase()
  const visibleEntries =
    filterQuery.length === 0
      ? entries
      : entries.filter((e) => e.label.toLowerCase().includes(filterQuery))

  useEffect(() => {
    if (!expanded) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        onToggle(false)
      }
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [expanded, onToggle])

  if (count < MIN_RAIL_PROMPTS) return null

  return (
    <div
      ref={rootRef}
      data-testid="prompt-tick-rail"
      role="navigation"
      aria-label={t("tickRail")}
      className="pointer-events-auto absolute inset-y-0 start-0 z-30 w-6"
      onMouseLeave={() => setPeekOrdinal(null)}
    >
      <div
        className={cn(
          "pointer-events-auto absolute inset-x-0 top-3",
          showCount ? "bottom-7" : "bottom-3"
        )}
      >
        {sampled.map((promptIndex, sampleIndex) => {
          const prompt = prompts[promptIndex]
          if (!prompt) return null
          const isCurrent = sampleIndex === currentSample
          return (
            <button
              key={prompt.turnId}
              type="button"
              data-testid="prompt-tick"
              data-ordinal={prompt.ordinal}
              aria-label={t("jumpTo", {
                n: prompt.ordinal,
                label: prompt.label,
              })}
              aria-current={isCurrent ? "location" : undefined}
              className="pointer-events-auto absolute start-1/2 z-10 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{
                top: `${tickTopPercent(sampleIndex, sampled.length)}%`,
              }}
              onClick={() => selectPrompt(prompt)}
              onMouseEnter={() => setPeekOrdinal(prompt.ordinal)}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  isCurrent ? "bg-foreground" : "bg-foreground/40"
                )}
              />
            </button>
          )
        })}
      </div>

      {showCount && (
        <button
          type="button"
          data-testid="prompt-tick-count"
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex h-6 items-center justify-center text-3xs tabular-nums text-muted-foreground hover:text-foreground"
          aria-label={t("openDirectory", { count })}
          aria-expanded={expanded}
          onClick={() => onToggle(!expanded)}
        >
          {count}
        </button>
      )}

      {peekPrompt && (
        <div
          data-testid="prompt-tick-peek"
          className="pointer-events-none absolute start-full z-30 ms-1 w-56 rounded-lg border bg-card/95 px-2.5 py-2 text-xs shadow-lg backdrop-blur"
          style={{
            top:
              peekSampleIndex >= 0
                ? `${tickTopPercent(peekSampleIndex, sampled.length)}%`
                : 0,
          }}
        >
          {peekPrompt.label}
        </div>
      )}

      {expanded && (
        <div
          data-testid="prompt-nav-flyout"
          className="pointer-events-auto absolute start-full top-0 z-30 ms-1"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation()
              onToggle(false)
            }
          }}
        >
          <div className="w-72 max-w-[min(22rem,calc(100vw-4rem))] rounded-xl border bg-card/60 shadow-lg backdrop-blur transition-colors hover:bg-card/95 supports-[backdrop-filter]:bg-card/50 supports-[backdrop-filter]:hover:bg-card/85">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <MapPinned className="h-4 w-4 text-muted-foreground" />
                <span className="truncate text-sm font-medium">
                  {t("title")}
                </span>
                <Badge variant="secondary" className="h-5">
                  {count}
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("collapse")}
                onClick={() => onToggle(false)}
              >
                <ChevronDownIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="border-b px-2 py-2">
              <Input
                data-testid="prompt-nav-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t("filterPlaceholder")}
                aria-label={t("filterAria")}
                className="h-8 text-xs"
              />
            </div>

            <div className="max-h-96 space-y-1.5 overflow-y-auto p-2">
              {earlier === "loading" && (
                <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span className="min-w-0 truncate">
                    {t("loadingEarlier")}
                  </span>
                </div>
              )}
              {earlier === "error" && (
                <button
                  type="button"
                  onClick={onRetryEarlier}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                >
                  <RotateCw className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{t("loadEarlier")}</span>
                </button>
              )}
              {visibleEntries.map((entry) => {
                const isOpen = openGroups[entry.turnId] ?? false
                const isRevealing = revealingTurnId === entry.turnId
                const uniqueFileCount = new Set(
                  entry.files.map((file) => normalizeSlashPath(file.path))
                ).size

                return (
                  <div
                    key={entry.turnId}
                    className="overflow-hidden rounded-lg border border-border bg-transparent text-card-foreground"
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => onSelect(entry)}
                        aria-busy={isRevealing || undefined}
                        className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-accent/40"
                      >
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1 text-3xs tabular-nums text-muted-foreground">
                          {isRevealing && (
                            <Loader2
                              aria-hidden="true"
                              className="size-2.5 animate-spin"
                            />
                          )}
                          #{entry.ordinal}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-xs leading-5 text-foreground">
                            {entry.label}
                          </span>
                          {entry.hasChanges && (
                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-3xs text-muted-foreground">
                                {t("fileCount", { count: uniqueFileCount })}
                              </span>
                              {/* Always render BOTH counts (incl. zeros) so a
                                  one-sided change still shows its +N and -N. */}
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-3xs">
                                <span className="text-green-600 dark:text-green-400">
                                  +{entry.additions}
                                </span>
                                <span className="text-red-600 dark:text-red-400">
                                  -{entry.deletions}
                                </span>
                              </span>
                            </span>
                          )}
                        </span>
                      </button>

                      {entry.hasChanges && (
                        <button
                          type="button"
                          aria-label={t("fileCount", {
                            count: uniqueFileCount,
                          })}
                          aria-expanded={isOpen}
                          onClick={() =>
                            setOpenGroups((prev) => ({
                              ...prev,
                              [entry.turnId]: !isOpen,
                            }))
                          }
                          className="flex w-7 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                        >
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              isOpen && "rotate-90"
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {entry.hasChanges && isOpen && (
                      <ul className="space-y-1 border-t border-border p-2">
                        {entry.files.map((file, fileIndex) => {
                          const displayPath = toFolderRelativePath(
                            file.path,
                            folder?.path
                          )
                          const isRemoved = isRemovedFileDiff(file.diff)

                          return (
                            <li key={file.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  handleFileClick(
                                    file.path,
                                    file.diff,
                                    entry.ordinal,
                                    fileIndex
                                  )
                                }
                                title={displayPath}
                                className={cn(
                                  "flex w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                                  isRemoved
                                    ? "border-destructive/30 bg-destructive/10 hover:bg-destructive/20"
                                    : "border-border bg-transparent hover:bg-accent/40"
                                )}
                              >
                                <FileIcon
                                  className={cn(
                                    "h-3.5 w-3.5 shrink-0",
                                    isRemoved
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                  )}
                                />
                                <span
                                  className={cn(
                                    "min-w-0 flex-1 truncate text-xs",
                                    isRemoved
                                      ? "text-destructive"
                                      : "text-foreground"
                                  )}
                                >
                                  {fileNameOf(displayPath)}
                                </span>
                                {isRemoved ? (
                                  <span className="inline-flex shrink-0 items-center rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-3xs text-destructive">
                                    {t("remove")}
                                  </span>
                                ) : (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-3xs text-foreground">
                                    <CommitFileAdditions
                                      count={file.additions}
                                      className="text-3xs"
                                    />
                                    <CommitFileDeletions
                                      count={file.deletions}
                                      className="text-3xs"
                                    />
                                  </span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
