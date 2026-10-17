export type ThreadFindHit = { index: number; haystack: string }

export function collectThreadFindHits(
  items: readonly { kind: string; text: string }[],
  query: string
): ThreadFindHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const hits: ThreadFindHit[] = []
  for (let i = 0; i < items.length; i++) {
    const text = items[i].text
    if (text.toLowerCase().includes(q)) {
      hits.push({ index: i, haystack: text })
    }
  }
  return hits
}

/** `current` is an index into `hits`, not into the source items. */
export function nextFindIndex(
  hits: readonly ThreadFindHit[],
  current: number,
  dir: 1 | -1
): number {
  const n = hits.length
  if (n === 0) return 0
  const next = (current + dir) % n
  return next < 0 ? next + n : next
}
