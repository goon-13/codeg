import { describe, expect, it } from "vitest"
import {
  clipSpanInYear,
  monthWeeks,
  weekSpanSlice,
  yearWindowStart,
} from "./calendar-zoom"

describe("yearWindowStart", () => {
  it("defaults to Jan 1 of the year before today", () => {
    const start = yearWindowStart(new Date(2026, 9, 16), new Date(2026, 9, 16))
    expect(start.getFullYear()).toBe(2025)
    expect(start.getMonth()).toBe(0)
    expect(start.getDate()).toBe(1)
  })

  it("pans to the focus year's Jan 1 when focus is not today", () => {
    const start = yearWindowStart(new Date(2024, 0, 1), new Date(2026, 9, 16))
    expect(start.getFullYear()).toBe(2024)
  })
})

describe("clipSpanInYear", () => {
  it("keeps a clipped bar with flat ends when the span crosses the window", () => {
    const start = new Date(2025, 0, 1)
    const end = new Date(2028, 0, 1)
    const clip = clipSpanInYear("2024-06-01", "2025-06-15", start, end)
    expect(clip).not.toBeNull()
    expect(clip!.flatL).toBe(true)
    expect(clip!.flatR).toBe(false)
    expect(clip!.leftPct).toBe(0)
    expect(clip!.widthPct).toBeGreaterThan(0)
  })

  it("returns null when the span is wholly outside the window", () => {
    const start = new Date(2025, 0, 1)
    const end = new Date(2028, 0, 1)
    expect(clipSpanInYear("2020-01-01", "2020-12-31", start, end)).toBeNull()
  })
})

describe("monthWeeks", () => {
  it("starts on Monday and covers November 2026", () => {
    const weeks = monthWeeks(new Date(2026, 10, 1))
    expect(weeks[0][0].getDay()).toBe(1)
    expect(weeks[0][0].getDate()).toBe(26)
    expect(weeks.some((row) => row.some((d) => d.getDate() === 30 && d.getMonth() === 10))).toBe(
      true
    )
  })
})

describe("weekSpanSlice", () => {
  it("returns one continuous slice for a span that covers several days in the week", () => {
    const week = [
      new Date(2026, 10, 2),
      new Date(2026, 10, 3),
      new Date(2026, 10, 4),
      new Date(2026, 10, 5),
      new Date(2026, 10, 6),
      new Date(2026, 10, 7),
      new Date(2026, 10, 8),
    ]
    expect(weekSpanSlice(week, "2026-11-01", "2026-11-19")).toEqual({
      firstI: 0,
      lastI: 6,
    })
    expect(weekSpanSlice(week, "2026-11-04", "2026-11-06")).toEqual({
      firstI: 2,
      lastI: 4,
    })
    expect(weekSpanSlice(week, "2026-12-01", "2026-12-10")).toBeNull()
  })
})
