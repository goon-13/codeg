import type { DashboardSeg } from "./dashboard-model"

export type RoundMapItem = {
  role: "user" | "assistant" | "system"
  threadIndex: number
  label?: string
}

export type RoundMapRound = {
  id: string
  ordinal: number | null
  userThreadIndex: number | null
  assistantThreadIndex: number | null
  userLabel: string
  segs: DashboardSeg[]
}

export function roundsFromThread(
  items: readonly RoundMapItem[],
  segs: DashboardSeg[]
): RoundMapRound[] {
  const rounds: RoundMapRound[] = []
  let ordinal = 0

  for (const item of items) {
    if (item.role === "system") continue
    const last = rounds[rounds.length - 1]
    if (item.role === "user") {
      ordinal += 1
      rounds.push({
        id: `r-${item.threadIndex}-x`,
        ordinal,
        userThreadIndex: item.threadIndex,
        assistantThreadIndex: null,
        userLabel: item.label?.trim() ?? "",
        segs: [],
      })
      continue
    }
    if (!last) {
      rounds.push({
        id: `r-pre-${item.threadIndex}`,
        ordinal: null,
        userThreadIndex: null,
        assistantThreadIndex: item.threadIndex,
        userLabel: "",
        segs: [],
      })
      continue
    }
    if (last.assistantThreadIndex == null) {
      last.assistantThreadIndex = item.threadIndex
      last.id =
        last.userThreadIndex == null
          ? `r-pre-${item.threadIndex}`
          : `r-${last.userThreadIndex}-${item.threadIndex}`
    }
  }

  for (const seg of segs) {
    let dest = 0
    for (let i = 0; i < rounds.length; i++) {
      const start = rounds[i]?.userThreadIndex ?? -1
      const nextUser = rounds[i + 1]?.userThreadIndex ?? Number.POSITIVE_INFINITY
      if (seg.first > start && seg.first < nextUser) dest = i
    }
    rounds[dest]?.segs.push(seg)
  }

  return rounds
}

export function filterRounds(
  rounds: RoundMapRound[],
  query: string
): RoundMapRound[] {
  const q = query.trim().toLowerCase()
  if (!q) return rounds
  return rounds.filter((r) => r.userLabel.toLowerCase().includes(q))
}

export function activeRoundIndex(
  rounds: RoundMapRound[],
  threadIndex: number | null | undefined
): number | null {
  if (threadIndex == null) return null
  const byAssistant = rounds.findIndex(
    (r) => r.assistantThreadIndex === threadIndex
  )
  if (byAssistant >= 0) return byAssistant
  const byUser = rounds.findIndex((r) => r.userThreadIndex === threadIndex)
  if (byUser >= 0) return byUser
  let dest = 0
  for (let i = 0; i < rounds.length; i++) {
    const start = rounds[i]?.userThreadIndex ?? -1
    const nextUser = rounds[i + 1]?.userThreadIndex ?? Number.POSITIVE_INFINITY
    if (threadIndex > start && threadIndex < nextUser) dest = i
  }
  return rounds.length > 0 ? dest : null
}

export function assistantByUserThreadIndex(
  rounds: RoundMapRound[]
): Record<number, number | null> {
  const out: Record<number, number | null> = {}
  for (const r of rounds) {
    if (r.userThreadIndex != null) {
      out[r.userThreadIndex] = r.assistantThreadIndex
    }
  }
  return out
}
