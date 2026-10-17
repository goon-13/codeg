import { describe, expect, it } from "vitest"
import type { PlanItem } from "@/lib/plan/types"
import type { WorkTask } from "@/lib/types"
import { buildAttempts, resolveAttemptHome } from "./attempt-model"

function task(partial: Partial<WorkTask> & Pick<WorkTask, "id" | "title">): WorkTask {
  return {
    folder_id: 1,
    config: null,
    failure_reason: null,
    status: "review",
    conversation_id: 9,
    archived_at: null,
    ...partial,
  } as WorkTask
}

const item: PlanItem = {
  id: "p_deadbeef",
  title: "还没完",
  list: "waiting",
  done: false,
  conversationIds: [88, 91],
  workTaskIds: [3],
}

describe("buildAttempts", () => {
  it("builds session then worktask attempts in uri order", () => {
    const attempts = buildAttempts(
      item,
      [task({ id: 3, title: "卡", status: "review", conversation_id: 88, folder_id: 1 })],
      new Map([
        [88, { id: 88, folderId: 1, agentType: "grok", status: "pending_review" }],
        [91, { id: 91, folderId: 1, agentType: "cursor", status: "in_progress" }],
      ])
    )
    expect(attempts.map((a) => a.key)).toEqual([
      "session:88",
      "session:91",
      "worktask:3",
    ])
    expect(attempts[1].lamp).toBe("running")
    expect(resolveAttemptHome(
      item,
      [],
      new Map([
        [88, { id: 88, folderId: 1, agentType: "grok" }],
        [91, { id: 91, folderId: 2, agentType: "cursor" }],
      ])
    )).toEqual({ folderId: 2, agentType: "cursor" })
  })
})

describe("resolveAttemptHome", () => {
  it("does not invent a home when nothing is linked", () => {
    expect(
      resolveAttemptHome(
        {
          id: "p_aa",
          title: "空",
          list: "inbox",
          done: false,
          conversationIds: [],
          workTaskIds: [],
        },
        [],
        new Map()
      )
    ).toBeNull()
  })
})
