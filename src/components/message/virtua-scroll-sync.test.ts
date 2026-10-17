import { describe, expect, it, vi } from "vitest"
import {
  shouldSyncVirtuaToViewport,
  syncVirtuaToViewport,
  virtuaScrollNeedsSync,
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
})

describe("syncVirtuaToViewport", () => {
  it("calls scrollTo with the viewport scrollTop when desynced", () => {
    const scrollTo = vi.fn()
    const did = syncVirtuaToViewport(
      { scrollOffset: 0, scrollTo },
      { scrollTop: 4800, clientHeight: 400 },
      12
    )
    expect(did).toBe(true)
    expect(scrollTo).toHaveBeenCalledWith(4800)
  })

  it("does not write viewport.scrollTop", () => {
    const viewport = { scrollTop: 4800, clientHeight: 400 }
    syncVirtuaToViewport(
      { scrollOffset: 0, scrollTo: vi.fn() },
      viewport,
      12
    )
    expect(viewport.scrollTop).toBe(4800)
  })
})
