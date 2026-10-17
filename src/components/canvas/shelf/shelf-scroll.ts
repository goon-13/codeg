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

export const SHELF_NAV_ALIGN: ScrollIntoViewOptions = {
  block: "nearest",
  inline: "nearest",
}

export const SHELF_FOCUS_ALIGN: ScrollIntoViewOptions = {
  block: "center",
  inline: "center",
}

export function scrollShelfTarget(
  selector: string,
  align: ScrollIntoViewOptions = SHELF_NAV_ALIGN
): boolean {
  const el = document.querySelector(selector)
  if (!(el instanceof HTMLElement)) return false
  el.scrollIntoView(align)
  return true
}

/** After React paints (and once more if the card was not in the DOM yet). */
export function scheduleScrollShelfTarget(
  selector: string,
  align: ScrollIntoViewOptions = SHELF_NAV_ALIGN,
  onHit?: () => void
): () => void {
  let cancelled = false
  let innerId = 0
  const hit = () => {
    if (cancelled) return false
    if (!scrollShelfTarget(selector, align)) return false
    onHit?.()
    return true
  }
  const outerId = requestAnimationFrame(() => {
    if (hit()) return
    innerId = requestAnimationFrame(() => {
      hit()
    })
  })
  return () => {
    cancelled = true
    cancelAnimationFrame(outerId)
    if (innerId) cancelAnimationFrame(innerId)
  }
}

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
