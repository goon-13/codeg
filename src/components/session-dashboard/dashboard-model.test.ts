import { describe, expect, it } from "vitest"
import {
  TIMELINE_BAR_W,
  catFromDashboardBlock,
  contextBarModel,
  mergeDashboardSegs,
  segHeightPx,
} from "./dashboard-model"

describe("catFromDashboardBlock", () => {
  it("maps text and thinking without tool names", () => {
    expect(catFromDashboardBlock({ threadIndex: 0, kind: "text" })).toBe("text")
    expect(catFromDashboardBlock({ threadIndex: 1, kind: "thinking" })).toBe(
      "think"
    )
  })

  it("uses classifyToolKind and lets failure override", () => {
    expect(
      catFromDashboardBlock({ threadIndex: 0, kind: "tool", toolName: "read" })
    ).toBe("read")
    expect(
      catFromDashboardBlock({ threadIndex: 0, kind: "tool", toolName: "write" })
    ).toBe("write")
    expect(
      catFromDashboardBlock({ threadIndex: 0, kind: "tool", toolName: "grep" })
    ).toBe("search")
    expect(
      catFromDashboardBlock({
        threadIndex: 0,
        kind: "tool",
        toolName: "read",
        toolFailed: true,
      })
    ).toBe("error")
  })
})

describe("mergeDashboardSegs", () => {
  it("merges adjacent same cat and keeps first threadIndex", () => {
    const segs = mergeDashboardSegs([
      { threadIndex: 2, kind: "tool", toolName: "read", label: "读取", size: 10 },
      { threadIndex: 2, kind: "tool", toolName: "read", label: "读取", size: 4 },
      { threadIndex: 3, kind: "text", label: "文本", size: 8 },
    ])
    expect(segs).toEqual([
      { cat: "read", label: "读取", count: 2, size: 14, first: 2 },
      { cat: "text", label: "文本", count: 1, size: 8, first: 3 },
    ])
  })

  it("skips skip blocks", () => {
    expect(mergeDashboardSegs([{ threadIndex: 0, kind: "skip" }])).toEqual([])
  })
})

describe("geometry", () => {
  it("clamps height and keeps bar width 12", () => {
    expect(TIMELINE_BAR_W).toBe(12)
    expect(segHeightPx(0, 100)).toBe(8)
    expect(segHeightPx(100, 100)).toBe(26)
  })
})

describe("contextBarModel", () => {
  it("prefers live used/max when used > 0", () => {
    const m = contextBarModel({
      liveUsed: 12000,
      liveMax: 128000,
      statsUsed: 1,
      statsMax: 2,
      statsPercent: 99,
    })
    expect(m.used).toBe(12000)
    expect(m.max).toBe(128000)
    expect(m.percent).toBeCloseTo((12000 / 128000) * 100)
    expect(m.warn).toBe(false)
  })

  it("treats live used=0 as missing", () => {
    const m = contextBarModel({
      liveUsed: 0,
      liveMax: 128000,
      statsUsed: 80000,
      statsMax: 128000,
      statsPercent: null,
    })
    expect(m.used).toBe(80000)
    expect(m.warn).toBe(true)
  })
})
