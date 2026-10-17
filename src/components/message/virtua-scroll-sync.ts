export const VIRTUA_SCROLL_SYNC_EPSILON_PX = 1

export function virtuaScrollNeedsSync(
  virtuaOffset: number,
  viewportScrollTop: number,
  epsilon = VIRTUA_SCROLL_SYNC_EPSILON_PX
): boolean {
  if (!Number.isFinite(virtuaOffset) || !Number.isFinite(viewportScrollTop)) {
    return false
  }
  return Math.abs(virtuaOffset - viewportScrollTop) > epsilon
}

export function shouldSyncVirtuaToViewport(input: {
  virtuaOffset: number
  viewportScrollTop: number
  viewportClientHeight: number
  itemCount: number
}): boolean {
  if (input.itemCount <= 0) return false
  if (input.viewportClientHeight <= 0) return false
  return virtuaScrollNeedsSync(input.virtuaOffset, input.viewportScrollTop)
}

export function syncVirtuaToViewport(
  handle: { scrollOffset: number; scrollTo: (offset: number) => void } | null,
  viewport: { scrollTop: number; clientHeight: number } | null,
  itemCount: number
): boolean {
  if (!handle || !viewport) return false
  if (
    !shouldSyncVirtuaToViewport({
      virtuaOffset: handle.scrollOffset,
      viewportScrollTop: viewport.scrollTop,
      viewportClientHeight: viewport.clientHeight,
      itemCount,
    })
  ) {
    return false
  }
  handle.scrollTo(viewport.scrollTop)
  return true
}
