export const MIN_RAIL_PROMPTS = 2
export const MIN_TICK_TARGET_PX = 24
export const MAX_TICKS_CAP = 50
export const MIN_TICKS_FLOOR = 8

export function maxTicksForTrack(trackHeightPx: number): number {
  if (trackHeightPx <= 0) return MIN_TICKS_FLOOR
  return Math.min(
    MAX_TICKS_CAP,
    Math.max(MIN_TICKS_FLOOR, Math.floor(trackHeightPx / MIN_TICK_TARGET_PX))
  )
}

export function tickWindowStart(
  n: number,
  windowSize: number,
  centerIndex: number
): number {
  if (n <= windowSize) return 0
  const half = Math.floor((windowSize - 1) / 2)
  let start = centerIndex - half
  if (start < 0) start = 0
  if (start + windowSize > n) start = n - windowSize
  return start
}

export function tickWindowIndices(
  n: number,
  windowSize: number,
  centerIndex: number
): number[] {
  if (n <= 0) return []
  const size = Math.min(n, windowSize)
  const start = tickWindowStart(n, windowSize, centerIndex)
  return Array.from({ length: size }, (_, i) => start + i)
}

export function tickTopPercent(
  indexInSample: number,
  sampleLength: number
): number {
  if (sampleLength <= 1) return 0
  return (indexInSample / (sampleLength - 1)) * 100
}

export function clampWindowStart(
  start: number,
  n: number,
  windowSize: number
): number {
  if (n <= windowSize) return 0
  return Math.max(0, Math.min(start, n - windowSize))
}
