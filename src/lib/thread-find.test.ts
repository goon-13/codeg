import { describe, expect, it } from "vitest"

import { collectThreadFindHits, nextFindIndex } from "./thread-find"

const items = [
  { kind: "turn", text: "ECONNRESET from proxy" },
  { kind: "turn", text: "ok" },
  { kind: "compaction", text: "proxy died" },
]

describe("collectThreadFindHits", () => {
  it("finds in turns and compaction", () => {
    expect(collectThreadFindHits(items, "proxy").map((h) => h.index)).toEqual([0, 2])
  })

  it("keeps the matched item text as haystack", () => {
    expect(collectThreadFindHits(items, "proxy")).toEqual([
      { index: 0, haystack: "ECONNRESET from proxy" },
      { index: 2, haystack: "proxy died" },
    ])
  })

  it("matches case-insensitively", () => {
    expect(collectThreadFindHits(items, "PROXY").map((h) => h.index)).toEqual([0, 2])
    expect(collectThreadFindHits(items, "econnreset").map((h) => h.index)).toEqual([0])
  })

  it("returns [] for an empty or whitespace query", () => {
    expect(collectThreadFindHits(items, "")).toEqual([])
    expect(collectThreadFindHits(items, "   ")).toEqual([])
    expect(collectThreadFindHits(items, "\n\t")).toEqual([])
  })
})

describe("nextFindIndex", () => {
  it("wraps next", () => {
    const hits = collectThreadFindHits(items, "proxy")
    expect(nextFindIndex(hits, 0, 1)).toBe(1)
    expect(nextFindIndex(hits, 1, 1)).toBe(0)
  })

  it("wraps previous", () => {
    const hits = collectThreadFindHits(items, "proxy")
    expect(nextFindIndex(hits, 0, -1)).toBe(1)
    expect(nextFindIndex(hits, 1, -1)).toBe(0)
  })

  it("returns 0 when there are no hits", () => {
    expect(nextFindIndex([], 0, 1)).toBe(0)
    expect(nextFindIndex([], 3, -1)).toBe(0)
  })
})
