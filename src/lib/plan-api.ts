import { getTransport } from "@/lib/transport"
import { eventsInRange } from "@/lib/plan/ics"
import { parseIcsEvents, upsertIcsEvent, deleteIcsEvent } from "@/lib/plan/ics"
import { fileHeading, parseMdItems, serializeMdFile } from "@/lib/plan/md"
import {
  PLAN_FILE,
  PLAN_LISTS,
  type PlanEvent,
  type PlanItem,
  type PlanList,
} from "@/lib/plan/types"

export type PlanStatus = {
  root: string
  gtd: string[]
  calendars: string[]
}

type TextFile = { content: string; etag: string }

function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return getTransport().call(cmd, args) as Promise<T>
}

export function planStatus(): Promise<PlanStatus> {
  return call("plan_status")
}

export function planReadText(rel: string): Promise<TextFile> {
  return call("plan_read_text", { rel })
}

export function planWriteText(
  rel: string,
  content: string,
  etag: string
): Promise<{ etag: string }> {
  return call("plan_write_text", { rel, content, etag })
}

async function readOrEmpty(rel: string): Promise<TextFile> {
  try {
    return await planReadText(rel)
  } catch {
    return { content: "", etag: "" }
  }
}

export async function listPlanItems(): Promise<PlanItem[]> {
  const items: PlanItem[] = []
  for (const list of PLAN_LISTS) {
    const file = await readOrEmpty(PLAN_FILE[list])
    const parsed = parseMdItems(file.content, list)
    if (parsed.dirty && file.etag) {
      await planWriteText(PLAN_FILE[list], parsed.text, file.etag)
    }
    items.push(...parsed.items)
  }
  return items
}

async function writeList(list: PlanList, items: PlanItem[]): Promise<void> {
  const file = await readOrEmpty(PLAN_FILE[list])
  const text = serializeMdFile(
    fileHeading(list),
    items.filter((i) => i.list === list)
  )
  await planWriteText(PLAN_FILE[list], text, file.etag)
}

export async function upsertPlanItem(item: PlanItem): Promise<PlanItem> {
  const all = await listPlanItems()
  const without = all.filter((i) => i.id !== item.id)
  const next = [...without, item]
  await writeList(item.list, next)
  const prev = all.find((i) => i.id === item.id)
  if (prev && prev.list !== item.list) {
    await writeList(prev.list, next)
  }
  return item
}

export async function completePlanItem(id: string): Promise<PlanItem> {
  const all = await listPlanItems()
  const found = all.find((i) => i.id === id)
  if (!found) throw new Error(`missing item ${id}`)
  const done: PlanItem = { ...found, list: "done", done: true }
  await upsertPlanItem(done)
  return done
}

export async function attachPlanWorkTask(
  id: string,
  workTaskId: number
): Promise<PlanItem> {
  const all = await listPlanItems()
  const found = all.find((i) => i.id === id)
  if (!found) throw new Error(`missing item ${id}`)
  const already =
    found.workTaskIds.includes(workTaskId) && found.list === "waiting"
  if (already) return found
  const next: PlanItem = {
    ...found,
    workTaskIds: found.workTaskIds.includes(workTaskId)
      ? found.workTaskIds
      : [...found.workTaskIds, workTaskId],
    list: found.list === "done" ? "done" : "waiting",
  }
  return upsertPlanItem(next)
}

export async function attachPlanSession(
  id: string,
  conversationId: number
): Promise<PlanItem> {
  const all = await listPlanItems()
  const found = all.find((i) => i.id === id)
  if (!found) throw new Error(`missing item ${id}`)
  const already =
    found.conversationIds.includes(conversationId) && found.list === "waiting"
  if (already) return found
  const next: PlanItem = {
    ...found,
    conversationIds: found.conversationIds.includes(conversationId)
      ? found.conversationIds
      : [...found.conversationIds, conversationId],
    list: found.list === "done" ? "done" : "waiting",
  }
  return upsertPlanItem(next)
}

export async function movePlanItem(
  id: string,
  list: PlanList
): Promise<PlanItem> {
  const all = await listPlanItems()
  const found = all.find((i) => i.id === id)
  if (!found) throw new Error(`missing item ${id}`)
  if (found.list === list) return found
  return upsertPlanItem({
    ...found,
    list,
    done: list === "done",
  })
}

export async function listPlanEvents(
  from: string,
  to: string
): Promise<PlanEvent[]> {
  const status = await planStatus()
  const events: PlanEvent[] = []
  const files =
    status.calendars.length > 0 ? status.calendars : ["calendars/home.ics"]
  for (const rel of files) {
    const file = await readOrEmpty(rel)
    events.push(...parseIcsEvents(file.content, rel))
  }
  return eventsInRange(events, from, to)
}

export async function upsertPlanEvent(event: PlanEvent): Promise<PlanEvent> {
  const rel = event.calendarFile || "calendars/home.ics"
  const file = await readOrEmpty(rel)
  const next = upsertIcsEvent(file.content, { ...event, calendarFile: rel })
  await planWriteText(rel, next, file.etag)
  return event
}

export async function deletePlanEvent(uid: string): Promise<void> {
  const status = await planStatus()
  const files =
    status.calendars.length > 0 ? status.calendars : ["calendars/home.ics"]
  for (const rel of files) {
    const file = await readOrEmpty(rel)
    const next = deleteIcsEvent(file.content, uid)
    if (next !== file.content) await planWriteText(rel, next, file.etag)
  }
}
