const TOOL_CATS = new Set([
  "read",
  "write",
  "search",
  "command",
  "fetch",
  "task",
  "other",
])

export function nextFlag(current: boolean): boolean {
  return !current
}

export function firstToolThreadIndex(
  segs: readonly { cat: string; first: number }[]
): number | null {
  const hit = segs.find((seg) => TOOL_CATS.has(seg.cat))
  return hit ? hit.first : null
}

export function toolCallIdFromSeg(seg: {
  toolCallId?: string | null
}): string | null {
  const id = seg.toolCallId?.trim()
  return id ? id : null
}
