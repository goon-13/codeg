import { describe, expect, it } from "vitest"
import type { PlanItem } from "@/lib/plan/types"
import type { WorkTask } from "@/lib/types"
import { buildTrackRows, lampForStatus } from "./track-model"

const waiting: PlanItem = {
  id: "p_deadbeef",
  title: "还没完",
  list: "waiting",
  done: false,
  conversationIds: [88],
  workTaskIds: [],
}

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

describe("lampForStatus", () => {
  it("marks in_progress as running", () => {
    expect(lampForStatus("in_progress")).toBe("running")
    expect(lampForStatus("completed")).toBe("waitingYou")
    expect(lampForStatus("pending_review")).toBe("waitingYou")
  })
})

describe("buildTrackRows", () => {
  it("keeps a waiting row when the session light is off", () => {
    const rows = buildTrackRows(
      [waiting],
      [],
      new Map([[88, { id: 88, folderId: 1, status: "pending_review" }]])
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: "pool:p_deadbeef",
      kind: "pool",
      lamp: "waitingYou",
    })
    expect(rows[0].sessions[0]).toMatchObject({ id: 88, folderId: 1 })
  })

  it("marks a waiting row running when any session is in_progress", () => {
    const rows = buildTrackRows(
      [waiting],
      [],
      new Map([[88, { id: 88, folderId: 2, status: "in_progress" }]])
    )
    expect(rows[0].lamp).toBe("running")
  })

  it("projects live work tasks and ignores done ones", () => {
    const rows = buildTrackRows(
      [],
      [
        task({ id: 1, title: "活着", status: "running", conversation_id: 3 }),
        task({ id: 2, title: "收工", status: "done", conversation_id: 4 }),
      ],
      new Map([[3, { id: 3, folderId: 7, status: "in_progress" }]])
    )
    expect(rows.map((r) => r.workTaskId)).toEqual([1])
    expect(rows[0].lamp).toBe("running")
    expect(rows[0].kind).toBe("worktask")
  })

  it("does not project a work task already claimed by a waiting row", () => {
    const rows = buildTrackRows(
      [{ ...waiting, workTaskIds: [1] }],
      [task({ id: 1, title: "已挂", status: "review", conversation_id: 88 })],
      new Map([[88, { id: 88, folderId: 1, status: "pending_review" }]])
    )
    expect(rows.map((r) => r.key)).toEqual(["pool:p_deadbeef"])
    expect(rows[0].attempts.some((a) => a.key === "worktask:1")).toBe(true)
  })
})
