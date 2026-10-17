import { childPercent } from "@/lib/plan/md"
import type { PlanItem, PlanList } from "@/lib/plan/types"
import { PLAN_LISTS } from "@/lib/plan/types"

export function countByList(items: PlanItem[]): Record<PlanList, number> {
  const counts = { inbox: 0, next: 0, waiting: 0, done: 0 }
  for (const item of items) counts[item.list] += 1
  return counts
}

export function completeItem(items: PlanItem[], id: string): PlanItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, list: "done", done: true } : item
  )
}

export function attachSession(
  items: PlanItem[],
  id: string,
  conversationId: number
): PlanItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    const conversationIds = item.conversationIds.includes(conversationId)
      ? item.conversationIds
      : [...item.conversationIds, conversationId]
    return {
      ...item,
      conversationIds,
      list: item.list === "done" ? "done" : "waiting",
    }
  })
}

export function attachTask(
  items: PlanItem[],
  id: string,
  workTaskId: number
): PlanItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    const workTaskIds = item.workTaskIds.includes(workTaskId)
      ? item.workTaskIds
      : [...item.workTaskIds, workTaskId]
    return {
      ...item,
      workTaskIds,
      list: item.list === "done" ? "done" : "waiting",
    }
  })
}

export function moveItem(
  items: PlanItem[],
  id: string,
  list: PlanList
): PlanItem[] {
  return items.map((item) =>
    item.id === id
      ? { ...item, list, done: list === "done" }
      : item
  )
}

export function itemsIn(items: PlanItem[], list: PlanList): PlanItem[] {
  return items.filter((item) => item.list === list)
}

export function toggleChild(
  items: PlanItem[],
  id: string,
  index: number
): PlanItem[] {
  return items.map((item) => {
    if (item.id !== id || !item.children) return item
    const children = item.children.map((child, i) =>
      i === index ? { ...child, done: !child.done } : child
    )
    return { ...item, children, percent: childPercent(children) }
  })
}

export function conversationsForTheme<
  TTag extends { id: number; name: string },
  TConv extends { id: number; tag_ids?: number[] },
>(slug: string, tags: TTag[], convs: TConv[]): TConv[] {
  const ids = new Set(
    tags.filter((tag) => tag.name === slug).map((tag) => tag.id)
  )
  if (ids.size === 0) return []
  return convs.filter((conv) => (conv.tag_ids ?? []).some((id) => ids.has(id)))
}

export { PLAN_LISTS }
