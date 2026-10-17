import { describe, expect, it } from "vitest"
import {
  activeRoundIndex,
  filterRounds,
  roundsFromThread,
} from "./round-map-model"

const segs = [
  { cat: "read" as const, label: "read", count: 1, size: 4, first: 1 },
  { cat: "write" as const, label: "write", count: 2, size: 8, first: 3 },
]

describe("roundsFromThread", () => {
  it("splits on each user turn and hangs segs on the following assistant", () => {
    const rounds = roundsFromThread(
      [
        { role: "user", threadIndex: 0, label: "核验盘" },
        { role: "assistant", threadIndex: 1 },
        { role: "user", threadIndex: 2, label: "加上顶栏" },
        { role: "assistant", threadIndex: 3 },
      ],
      segs
    )
    expect(rounds).toHaveLength(2)
    expect(rounds[0]?.userLabel).toBe("核验盘")
    expect(rounds[0]?.ordinal).toBe(1)
    expect(rounds[0]?.assistantThreadIndex).toBe(1)
    expect(rounds[0]?.segs.map((s) => s.cat)).toEqual(["read"])
    expect(rounds[1]?.segs.map((s) => s.cat)).toEqual(["write"])
  })

  it("keeps a prefix assistant round without a user ordinal", () => {
    const rounds = roundsFromThread(
      [{ role: "assistant", threadIndex: 0 }],
      [{ cat: "text", label: "text", count: 1, size: 1, first: 0 }]
    )
    expect(rounds[0]?.ordinal).toBeNull()
    expect(rounds[0]?.userThreadIndex).toBeNull()
    expect(rounds[0]?.segs).toHaveLength(1)
  })
})

describe("filterRounds", () => {
  it("filters by user label substring, case-insensitive", () => {
    const rounds = roundsFromThread(
      [
        { role: "user", threadIndex: 0, label: "核验 NTFS" },
        { role: "user", threadIndex: 1, label: "Kilo 顶栏" },
      ],
      []
    )
    expect(filterRounds(rounds, "kilo")).toHaveLength(1)
    expect(filterRounds(rounds, "")).toHaveLength(2)
  })
})

describe("activeRoundIndex", () => {
  it("maps an assistant threadIndex to its round", () => {
    const rounds = roundsFromThread(
      [
        { role: "user", threadIndex: 0, label: "a" },
        { role: "assistant", threadIndex: 1 },
        { role: "user", threadIndex: 2, label: "b" },
        { role: "assistant", threadIndex: 3 },
      ],
      segs
    )
    expect(activeRoundIndex(rounds, 3)).toBe(1)
    expect(activeRoundIndex(rounds, 1)).toBe(0)
    expect(activeRoundIndex(rounds, null)).toBeNull()
  })
})
