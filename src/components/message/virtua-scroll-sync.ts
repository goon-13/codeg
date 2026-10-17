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

export function virtuaLayoutIsDormant(input: {
  itemCount: number
  viewportClientHeight: number
  virtuaViewportSize: number
  virtuaScrollSize: number
}): boolean {
  if (input.itemCount <= 0) return false
  if (input.viewportClientHeight <= 0) return false
  return input.virtuaViewportSize <= 0 || input.virtuaScrollSize <= 0
}

export function virtuaVisibleRangeUnpainted(input: {
  itemCount: number
  virtuaViewportSize: number
  paintedChildCount: number
}): boolean {
  if (input.itemCount <= 0) return false
  if (input.virtuaViewportSize <= 0) return false
  return input.paintedChildCount <= 0
}

export function countVirtuaPaintedChildren(
  viewport: HTMLElement | null
): number {
  if (!viewport) return 0
  const inner = viewport.querySelector('[style*="contain"]')
  return inner ? inner.childElementCount : 0
}

export function shouldSyncVirtuaToViewport(input: {
  virtuaOffset: number
  viewportScrollTop: number
  viewportClientHeight: number
  itemCount: number
  virtuaViewportSize?: number
  virtuaScrollSize?: number
  paintedChildCount?: number
}): boolean {
  if (input.itemCount <= 0) return false
  if (input.viewportClientHeight <= 0) return false
  if (virtuaScrollNeedsSync(input.virtuaOffset, input.viewportScrollTop)) {
    return true
  }
  if (
    input.virtuaViewportSize == null &&
    input.virtuaScrollSize == null &&
    input.paintedChildCount == null
  ) {
    return false
  }
  if (
    virtuaLayoutIsDormant({
      itemCount: input.itemCount,
      viewportClientHeight: input.viewportClientHeight,
      virtuaViewportSize: input.virtuaViewportSize ?? 0,
      virtuaScrollSize: input.virtuaScrollSize ?? 0,
    })
  ) {
    return true
  }
  if (input.paintedChildCount == null) return false
  return virtuaVisibleRangeUnpainted({
    itemCount: input.itemCount,
    virtuaViewportSize: input.virtuaViewportSize ?? 0,
    paintedChildCount: input.paintedChildCount,
  })
}

export type VirtuaSyncHandle = {
  scrollOffset: number
  scrollTo: (offset: number) => void
  viewportSize?: number
  scrollSize?: number
}

export function syncVirtuaToViewport(
  handle: VirtuaSyncHandle | null,
  viewport: { scrollTop: number; clientHeight: number } | null,
  itemCount: number,
  paintedChildCount?: number
): boolean {
  if (!handle || !viewport) return false
  if (
    !shouldSyncVirtuaToViewport({
      virtuaOffset: handle.scrollOffset,
      viewportScrollTop: viewport.scrollTop,
      viewportClientHeight: viewport.clientHeight,
      itemCount,
      virtuaViewportSize: handle.viewportSize,
      virtuaScrollSize: handle.scrollSize,
      paintedChildCount,
    })
  ) {
    return false
  }
  handle.scrollTo(viewport.scrollTop)
  return true
}
