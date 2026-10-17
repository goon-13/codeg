import { describe, expect, it } from "vitest"
import { mergeDashboardSegs } from "./dashboard-model"
import {
  firstToolThreadIndex,
  nextFlag,
  toolCallIdFromSeg,
} from "./run-reveal-model"

describe("nextFlag", () => {
  it("flips a boolean flag", () => {
    expect(nextFlag(false)).toBe(true)
    expect(nextFlag(true)).toBe(false)
  })
})

describe("toolCallIdFromSeg", () => {
  it("keeps the first toolCallId when merging the same cat", () => {
    const segs = mergeDashboardSegs([
      {
        threadIndex: 2,
        kind: "tool",
        toolName: "read",
        toolCallId: "a",
        size: 2,
      },
      {
        threadIndex: 2,
        kind: "tool",
        toolName: "read",
        toolCallId: "b",
        size: 2,
      },
    ])
    expect(segs[0]?.toolCallId).toBe("a")
    expect(toolCallIdFromSeg(segs[0]!)).toBe("a")
  })

  it("returns null for text segments", () => {
    const segs = mergeDashboardSegs([
      { threadIndex: 3, kind: "text", label: "文本", size: 8 },
    ])
    expect(toolCallIdFromSeg(segs[0]!)).toBeNull()
  })
})

describe("firstToolThreadIndex", () => {
  it("skips think/text and returns the first tool row", () => {
    expect(
      firstToolThreadIndex([
        { cat: "text", first: 0 },
        { cat: "think", first: 1 },
        { cat: "read", first: 4 },
        { cat: "write", first: 7 },
      ])
    ).toBe(4)
  })

  it("returns null when the strip has no tools", () => {
    expect(
      firstToolThreadIndex([
        { cat: "text", first: 0 },
        { cat: "think", first: 1 },
      ])
    ).toBeNull()
  })
})
