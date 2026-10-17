"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WorkbenchPageTitle } from "@/components/workbench/workbench-page-title"
import type { PlanEvent, PlanItem } from "@/lib/plan/types"
import { newPlanId } from "@/lib/plan/types"
import { eventsInRange } from "@/lib/plan/ics"
import {
  deletePlanEvent,
  listPlanEvents,
  listPlanItems,
  upsertPlanEvent,
} from "@/lib/plan-api"
import {
  type CalZoom,
  clipSpanInYear,
  monthWeeks,
  weekSpanSlice,
  parseYmd,
  yearWindowEnd,
  yearWindowStart,
  ymd,
} from "./calendar-zoom"
import { toErrorMessage } from "@/lib/app-error"
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_PX,
  eventHeightPx,
  eventTopPx,
  sameDay,
  startOfWeekMonday,
  weekDays,
} from "./week-grid"

export function CalendarPageTitle() {
  const t = useTranslations("Folder.sidebar")
  return <WorkbenchPageTitle title={t("calendar")} />
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function CalendarWeekView({
  events,
  anchor,
  onCreate,
  onSelect,
}: {
  events: PlanEvent[]
  anchor: Date
  onCreate?: (start: Date, end: Date) => void
  onSelect?: (event: PlanEvent) => void
}) {
  const days = weekDays(anchor)
  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, i) => DAY_START_HOUR + i
  )
  const from = days[0]
  const to = new Date(days[6])
  to.setHours(23, 59, 59, 999)
  const visible = eventsInRange(events, from.toISOString(), to.toISOString())

  return (
    <div className="flex min-h-0 flex-1 overflow-auto" data-week-grid="">
      <div className="sticky left-0 z-10 w-12 shrink-0 bg-background text-[11px] text-muted-foreground">
        {hours.map((h) => (
          <div key={h} className="pr-1 text-right" style={{ height: HOUR_PX }}>
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>
      <div className="grid min-w-[640px] flex-1 grid-cols-7">
        {days.map((day) => {
          const weekend = day.getDay() === 0 || day.getDay() === 6
          return (
            <div
              key={day.toISOString()}
              className={`relative border-l border-border/60 ${weekend ? "bg-muted/40" : ""}`}
              style={{ height: hours.length * HOUR_PX }}
              data-day={day.toISOString()}
              onDoubleClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const y = e.clientY - rect.top
                const hour = DAY_START_HOUR + y / HOUR_PX
                const start = new Date(day)
                start.setHours(Math.floor(hour), 0, 0, 0)
                const end = new Date(start)
                end.setHours(start.getHours() + 1)
                onCreate?.(start, end)
              }}
            >
              {visible
                .filter((ev) => sameDay(new Date(ev.start), day))
                .map((ev) => (
                  <button
                    key={ev.uid}
                    type="button"
                    data-uid={ev.uid}
                    data-start={ev.start}
                    className="absolute left-1 right-1 overflow-hidden rounded-md bg-primary/80 px-1 text-left text-[11px] text-primary-foreground"
                    style={{
                      top: eventTopPx(ev.start),
                      height: eventHeightPx(ev.start, ev.end),
                    }}
                    onClick={() => onSelect?.(ev)}
                  >
                    {ev.title}
                  </button>
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarZoomBar({
  zoom,
  onZoom,
}: {
  zoom: CalZoom
  onZoom: (zoom: CalZoom) => void
}) {
  const t = useTranslations("Plan")
  const tabs: { id: CalZoom; label: "zoomYear" | "zoomMonth" | "zoomWeek" | "zoomDay" }[] =
    [
      { id: "year", label: "zoomYear" },
      { id: "month", label: "zoomMonth" },
      { id: "week", label: "zoomWeek" },
      { id: "day", label: "zoomDay" },
    ]
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {tabs.map((tab) => (
        <Button
          key={tab.id}
          size="sm"
          variant={zoom === tab.id ? "default" : "ghost"}
          data-zoom={tab.id}
          className="rounded-none"
          onClick={() => onZoom(tab.id)}
        >
          {t(tab.label)}
        </Button>
      ))}
    </div>
  )
}

export function CalendarYearView({
  events,
  today,
  windowStart,
  onOpenMonth,
}: {
  events: PlanEvent[]
  today: Date
  windowStart: Date
  onOpenMonth: (on: string) => void
}) {
  const windowEnd = yearWindowEnd(windowStart)
  const spans = events.filter((event) => event.allDay)
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-year-view="">
      {spans.map((event) => {
        const clip = clipSpanInYear(event.start, event.end, windowStart, windowEnd)
        if (!clip) return null
        return (
          <div
            key={event.uid}
            className="grid grid-cols-[8rem_1fr] border-b border-border"
          >
            <div className="px-2 py-2 text-xs">{event.title}</div>
            <div className="relative h-8">
              <button
                type="button"
                data-testid={`year-bar-${event.uid}`}
                data-flat-l={String(clip.flatL)}
                data-flat-r={String(clip.flatR)}
                className="absolute top-1.5 h-4 overflow-hidden rounded-full bg-primary px-2 text-left text-[11px] text-primary-foreground"
                style={{ left: `${clip.leftPct}%`, width: `${clip.widthPct}%` }}
                onClick={() => onOpenMonth(event.start)}
              >
                {event.title}
              </button>
              {today >= windowStart && today < windowEnd ? (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-amber-400"
                  style={{
                    left: `${((today.getTime() - windowStart.getTime()) / (windowEnd.getTime() - windowStart.getTime())) * 100}%`,
                  }}
                />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CalendarMonthView({
  events,
  items,
  anchor,
  today,
  onOpenWeek,
}: {
  events: PlanEvent[]
  items: PlanItem[]
  anchor: Date
  today: Date
  onOpenWeek: (on: string) => void
}) {
  const weeks = monthWeeks(anchor)
  const spans = events.filter((event) => event.allDay)
  const month = anchor.getMonth()
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-month-view="">
      {weeks.map((week) => (
        <div
          key={ymd(week[0])}
          className="relative grid grid-cols-7 border-b border-border"
        >
          {spans.map((event) => {
            const slice = weekSpanSlice(week, event.start, event.end)
            if (!slice) return null
            return (
              <button
                key={event.uid}
                type="button"
                data-testid={`month-span-${event.uid}`}
                className="absolute top-5 z-10 h-3.5 overflow-hidden rounded-sm bg-primary px-1 text-left text-[10px] text-primary-foreground"
                style={{
                  left: `${(slice.firstI / 7) * 100}%`,
                  width: `${((slice.lastI - slice.firstI + 1) / 7) * 100}%`,
                }}
                onClick={() => onOpenWeek(event.start)}
              >
                {slice.firstI === 0 || ymd(week[slice.firstI]) === event.start
                  ? event.title
                  : ""}
              </button>
            )
          })}
          {week.map((day) => {
            const key = ymd(day)
            const timed = events.filter(
              (event) => !event.allDay && sameDay(new Date(event.start), day)
            )
            const assigned = items.filter((item) => item.date === key)
            return (
              <button
                key={key}
                type="button"
                className={`min-h-24 border-l border-border p-1 text-left text-xs ${day.getMonth() !== month ? "opacity-40" : ""} ${sameDay(day, today) ? "bg-muted/60" : ""}`}
                onClick={() => onOpenWeek(key)}
              >
                <div>{day.getDate()}</div>
                {timed.map((event) => (
                  <div key={event.uid} className="truncate text-[11px]">
                    {event.title}
                  </div>
                ))}
                {assigned.map((item) => (
                  <div key={item.id} className="truncate text-[11px]">
                    {item.title}
                  </div>
                ))}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function CalendarDayView({
  events,
  items,
  day,
}: {
  events: PlanEvent[]
  items: PlanItem[]
  day: Date
}) {
  const t = useTranslations("Plan")
  const key = ymd(day)
  const timed = events.filter(
    (event) => !event.allDay && sameDay(new Date(event.start), day)
  )
  const assigned = items.filter((item) => item.date === key)
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-day-view="">
      <h2 className="mb-2 text-sm font-medium">{t("dayList")}</h2>
      {timed.length === 0 && assigned.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("untimedHint")}</p>
      ) : null}
      {timed.map((event) => (
        <div
          key={event.uid}
          data-testid={`day-timed-${event.uid}`}
          className="mb-1 rounded-md bg-primary/80 px-2 py-1 text-sm text-primary-foreground"
        >
          {new Date(event.start).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          {event.title}
        </div>
      ))}
      {assigned.map((item) => (
        <div
          key={item.id}
          data-testid={`day-assign-${item.id}`}
          className="mb-1 rounded-md border border-border px-2 py-1 text-sm"
        >
          {item.title}
          {item.estimateMinutes ? ` · ${item.estimateMinutes}m` : ""}
        </div>
      ))}
    </div>
  )
}

export function CalendarPage() {
  const t = useTranslations("Plan")
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const [zoom, setZoom] = useState<CalZoom>("week")
  const [anchor, setAnchor] = useState(() => startOfWeekMonday(new Date()))
  const [yearStart, setYearStart] = useState(() =>
    yearWindowStart(new Date(), new Date())
  )
  const [events, setEvents] = useState<PlanEvent[]>([])
  const [items, setItems] = useState<PlanItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<{
    title: string
    start: string
    end: string
    uid?: string
  } | null>(null)

  const load = useCallback(async () => {
    try {
      let from: Date
      let to: Date
      if (zoom === "year") {
        from = yearStart
        to = yearWindowEnd(yearStart)
      } else if (zoom === "month") {
        const weeks = monthWeeks(anchor)
        from = weeks[0][0]
        to = new Date(weeks[weeks.length - 1][6])
        to.setDate(to.getDate() + 1)
      } else if (zoom === "day") {
        from = new Date(anchor)
        from.setHours(0, 0, 0, 0)
        to = new Date(from)
        to.setDate(to.getDate() + 1)
      } else {
        const days = weekDays(anchor)
        from = days[0]
        to = new Date(days[6])
        to.setDate(to.getDate() + 1)
      }
      setEvents(await listPlanEvents(from.toISOString(), to.toISOString()))
      try {
        setItems(await listPlanItems())
      } catch {
        setItems([])
      }
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [anchor, yearStart, zoom])

  useEffect(() => {
    void load()
  }, [load])

  const label = useMemo(() => {
    if (zoom === "year") {
      return `${yearStart.getFullYear()}–${yearStart.getFullYear() + 2}`
    }
    if (zoom === "month") {
      return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`
    }
    if (zoom === "day") return ymd(anchor)
    const days = weekDays(anchor)
    return `${days[0].toLocaleDateString()} – ${days[6].toLocaleDateString()}`
  }, [anchor, yearStart, zoom])

  const goZoom = (next: CalZoom, on?: Date) => {
    const focus = on ?? anchor
    setZoom(next)
    if (next === "year") {
      setYearStart(yearWindowStart(focus, today))
      setAnchor(focus)
      return
    }
    setAnchor(next === "week" ? startOfWeekMonday(focus) : focus)
  }

  const canSave = Boolean(draft?.title.trim() && draft.start && draft.end)

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarZoomBar zoom={zoom} onZoom={(next) => goZoom(next, anchor)} />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (zoom === "year") {
              const n = new Date(yearStart.getFullYear() - 1, 0, 1)
              setYearStart(n)
              setAnchor(n)
              return
            }
            const n = new Date(anchor)
            if (zoom === "month") n.setMonth(n.getMonth() - 1)
            else n.setDate(n.getDate() - (zoom === "day" ? 1 : 7))
            setAnchor(n)
          }}
        >
          {zoom === "year"
            ? t("prevYear")
            : zoom === "month"
              ? t("prevMonth")
              : zoom === "day"
                ? t("prevDay")
                : t("prevWeek")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const now = new Date()
            if (zoom === "year") {
              const start = yearWindowStart(now, now)
              setYearStart(start)
              setAnchor(now)
              return
            }
            setAnchor(zoom === "week" ? startOfWeekMonday(now) : now)
          }}
        >
          {t("today")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (zoom === "year") {
              const n = new Date(yearStart.getFullYear() + 1, 0, 1)
              setYearStart(n)
              setAnchor(n)
              return
            }
            const n = new Date(anchor)
            if (zoom === "month") n.setMonth(n.getMonth() + 1)
            else n.setDate(n.getDate() + (zoom === "day" ? 1 : 7))
            setAnchor(n)
          }}
        >
          {zoom === "year"
            ? t("nextYear")
            : zoom === "month"
              ? t("nextMonth")
              : zoom === "day"
                ? t("nextDay")
                : t("nextWeek")}
        </Button>
        <span className="text-sm text-muted-foreground">{label}</span>
        <Button
          size="sm"
          onClick={() => {
            const start = new Date()
            start.setMinutes(0, 0, 0)
            const end = new Date(start)
            end.setHours(start.getHours() + 1)
            setDraft({
              title: "",
              start: toLocalInput(start),
              end: toLocalInput(end),
            })
          }}
        >
          {t("newEvent")}
        </Button>
      </div>
      {zoom === "year" ? (
        <CalendarYearView
          events={events}
          today={today}
          windowStart={yearStart}
          onOpenMonth={(on) => goZoom("month", parseYmd(on))}
        />
      ) : null}
      {zoom === "month" ? (
        <CalendarMonthView
          events={events}
          items={items}
          anchor={anchor}
          today={today}
          onOpenWeek={(on) => goZoom("week", parseYmd(on))}
        />
      ) : null}
      {zoom === "week" ? (
        <CalendarWeekView
          events={events}
          anchor={anchor}
          onCreate={(start, end) =>
            setDraft({
              title: "",
              start: toLocalInput(start),
              end: toLocalInput(end),
            })
          }
          onSelect={(ev) =>
            setDraft({
              uid: ev.uid,
              title: ev.title,
              start: toLocalInput(new Date(ev.start)),
              end: toLocalInput(new Date(ev.end)),
            })
          }
        />
      ) : null}
      {zoom === "day" ? (
        <CalendarDayView events={events} items={items} day={anchor} />
      ) : null}
      {draft ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3">
          <label className="text-xs">
            {t("title")}
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="text-xs">
            {t("start")}
            <Input
              type="datetime-local"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
          </label>
          <label className="text-xs">
            {t("end")}
            <Input
              type="datetime-local"
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
          <Button
            size="sm"
            disabled={!canSave}
            title={!canSave ? t("needClock") : undefined}
            onClick={async () => {
              if (!canSave || !draft) return
              await upsertPlanEvent({
                uid: draft.uid ?? `codeg-${newPlanId().slice(2)}`,
                title: draft.title.trim(),
                start: new Date(draft.start).toISOString(),
                end: new Date(draft.end).toISOString(),
                calendarFile: "calendars/home.ics",
              })
              setDraft(null)
              await load()
            }}
          >
            {t("save")}
          </Button>
          {draft.uid ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={async () => {
                await deletePlanEvent(draft.uid!)
                setDraft(null)
                await load()
              }}
            >
              {t("delete")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            {t("cancel")}
          </Button>
          {!canSave ? (
            <span className="text-xs text-muted-foreground">{t("needClock")}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
