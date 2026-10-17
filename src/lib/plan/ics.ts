import type { PlanEvent } from "./types"

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n")
  const lines: string[] = []
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function icsTimeToIso(value: string): string | null {
  const m = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/
  )
  if (!m) return null
  const stamp = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
  return m[7] ? `${stamp}Z` : stamp
}

function isoToIcs(iso: string): string {
  const z = iso.endsWith("Z")
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0")
  const da = String(d.getUTCDate()).padStart(2, "0")
  const h = String(d.getUTCHours()).padStart(2, "0")
  const mi = String(d.getUTCMinutes()).padStart(2, "0")
  const s = String(d.getUTCSeconds()).padStart(2, "0")
  return `${y}${mo}${da}T${h}${mi}${s}${z || iso.includes("Z") ? "Z" : "Z"}`
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
}

function icsDateToYmd(value: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function shiftYmd(ymd: string, days: number): string {
  const [y, mo, da] = ymd.split("-").map(Number)
  const d = new Date(y, mo - 1, da)
  d.setDate(d.getDate() + days)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function isDateField(rawKey: string, value: string): boolean {
  return /VALUE=DATE/i.test(rawKey) || /^\d{8}$/.test(value)
}

function parseVeEvent(
  block: string[],
  calendarFile: string
): PlanEvent | null {
  let uid = ""
  let title = ""
  let start = ""
  let end = ""
  let allDay = false
  let poolId: string | undefined
  for (const line of block) {
    const idx = line.indexOf(":")
    if (idx < 0) continue
    const rawKey = line.slice(0, idx)
    const key = rawKey.split(";")[0].toUpperCase()
    const value = line.slice(idx + 1)
    if (key === "UID") uid = value
    if (key === "SUMMARY") title = unescapeIcs(value)
    if (key === "DTSTART") {
      if (isDateField(rawKey, value)) {
        const ymd = icsDateToYmd(value)
        if (!ymd) return null
        start = ymd
        allDay = true
      } else {
        const iso = icsTimeToIso(value)
        if (!iso) return null
        start = iso
      }
    }
    if (key === "DTEND") {
      if (isDateField(rawKey, value)) {
        const ymd = icsDateToYmd(value)
        if (ymd) end = ymd
      } else {
        const iso = icsTimeToIso(value)
        if (iso) end = iso
      }
    }
    if (key === "X-CODEG-POOL-ID") poolId = value
  }
  if (!uid || !start) return null
  if (allDay) {
    if (!end) end = start
    else if (end > start) end = shiftYmd(end, -1)
  } else if (!end) {
    const d = new Date(start)
    d.setUTCHours(d.getUTCHours() + 1)
    end = d.toISOString().replace(".000", "")
  }
  return { uid, title: title || uid, start, end, poolId, allDay, calendarFile }
}

export function parseIcsEvents(text: string, calendarFile: string): PlanEvent[] {
  const lines = unfold(text)
  const events: PlanEvent[] = []
  let block: string[] | null = null
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      block = []
      continue
    }
    if (line === "END:VEVENT") {
      if (block) {
        const ev = parseVeEvent(block, calendarFile)
        if (ev) events.push(ev)
      }
      block = null
      continue
    }
    if (block) block.push(line)
  }
  return events
}

function renderEvent(event: PlanEvent): string {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTART:${isoToIcs(event.start)}`,
    `DTEND:${isoToIcs(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    "STATUS:CONFIRMED",
  ]
  if (event.poolId) lines.push(`X-CODEG-POOL-ID:${event.poolId}`)
  lines.push("END:VEVENT")
  return lines.join("\n")
}

export function upsertIcsEvent(text: string, event: PlanEvent): string {
  const folded = unfold(text)
  const out: string[] = []
  let replaced = false
  let inEvent = false
  let cur: string[] = []
  const flushEvent = (block: string[]) => {
    const parsed = parseVeEvent(block, event.calendarFile)
    if (parsed?.uid === event.uid) {
      out.push(renderEvent(event))
      replaced = true
    } else {
      out.push("BEGIN:VEVENT", ...block, "END:VEVENT")
    }
  }
  for (const line of folded) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true
      cur = []
      continue
    }
    if (line === "END:VEVENT") {
      flushEvent(cur)
      inEvent = false
      cur = []
      continue
    }
    if (inEvent) cur.push(line)
    else out.push(line)
  }
  if (!replaced) {
    const calEnd = out.lastIndexOf("END:VCALENDAR")
    const chunk = renderEvent(event)
    if (calEnd >= 0) out.splice(calEnd, 0, chunk)
    else {
      return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//codeg//plan//EN",
        chunk,
        "END:VCALENDAR",
        "",
      ].join("\n")
    }
  }
  if (!out.some((l) => l.startsWith("BEGIN:VCALENDAR"))) {
    return ["BEGIN:VCALENDAR", "VERSION:2.0", ...out, "END:VCALENDAR", ""].join(
      "\n"
    )
  }
  return out.join("\n").replace(/\n*$/, "\n")
}

export function deleteIcsEvent(text: string, uid: string): string {
  const folded = unfold(text)
  const out: string[] = []
  let inEvent = false
  let cur: string[] = []
  for (const line of folded) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true
      cur = []
      continue
    }
    if (line === "END:VEVENT") {
      const parsed = parseVeEvent(cur, "")
      if (parsed?.uid !== uid) out.push("BEGIN:VEVENT", ...cur, "END:VEVENT")
      inEvent = false
      cur = []
      continue
    }
    if (inEvent) cur.push(line)
    else out.push(line)
  }
  return out.join("\n").replace(/\n*$/, "\n")
}

function ymdMs(ymd: string, endOfDay = false): number {
  const [y, mo, da] = ymd.slice(0, 10).split("-").map(Number)
  const d = new Date(y, mo - 1, da)
  if (endOfDay) d.setDate(d.getDate() + 1)
  return d.getTime()
}

export function eventsInRange(
  events: PlanEvent[],
  from: string,
  to: string
): PlanEvent[] {
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  return events.filter((e) => {
    const s = e.allDay ? ymdMs(e.start) : new Date(e.start).getTime()
    const t = e.allDay ? ymdMs(e.end, true) : new Date(e.end).getTime()
    return s < b && t > a
  })
}
