import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import {
  CalendarDayView,
  CalendarMonthView,
  CalendarWeekView,
  CalendarYearView,
  CalendarZoomBar,
} from "./calendar-page"
import type { PlanEvent, PlanItem } from "@/lib/plan/types"

const event: PlanEvent = {
  uid: "meet",
  title: "验收",
  start: "2026-10-15T10:00:00",
  end: "2026-10-15T11:00:00",
  calendarFile: "calendars/home.ics",
}

describe("CalendarWeekView", () => {
  it("places a timed block with data-uid", () => {
    render(
      <CalendarWeekView
        events={[event]}
        anchor={new Date(2026, 9, 15)}
        onSelect={vi.fn()}
      />
    )
    const block = screen.getByText("验收")
    expect(block).toHaveAttribute("data-uid", "meet")
    expect(block).toHaveAttribute("data-start", event.start)
  })
})

const copy = {
  Plan: {
    zoomYear: "Year",
    zoomMonth: "Month",
    zoomWeek: "Week",
    zoomDay: "Day",
    prevYear: "Window back one year",
    nextYear: "Window forward one year",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    prevWeek: "Previous week",
    nextWeek: "Next week",
    today: "Today",
    dayList: "Day list",
    untimedHint: "Untimed work stays in the pool.",
  },
}

const span: PlanEvent = {
  uid: "dev",
  title: "Dev window",
  start: "2026-11-01",
  end: "2026-11-19",
  allDay: true,
  calendarFile: "calendars/home.ics",
}

describe("CalendarZoomBar", () => {
  it("exposes year month week day", () => {
    const onZoom = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={copy}>
        <CalendarZoomBar zoom="week" onZoom={onZoom} />
      </NextIntlClientProvider>
    )
    expect(screen.getByRole("button", { name: "Year" })).toHaveAttribute("data-zoom", "year")
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("data-zoom", "month")
    expect(screen.getByRole("button", { name: "Week" })).toHaveAttribute("data-zoom", "week")
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("data-zoom", "day")
  })
})

describe("CalendarYearView", () => {
  it("draws one swimlane bar for an all-day span", () => {
    render(
      <CalendarYearView
        events={[span]}
        today={new Date(2026, 9, 16)}
        windowStart={new Date(2025, 0, 1)}
        onOpenMonth={vi.fn()}
      />
    )
    const bar = screen.getByTestId("year-bar-dev")
    expect(bar).toHaveTextContent("Dev window")
    expect(bar).toHaveAttribute("data-flat-l", "false")
  })
})

describe("CalendarMonthView", () => {
  it("draws one continuous bar in a week, not seven stubs", () => {
    render(
      <CalendarMonthView
        events={[span]}
        items={[]}
        anchor={new Date(2026, 10, 1)}
        today={new Date(2026, 9, 16)}
        onOpenWeek={vi.fn()}
      />
    )
    const bars = screen.getAllByTestId("month-span-dev")
    expect(bars.length).toBeGreaterThanOrEqual(1)
    expect(bars.length).toBeLessThan(7)
  })
})

describe("CalendarDayView", () => {
  it("lists timed events and dated assignments without a fake clock", () => {
    const assignment: PlanItem = {
      id: "p_deadbeef",
      title: "Ship GTD",
      list: "next",
      done: false,
      conversationIds: [],
      workTaskIds: [],
      date: "2026-10-15",
      estimateMinutes: 120,
    }
    render(
      <NextIntlClientProvider locale="en" messages={copy}>
        <CalendarDayView
          events={[event]}
          items={[assignment]}
          day={new Date(2026, 9, 15)}
        />
      </NextIntlClientProvider>
    )
    expect(screen.getByTestId("day-timed-meet")).toBeInTheDocument()
    expect(screen.getByTestId("day-assign-p_deadbeef")).toHaveTextContent("Ship GTD")
    expect(screen.getByTestId("day-assign-p_deadbeef")).not.toHaveTextContent("10:00")
  })
})
