import { describe, expect, it } from "vitest"
import {
  eventHeightPx,
  eventTopPx,
  startOfWeekMonday,
  weekDays,
} from "./week-grid"

describe("startOfWeekMonday", () => {
  it("uses Monday as the first day", () => {
    const thu = new Date(2026, 9, 15)
    const mon = startOfWeekMonday(thu)
    expect(mon.getDay()).toBe(1)
    expect(mon.getDate()).toBe(12)
  })
})

describe("weekDays", () => {
  it("returns seven days starting Monday", () => {
    const days = weekDays(new Date(2026, 9, 15))
    expect(days).toHaveLength(7)
    expect(days[0].getDay()).toBe(1)
    expect(days[6].getDay()).toBe(0)
  })
})

describe("event geometry", () => {
  it("places 10:00–11:00 three hours below 07:00", () => {
    expect(eventTopPx("2026-10-15T10:00:00", 7, 48)).toBe(144)
    expect(eventHeightPx("2026-10-15T10:00:00", "2026-10-15T11:00:00", 48)).toBe(
      48
    )
  })
})
