import { describe, expect, it } from "vitest"
import {
  deleteIcsEvent,
  eventsInRange,
  parseIcsEvents,
  upsertIcsEvent,
} from "./ics"

const SAMPLE = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:a
DTSTART:20261015T100000Z
DTEND:20261015T110000Z
SUMMARY:Meet
END:VEVENT
BEGIN:VEVENT
UID:b
DTSTART;VALUE=DATE:20261015
SUMMARY:All day
END:VEVENT
END:VCALENDAR
`

describe("parseIcsEvents", () => {
  it("keeps timed VEVENT and all-day VALUE=DATE", () => {
    const ev = parseIcsEvents(SAMPLE, "home.ics")
    expect(ev.map((e) => e.uid)).toEqual(["a", "b"])
    expect(ev[0].title).toBe("Meet")
    expect(ev[0].allDay).toBeFalsy()
    expect(ev[0].calendarFile).toBe("home.ics")
    expect(ev[1]).toMatchObject({
      uid: "b",
      title: "All day",
      allDay: true,
      start: "2026-10-15",
      end: "2026-10-15",
    })
  })

  it("treats DATE DTEND as exclusive", () => {
    const ev = parseIcsEvents(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:span",
        "DTSTART;VALUE=DATE:20261101",
        "DTEND;VALUE=DATE:20261120",
        "SUMMARY:Dev window",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\n"),
      "home.ics"
    )
    expect(ev[0]).toMatchObject({
      allDay: true,
      start: "2026-11-01",
      end: "2026-11-19",
    })
  })
})

describe("upsertIcsEvent", () => {
  it("round-trips a timed event", () => {
    const next = upsertIcsEvent(SAMPLE, {
      uid: "a",
      title: "Meet 2",
      start: "2026-10-15T10:00:00Z",
      end: "2026-10-15T11:30:00Z",
      calendarFile: "home.ics",
    })
    const ev = parseIcsEvents(next, "home.ics")
    expect(ev.find((row) => row.uid === "a")?.title).toBe("Meet 2")
    expect(ev.some((row) => row.uid === "b" && row.allDay)).toBe(true)
  })
})

describe("deleteIcsEvent", () => {
  it("removes by uid", () => {
    const next = deleteIcsEvent(SAMPLE, "a")
    expect(parseIcsEvents(next, "home.ics").map((row) => row.uid)).toEqual(["b"])
  })
})

describe("eventsInRange", () => {
  it("keeps overlapping windows", () => {
    const ev = parseIcsEvents(SAMPLE, "home.ics")
    expect(
      eventsInRange(ev, "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z")
    ).toHaveLength(2)
    expect(
      eventsInRange(ev, "2026-10-16T00:00:00Z", "2026-10-17T00:00:00Z")
    ).toHaveLength(0)
  })
})
