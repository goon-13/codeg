import { describe, expect, it } from "vitest"
import {
  findPlaceholderSpans,
  nextPlaceholderSpan,
} from "./select-placeholder"

describe("findPlaceholderSpans", () => {
  it("returns string offsets for each {{var}}", () => {
    const spans = findPlaceholderSpans("改 {{文件}} 于 {{文件}}")
    expect(spans).toEqual([
      { name: "文件", start: 2, end: 8 },
      { name: "文件", start: 11, end: 17 },
    ])
  })
})

describe("nextPlaceholderSpan", () => {
  const spans = findPlaceholderSpans("{{a}} x {{b}}")
  it("walks forward and wraps", () => {
    expect(nextPlaceholderSpan(spans, 0, 1)?.name).toBe("a")
    expect(nextPlaceholderSpan(spans, spans[0].end, 1)?.name).toBe("b")
    expect(nextPlaceholderSpan(spans, spans[1].end, 1)?.name).toBe("a")
  })
  it("walks backward", () => {
    expect(nextPlaceholderSpan(spans, spans[1].start, -1)?.name).toBe("a")
  })
  it("returns null when empty", () => {
    expect(nextPlaceholderSpan([], 0, 1)).toBeNull()
  })
})
