import { describe, expect, it, vi } from "vitest"
import {
  countVirtuaPaintedChildren,
  shouldSyncVirtuaToViewport,
  syncVirtuaToViewport,
  virtuaLayoutIsDormant,
  virtuaScrollNeedsSync,
  virtuaVisibleRangeUnpainted,
} from "./virtua-scroll-sync"

describe("virtuaScrollNeedsSync", () => {
  it("is true when virtua is still at 0 and the viewport is already at the bottom", () => {
    expect(virtuaScrollNeedsSync(0, 4800)).toBe(true)
  })

  it("is false when the two offsets already match", () => {
    expect(virtuaScrollNeedsSync(4800, 4800)).toBe(false)
  })

  it("is false for a sub-pixel gap", () => {
    expect(virtuaScrollNeedsSync(100, 100.4)).toBe(false)
  })

  it("is false for non-finite numbers", () => {
    expect(virtuaScrollNeedsSync(Number.NaN, 10)).toBe(false)
    expect(virtuaScrollNeedsSync(10, Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe("virtuaLayoutIsDormant", () => {
  it("is true when the DOM viewport has height but virtua still reports 0", () => {
    expect(
      virtuaLayoutIsDormant({
        itemCount: 8,
        viewportClientHeight: 420,
        virtuaViewportSize: 0,
        virtuaScrollSize: 0,
      })
    ).toBe(true)
  })

  it("is true when virtua has no scroll size yet even if offsets already match", () => {
    expect(
      virtuaLayoutIsDormant({
        itemCount: 8,
        viewportClientHeight: 420,
        virtuaViewportSize: 0,
        virtuaScrollSize: 40,
      })
    ).toBe(true)
  })

  it("is false once virtua has measured both the viewport and the list", () => {
    expect(
      virtuaLayoutIsDormant({
        itemCount: 8,
        viewportClientHeight: 420,
        virtuaViewportSize: 420,
        virtuaScrollSize: 4800,
      })
    ).toBe(false)
  })

  it("is false before items exist or the box has height", () => {
    expect(
      virtuaLayoutIsDormant({
        itemCount: 0,
        viewportClientHeight: 420,
        virtuaViewportSize: 0,
        virtuaScrollSize: 0,
      })
    ).toBe(false)
    expect(
      virtuaLayoutIsDormant({
        itemCount: 8,
        viewportClientHeight: 0,
        virtuaViewportSize: 0,
        virtuaScrollSize: 0,
      })
    ).toBe(false)
  })
})

describe("shouldSyncVirtuaToViewport", () => {
  it("refuses a viewport that has no height yet", () => {
    expect(
      shouldSyncVirtuaToViewport({
        virtuaOffset: 0,
        viewportScrollTop: 4800,
        viewportClientHeight: 0,
        itemCount: 12,
      })
    ).toBe(false)
  })

  it("refuses an empty transcript", () => {
    expect(
      shouldSyncVirtuaToViewport({
        virtuaOffset: 0,
        viewportScrollTop: 0,
        viewportClientHeight: 400,
        itemCount: 0,
      })
    ).toBe(false)
  })

  it("accepts the first-paint desync", () => {
    expect(
      shouldSyncVirtuaToViewport({
        virtuaOffset: 0,
        viewportScrollTop: 4800,
        viewportClientHeight: 400,
        itemCount: 12,
      })
    ).toBe(true)
  })

  it("wakes virtua when both offsets are 0 but the layout is still dormant", () => {
    expect(
      shouldSyncVirtuaToViewport({
        virtuaOffset: 0,
        viewportScrollTop: 0,
        viewportClientHeight: 400,
        itemCount: 12,
        virtuaViewportSize: 0,
        virtuaScrollSize: 0,
      })
    ).toBe(true)
  })

  it("does not keep waking after virtua has measured and the offsets match", () => {
    expect(
      shouldSyncVirtuaToViewport({
        virtuaOffset: 0,
        viewportScrollTop: 0,
        viewportClientHeight: 400,
        itemCount: 12,
        virtuaViewportSize: 400,
        virtuaScrollSize: 2400,
      })
    ).toBe(false)
  })

  it("wakes when offsets already match but virtua has not painted any row", () => {
    expect(
      shouldSyncVirtuaToViewport({
        virtuaOffset: 997,
        viewportScrollTop: 997,
        viewportClientHeight: 760,
        itemCount: 8,
        virtuaViewportSize: 760,
        virtuaScrollSize: 1758,
        paintedChildCount: 0,
      })
    ).toBe(true)
  })
})

describe("countVirtuaPaintedChildren", () => {
  it("counts the virtua spacer's mounted rows", () => {
    const viewport = document.createElement("div")
    viewport.innerHTML =
      '<div style="contain: size style; height: 1758px"><div></div><div></div></div>'
    expect(countVirtuaPaintedChildren(viewport)).toBe(2)
    expect(countVirtuaPaintedChildren(null)).toBe(0)
  })
})

describe("virtuaVisibleRangeUnpainted", () => {
  it("is true when items exist, virtua has a viewport, and no row is mounted", () => {
    expect(
      virtuaVisibleRangeUnpainted({
        itemCount: 8,
        virtuaViewportSize: 760,
        paintedChildCount: 0,
      })
    ).toBe(true)
  })

  it("is false once at least one row is in the DOM", () => {
    expect(
      virtuaVisibleRangeUnpainted({
        itemCount: 8,
        virtuaViewportSize: 760,
        paintedChildCount: 3,
      })
    ).toBe(false)
  })

  it("is false before virtua has a viewport or items", () => {
    expect(
      virtuaVisibleRangeUnpainted({
        itemCount: 8,
        virtuaViewportSize: 0,
        paintedChildCount: 0,
      })
    ).toBe(false)
    expect(
      virtuaVisibleRangeUnpainted({
        itemCount: 0,
        virtuaViewportSize: 760,
        paintedChildCount: 0,
      })
    ).toBe(false)
  })
})

describe("syncVirtuaToViewport", () => {
  it("calls scrollTo with the viewport scrollTop when desynced", () => {
    const scrollTo = vi.fn()
    const did = syncVirtuaToViewport(
      { scrollOffset: 0, scrollTo, viewportSize: 400, scrollSize: 5200 },
      { scrollTop: 4800, clientHeight: 400 },
      12
    )
    expect(did).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(4800)
  })

  it("still calls scrollTo(0) to wake a dormant layout at the top", () => {
    const scrollTo = vi.fn()
    const did = syncVirtuaToViewport(
      { scrollOffset: 0, scrollTo, viewportSize: 0, scrollSize: 0 },
      { scrollTop: 0, clientHeight: 400 },
      12
    )
    expect(did).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(0)
  })

  it("does not write viewport.scrollTop", () => {
    const viewport = { scrollTop: 4800, clientHeight: 400 }
    syncVirtuaToViewport(
      { scrollOffset: 0, scrollTo: vi.fn(), viewportSize: 400, scrollSize: 5200 },
      viewport,
      12
    )
    expect(viewport.scrollTop).toBe(4800)
  })

  it("calls scrollTo again when the spacer is tall but no row is painted", () => {
    const scrollTo = vi.fn()
    const did = syncVirtuaToViewport(
      {
        scrollOffset: 997,
        scrollTo,
        viewportSize: 760,
        scrollSize: 1758,
      },
      { scrollTop: 997, clientHeight: 760 },
      8,
      0
    )
    expect(did).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(997)
  })
})
