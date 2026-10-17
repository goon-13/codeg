import type { PlanItem } from "@/lib/plan/types"
import type { WorkTask } from "@/lib/types"
import { itemsIn } from "./pool-model"
import {
  buildAttempts,
  claimedWorkTaskIds,
  type Attempt,
} from "./attempt-model"

export type TrackLamp = "running" | "waitingYou"

export type TrackSession = {
  id: number
  folderId?: number
  agentType?: string
  status?: string
}

export type TrackRow = {
  key: string
  title: string
  kind: "pool" | "worktask"
  poolId?: string
  workTaskId?: number
  sessions: TrackSession[]
  attempts: Attempt[]
  lamp: TrackLamp
}

export function lampForStatus(status?: string): TrackLamp {
  if (status === "in_progress" || status === "running" || status === "preparing") {
    return "running"
  }
  return "waitingYou"
}

function lampOfAttempts(attempts: Attempt[], taskStatus?: string): TrackLamp {
  if (taskStatus === "running" || taskStatus === "preparing") return "running"
  if (attempts.some((attempt) => attempt.lamp === "running")) return "running"
  return "waitingYou"
}

function sessionsOf(attempts: Attempt[]): TrackSession[] {
  return attempts
    .filter((attempt) => attempt.kind === "session" && attempt.conversationId != null)
    .map((attempt) => ({
      id: attempt.conversationId!,
      folderId: attempt.folderId,
      agentType: attempt.agentType,
      status: attempt.status,
    }))
}

export function buildTrackRows(
  items: PlanItem[],
  tasks: WorkTask[],
  convs: Map<number, TrackSession>
): TrackRow[] {
  const rows: TrackRow[] = []
  const claimed = claimedWorkTaskIds(items, tasks)
  for (const item of itemsIn(items, "waiting")) {
    const attempts = buildAttempts(item, tasks, convs)
    rows.push({
      key: `pool:${item.id}`,
      title: item.title,
      kind: "pool",
      poolId: item.id,
      sessions: sessionsOf(attempts),
      attempts,
      lamp: lampOfAttempts(attempts),
    })
  }
  for (const task of tasks) {
    if (task.conversation_id == null) continue
    if (task.status === "done" || task.status === "canceled") continue
    if (task.archived_at) continue
    if (claimed.has(task.id)) continue
    const id = task.conversation_id
    const known = convs.get(id)
    const sessions: TrackSession[] = [
      known ?? {
        id,
        folderId: task.folder_id,
      },
    ]
    const attempts: Attempt[] = [
      {
        key: `worktask:${task.id}`,
        kind: "worktask",
        workTaskId: task.id,
        conversationId: id,
        folderId: task.folder_id ?? known?.folderId,
        agentType: task.agent_type ?? known?.agentType,
        status: task.status,
        lamp: lampForStatus(task.status),
      },
    ]
    rows.push({
      key: `wt:${task.id}`,
      title: task.title,
      kind: "worktask",
      workTaskId: task.id,
      sessions,
      attempts,
      lamp: lampOfAttempts(attempts, task.status),
    })
  }
  return rows
}
