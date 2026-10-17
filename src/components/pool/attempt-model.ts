import type { PlanItem } from "@/lib/plan/types"
import type { WorkTask } from "@/lib/types"
import type { TrackLamp, TrackSession } from "./track-model"

export type AttemptKind = "session" | "worktask"

export type Attempt = {
  key: string
  kind: AttemptKind
  conversationId?: number
  workTaskId?: number
  folderId?: number
  agentType?: string
  status?: string
  lamp: TrackLamp
}

export type AttemptHome = { folderId: number; agentType: string }

function lampOfStatus(status?: string): TrackLamp {
  if (status === "in_progress" || status === "running" || status === "preparing") {
    return "running"
  }
  return "waitingYou"
}

function taskById(tasks: WorkTask[], id: number): WorkTask | undefined {
  return tasks.find((task) => task.id === id)
}

export function buildAttempts(
  item: PlanItem,
  tasks: WorkTask[],
  convs: Map<number, TrackSession>
): Attempt[] {
  const attempts: Attempt[] = []
  for (const id of item.conversationIds) {
    const known = convs.get(id)
    attempts.push({
      key: `session:${id}`,
      kind: "session",
      conversationId: id,
      folderId: known?.folderId,
      agentType: known?.agentType,
      status: known?.status,
      lamp: lampOfStatus(known?.status),
    })
  }
  for (const id of item.workTaskIds) {
    const task = taskById(tasks, id)
    const convId = task?.conversation_id ?? undefined
    const known = convId != null ? convs.get(convId) : undefined
    attempts.push({
      key: `worktask:${id}`,
      kind: "worktask",
      workTaskId: id,
      conversationId: convId,
      folderId: task?.folder_id ?? known?.folderId,
      agentType: task?.agent_type ?? known?.agentType,
      status: task?.status ?? known?.status,
      lamp: lampOfStatus(task?.status ?? known?.status),
    })
  }
  return attempts
}

export function resolveAttemptHome(
  item: PlanItem,
  tasks: WorkTask[],
  convs: Map<number, TrackSession>
): AttemptHome | null {
  const attempts = buildAttempts(item, tasks, convs)
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const attempt = attempts[i]
    if (attempt.kind !== "session") continue
    if (attempt.folderId != null && attempt.agentType) {
      return { folderId: attempt.folderId, agentType: attempt.agentType }
    }
  }
  for (const attempt of attempts) {
    if (attempt.kind !== "worktask") continue
    if (attempt.folderId != null && attempt.agentType) {
      return { folderId: attempt.folderId, agentType: attempt.agentType }
    }
  }
  return null
}

export function claimedWorkTaskIds(
  items: PlanItem[],
  tasks: WorkTask[]
): Set<number> {
  const claimed = new Set<number>()
  for (const item of items) {
    if (item.list !== "waiting") continue
    for (const id of item.workTaskIds) claimed.add(id)
    for (const task of tasks) {
      if (
        task.conversation_id != null &&
        item.conversationIds.includes(task.conversation_id)
      ) {
        claimed.add(task.id)
      }
    }
  }
  return claimed
}
