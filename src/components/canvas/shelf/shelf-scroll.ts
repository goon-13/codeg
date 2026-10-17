export const SCROLL_EDGE_PX = 8

export type ShelfJumpButtons = {
  showTop: boolean
  showBottom: boolean
}

export function jumpButtonsFromMetrics(metrics: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}): ShelfJumpButtons {
  const atTop = metrics.scrollTop <= SCROLL_EDGE_PX
  const atBottom =
    metrics.scrollTop + metrics.clientHeight >=
    metrics.scrollHeight - SCROLL_EDGE_PX
  if (atTop && atBottom) return { showTop: false, showBottom: false }
  return { showTop: !atTop, showBottom: !atBottom }
}

export function horizontalWheelDelta(input: {
  deltaX: number
  deltaY: number
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
  nestedVerticalScrollable: boolean
}): number | null {
  if (input.nestedVerticalScrollable) return null
  if (input.scrollWidth <= input.clientWidth) return null
  if (Math.abs(input.deltaY) <= Math.abs(input.deltaX)) return null
  if (input.deltaY === 0) return null
  const atStart = input.scrollLeft <= 0
  const atEnd = input.scrollLeft + input.clientWidth >= input.scrollWidth - 1
  if (input.deltaY < 0 && atStart) return null
  if (input.deltaY > 0 && atEnd) return null
  return input.deltaY
}

/** True when the wheel should stay with the target instead of becoming a
 *  horizontal film pan: an overflow-y scroller (expanded transcript) or the
 *  prompt-tick rail (window pan). */
export function isNestedVerticalScroller(
  target: EventTarget | null,
  stopAt: HTMLElement
): boolean {
  let node: HTMLElement | null =
    target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  while (node && node !== stopAt) {
    if (node.getAttribute("data-testid") === "prompt-tick-rail") {
      return true
    }
    const overflowY = getComputedStyle(node).overflowY
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return true
    }
    node = node.parentElement
  }
  return false
}
