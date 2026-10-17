import { describe, expect, it } from "vitest"
import type { PlanItem } from "@/lib/plan/types"
import {
  attachSession,
  attachTask,
  completeItem,
  conversationsForTheme,
  countByList,
  moveItem,
  toggleChild,
} from "./pool-model"

const items: PlanItem[] = [
  {
    id: "p_11111111",
    title: "A",
    list: "inbox",
    done: false,
    conversationIds: [],
    workTaskIds: [],
  },
  {
    id: "p_22222222",
    title: "B",
    list: "waiting",
    done: false,
    conversationIds: [3],
    workTaskIds: [],
  },
]

describe("countByList", () => {
  it("counts each column", () => {
    expect(countByList(items)).toEqual({
      inbox: 1,
      next: 0,
      waiting: 1,
      done: 0,
    })
  })
})

describe("completeItem", () => {
  it("moves the row to done", () => {
    const next = completeItem(items, "p_22222222")
    expect(next[1]).toMatchObject({ list: "done", done: true })
  })
})

describe("attachSession", () => {
  it("moves an inbox row to waiting and keeps the chip", () => {
    const next = attachSession(items, "p_11111111", 88)
    expect(next[0]).toMatchObject({
      list: "waiting",
      conversationIds: [88],
    })
  })
})

describe("attachTask", () => {
  it("appends a work-task id and moves to waiting", () => {
    const next = attachTask(items, "p_11111111", 3)
    expect(next[0]).toMatchObject({
      list: "waiting",
      workTaskIds: [3],
    })
  })
})

describe("moveItem", () => {
  it("moves inbox to waiting without completing", () => {
    expect(moveItem(items, "p_11111111", "waiting")[0]).toMatchObject({
      list: "waiting",
      done: false,
    })
  })
})

describe("toggleChild", () => {
  it("flips a child and recomputes honest percent", () => {
    const row: PlanItem = {
      ...items[0],
      children: [
        { title: "Research", done: true },
        { title: "Year pan", done: false },
      ],
      percent: 50,
    }
    const next = toggleChild([row], row.id, 1)
    expect(next[0].children?.[1].done).toBe(true)
    expect(next[0].percent).toBe(100)
  })
})

describe("conversationsForTheme", () => {
  it("lists sessions that carry the matching tag across folders", () => {
    const found = conversationsForTheme(
      "gtd-compose",
      [
        { id: 7, folder_id: 1, name: "gtd-compose", color: "#2563eb", sort_order: 0 },
        { id: 8, folder_id: 2, name: "other", color: "#16a34a", sort_order: 0 },
      ],
      [
        {
          id: 88,
          folder_id: 1,
          title: "in folder 1",
          tag_ids: [7],
        },
        {
          id: 99,
          folder_id: 9,
          title: "other folder same tag",
          tag_ids: [7],
        },
        {
          id: 11,
          folder_id: 2,
          title: "wrong tag",
          tag_ids: [8],
        },
      ]
    )
    expect(found.map((c) => c.id)).toEqual([88, 99])
  })
})
