export type PlanList = "inbox" | "next" | "waiting" | "done"

export type PlanChild = {
  title: string
  done: boolean
}

export type PlanItem = {
  id: string
  title: string
  list: PlanList
  done: boolean
  conversationIds: number[]
  workTaskIds: number[]
  children?: PlanChild[]
  progress?: string[]
  next?: string
  theme?: string
  percent?: number | null
  date?: string
  estimateMinutes?: number
}

export type PlanEvent = {
  uid: string
  title: string
  start: string
  end: string
  poolId?: string
  allDay?: boolean
  calendarFile: string
}

export const PLAN_LISTS: PlanList[] = ["inbox", "next", "waiting", "done"]

export const PLAN_FILE: Record<PlanList, string> = {
  inbox: "gtd/inbox.md",
  next: "gtd/next-actions.md",
  waiting: "gtd/waiting.md",
  done: "gtd/done.md",
}

export const PLAN_HEADING: Record<PlanList, string> = {
  inbox: "Inbox",
  next: "Next actions",
  waiting: "Waiting",
  done: "Done",
}

export function newPlanId(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return `p_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`
}
