import { classifyToolKind } from "@/lib/adapters/tool-kind-classifier"
import { normalizeToolName } from "@/lib/tool-call-normalization"
import { resolveContextWindowPercent } from "@/lib/context-window"

export type DashboardCat =
  | "read"
  | "write"
  | "search"
  | "command"
  | "fetch"
  | "think"
  | "todo"
  | "task"
  | "error"
  | "text"
  | "other"

export type DashboardBlock = {
  threadIndex: number
  kind: "text" | "thinking" | "tool" | "skip"
  toolName?: string | null
  toolFailed?: boolean
  label?: string
  size?: number
  toolCallId?: string
}

export type DashboardSeg = {
  cat: DashboardCat
  label: string
  count: number
  size: number
  first: number
  toolCallId?: string
}

export const TIMELINE_BAR_W = 12
export const TIMELINE_GAP = 1
export const TIMELINE_MIN_H = 8
export const TIMELINE_MAX_H = 26
export const TIMELINE_BAR_H = 26

const KIND_TO_CAT: Record<
  ReturnType<typeof classifyToolKind>,
  DashboardCat
> = {
  search: "search",
  command: "command",
  read: "read",
  memory: "read",
  edit: "write",
  fetch: "fetch",
  think: "think",
  todo: "todo",
  task: "task",
  other: "other",
}

export function catFromDashboardBlock(block: DashboardBlock): DashboardCat {
  if (block.kind === "thinking") return "think"
  if (block.kind === "text" || block.kind === "skip") return "text"
  if (block.toolFailed) return "error"
  const raw = block.toolName?.trim()
  if (!raw) return "other"
  return KIND_TO_CAT[classifyToolKind(normalizeToolName(raw))]
}

export function mergeDashboardSegs(blocks: DashboardBlock[]): DashboardSeg[] {
  const segs: DashboardSeg[] = []
  for (const block of blocks) {
    if (block.kind === "skip") continue
    const cat = catFromDashboardBlock(block)
    const label = block.label?.trim() || cat
    const size = Math.max(1, block.size ?? 1)
    const last = segs[segs.length - 1]
    if (last && last.cat === cat) {
      last.count += 1
      last.size += size
      continue
    }
    const next: DashboardSeg = {
      cat,
      label,
      count: 1,
      size,
      first: block.threadIndex,
    }
    if (block.toolCallId) next.toolCallId = block.toolCallId
    segs.push(next)
  }
  return segs
}

export function segHeightPx(size: number, maxSize: number): number {
  if (maxSize <= 0) return TIMELINE_MIN_H
  const t = Math.max(0, Math.min(1, size / maxSize))
  return Math.round(
    TIMELINE_MIN_H + t * (TIMELINE_MAX_H - TIMELINE_MIN_H)
  )
}

export function contextBarModel(input: {
  liveUsed: number | null
  liveMax: number | null
  statsUsed: number | null
  statsMax: number | null
  statsPercent: number | null
}): {
  used: number | null
  max: number | null
  percent: number | null
  warn: boolean
} {
  const liveUsed =
    input.liveUsed != null && input.liveUsed > 0 ? input.liveUsed : null
  const liveMax =
    input.liveMax != null && input.liveMax > 0 ? input.liveMax : null
  const used = liveUsed ?? input.statsUsed
  const max = liveMax ?? input.statsMax
  const percent =
    liveUsed != null && liveMax != null
      ? resolveContextWindowPercent(null, liveUsed, liveMax)
      : resolveContextWindowPercent(
          input.statsPercent,
          input.statsUsed,
          input.statsMax
        )
  return {
    used: used != null && used > 0 ? used : null,
    max: max != null && max > 0 ? max : null,
    percent,
    warn: percent != null && percent >= 50,
  }
}
