import { describe, expect, it } from "vitest"
import {
  maxTicksForTrack,
  tickTopPercent,
  tickWindowStart,
  tickWindowIndices,
} from "./prompt-tick-layout"

describe("maxTicksForTrack", () => {
  it("floors at 8 and caps at 50", () => {
    expect(maxTicksForTrack(0)).toBe(8)
    expect(maxTicksForTrack(100)).toBe(8)
    expect(maxTicksForTrack(360)).toBe(15)
    expect(maxTicksForTrack(10_000)).toBe(50)
  })
})

describe("tickWindowStart", () => {
  it("is 0 when everything fits", () => {
    expect(tickWindowStart(5, 8, 4)).toBe(0)
  })
  it("centers the current index when the window can move", () => {
    // window 8, n=40, center 19 → half=3 → start=16
    expect(tickWindowStart(40, 8, 19)).toBe(16)
  })
  it("clamps to the start and end", () => {
    expect(tickWindowStart(40, 8, 0)).toBe(0)
    expect(tickWindowStart(40, 8, 39)).toBe(32)
  })
})

describe("tickWindowIndices", () => {
  it("is 1:1 consecutive when n fits", () => {
    expect(tickWindowIndices(5, 8, 0)).toEqual([0, 1, 2, 3, 4])
  })
  it("is a consecutive window, not a full-span sample", () => {
    const s = tickWindowIndices(40, 8, 19)
    expect(s).toHaveLength(8)
    expect(s[0]).toBe(16)
    expect(s[s.length - 1]).toBe(23)
    expect(s).toContain(19)
    expect(s.includes(0) && s.includes(39)).toBe(false)
  })
})

describe("tickTopPercent", () => {
  it("puts first at 0 and last at 100", () => {
    expect(tickTopPercent(0, 5)).toBe(0)
    expect(tickTopPercent(4, 5)).toBe(100)
  })
})
