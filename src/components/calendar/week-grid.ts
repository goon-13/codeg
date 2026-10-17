const HOUR_MS = 3600000

export const DAY_START_HOUR = 7
export const DAY_END_HOUR = 22
export const HOUR_PX = 48

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const delta = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + delta)
  return x
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeekMonday(anchor)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export function eventTopPx(
  startIso: string,
  dayStartHour = DAY_START_HOUR,
  hourPx = HOUR_PX
): number {
  const start = new Date(startIso)
  const hours = start.getHours() + start.getMinutes() / 60
  return Math.max(0, (hours - dayStartHour) * hourPx)
}

export function eventHeightPx(
  startIso: string,
  endIso: string,
  hourPx = HOUR_PX
): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  return Math.max(hourPx / 4, (ms / HOUR_MS) * hourPx)
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
