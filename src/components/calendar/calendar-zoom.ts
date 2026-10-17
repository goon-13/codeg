import { startOfWeekMonday, weekDays } from "./week-grid"

export type CalZoom = "year" | "month" | "week" | "day"

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function parseYmd(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function yearWindowStart(focus: Date, today: Date): Date {
  if (ymd(focus) !== ymd(today)) return new Date(focus.getFullYear(), 0, 1)
  return new Date(today.getFullYear() - 1, 0, 1)
}

export function yearWindowEnd(start: Date): Date {
  return new Date(start.getFullYear() + 3, 0, 1)
}

export function clipSpanInYear(
  spanStart: string,
  spanEnd: string,
  windowStart: Date,
  windowEnd: Date
): {
  leftPct: number
  widthPct: number
  flatL: boolean
  flatR: boolean
} | null {
  const DAY = 86400000
  const total = (windowEnd.getTime() - windowStart.getTime()) / DAY
  if (total <= 0) return null
  const rawA = (parseYmd(spanStart).getTime() - windowStart.getTime()) / DAY
  const rawB = (parseYmd(spanEnd).getTime() - windowStart.getTime()) / DAY + 1
  const a = Math.max(0, rawA)
  const b = Math.min(total, rawB)
  if (b <= 0 || a >= total) return null
  return {
    leftPct: (a / total) * 100,
    widthPct: Math.max(0.8, ((b - a) / total) * 100),
    flatL: rawA < 0,
    flatR: rawB > total,
  }
}

export function monthWeeks(focus: Date): Date[][] {
  const y = focus.getFullYear()
  const m = focus.getMonth()
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0)
  let cur = startOfWeekMonday(first)
  const weeks: Date[][] = []
  while (weeks.length < 6 && (cur <= last || weeks.length < 4)) {
    weeks.push(weekDays(cur))
    cur = new Date(cur)
    cur.setDate(cur.getDate() + 7)
    if (cur.getMonth() !== m && cur > last) break
  }
  return weeks
}

export function weekSpanSlice(
  week: Date[],
  spanStart: string,
  spanEnd: string
): { firstI: number; lastI: number } | null {
  let firstI = -1
  let lastI = -1
  week.forEach((day, i) => {
    const key = ymd(day)
    if (key >= spanStart && key <= spanEnd) {
      if (firstI < 0) firstI = i
      lastI = i
    }
  })
  if (firstI < 0) return null
  return { firstI, lastI }
}
