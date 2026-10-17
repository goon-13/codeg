import { describe, expect, it } from "vitest"
import type { DbConversationSummary, FolderDetail } from "@/lib/types"
import {
  buildShelfRows,
  countShelf,
  defaultVisibleFolderIds,
  defaultVisibleConversationIds,
  isActiveShelfConversation,
  visibleShelfConversations,
  isShelfConversation,
  shelfContextKey,
  sortShelfConversations,
} from "./shelf-model"

function conv(
  id: number,
  over: Partial<DbConversationSummary> = {}
): DbConversationSummary {
  return {
    id,
    folder_id: 1,
    title: `conv ${id}`,
    title_locked: false,
    agent_type: "claude_code",
    status: "completed",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 1,
    child_count: 0,
    created_at: "2026-08-30T00:00:00Z",
    updated_at: "2026-08-30T10:00:00Z",
    pinned_at: null,
    ...over,
  }
}

function folder(id: number, over: Partial<FolderDetail> = {}): FolderDetail {
  return {
    id,
    name: `folder-${id}`,
    path: `/tmp/folder-${id}`,
    git_branch: null,
    default_agent_type: null,
    last_opened_at: "2026-08-30T00:00:00Z",
    sort_order: id,
    color: "inherit",
    parent_id: null,
    kind: "regular",
    alias: null,
    group_id: null,
    ...over,
  }
}

describe("shelf-model", () => {
  it("isShelfConversation keeps regular and drops loop/delegate/chat/side", () => {
    expect(isShelfConversation(conv(1, { kind: "regular" }))).toBe(true)
    expect(isShelfConversation(conv(2, { kind: "chat" }))).toBe(false)
    expect(isShelfConversation(conv(3, { kind: "loop" }))).toBe(false)
    expect(isShelfConversation(conv(4, { kind: "delegate" }))).toBe(false)
    expect(isShelfConversation(conv(5, { kind: "side" }))).toBe(false)
  })

  it("countShelf splits in_progress vs pending_review and ignores others", () => {
    const counts = countShelf([
      conv(1, { status: "in_progress" }),
      conv(2, { status: "in_progress" }),
      conv(3, { status: "pending_review" }),
      conv(4, { status: "completed" }),
      conv(5, { status: "cancelled" }),
    ])
    expect(counts).toEqual({ running: 2, waiting: 1 })
  })

  it("sortShelfConversations puts pinned first then updated_at desc", () => {
    const a = conv(1, {
      updated_at: "2026-10-01T00:00:00Z",
      pinned_at: null,
      title: "old",
    })
    const b = conv(2, {
      updated_at: "2026-10-03T00:00:00Z",
      pinned_at: null,
      title: "new",
    })
    const c = conv(3, {
      updated_at: "2026-09-01T00:00:00Z",
      pinned_at: "2026-10-04T00:00:00Z",
      title: "pin",
    })
    expect(sortShelfConversations([a, b, c]).map((x) => x.id)).toEqual([
      3, 2, 1,
    ])
  })

  it("buildShelfRows one row per folder, conversations only for that folder id", () => {
    const f1 = folder(1, { name: "alpha" })
    const f2 = folder(2, { name: "beta" })
    const rows = buildShelfRows(
      [f1, f2],
      [
        conv(10, { folder_id: 1, status: "in_progress" }),
        conv(11, { folder_id: 2, status: "pending_review" }),
        conv(12, { folder_id: 1, kind: "loop" }),
        conv(13, { folder_id: 99 }),
      ]
    )
    expect(rows.map((r) => r.folder.id)).toEqual([1, 2])
    expect(rows[0].conversations.map((c) => c.id)).toEqual([10])
    expect(rows[0].counts).toEqual({ running: 1, waiting: 0 })
    expect(rows[1].conversations.map((c) => c.id)).toEqual([11])
    expect(rows[1].counts).toEqual({ running: 0, waiting: 1 })
  })

  it("buildShelfRows keeps empty folders", () => {
    const rows = buildShelfRows([folder(1)], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].conversations).toEqual([])
    expect(rows[0].counts).toEqual({ running: 0, waiting: 0 })
  })

  it("buildShelfRows orders projects by latest conversation then last_opened", () => {
    const rows = buildShelfRows(
      [folder(1, { name: "old" }), folder(2, { name: "new" })],
      [
        conv(10, {
          folder_id: 1,
          updated_at: "2026-09-01T00:00:00Z",
          status: "completed",
        }),
        conv(11, {
          folder_id: 2,
          updated_at: "2026-10-12T00:00:00Z",
          status: "completed",
        }),
      ]
    )
    expect(rows.map((r) => r.folder.id)).toEqual([2, 1])
  })

  it("visibleShelfConversations uses the edited set, else running and waiting", () => {
    const conversations = [
      conv(1, { status: "in_progress" }),
      conv(2, { status: "pending_review" }),
      conv(3, { status: "completed" }),
      conv(4, { status: "cancelled" }),
    ]
    expect(isActiveShelfConversation(conversations[0])).toBe(true)
    expect(isActiveShelfConversation(conversations[2])).toBe(false)
    expect(defaultVisibleConversationIds(conversations)).toEqual([1, 2])
    expect(
      visibleShelfConversations(conversations, null, false).map((c) => c.id)
    ).toEqual([1, 2])
    expect(
      visibleShelfConversations(conversations, [3], false).map((c) => c.id)
    ).toEqual([3])
    expect(
      visibleShelfConversations(conversations, [3], true).map((c) => c.id)
    ).toEqual([1, 2, 3, 4])
  })

  it("defaultVisibleFolderIds prefers running/waiting then newest", () => {
    const rows = buildShelfRows(
      [folder(1), folder(2), folder(3)],
      [
        conv(1, { folder_id: 1, status: "completed" }),
        conv(2, { folder_id: 2, status: "in_progress" }),
        conv(3, { folder_id: 3, status: "completed" }),
      ]
    )
    expect(defaultVisibleFolderIds(rows)).toEqual([2])
  })

  it("shelfContextKey is stable per id", () => {
    expect(shelfContextKey(7)).toBe("shelf:7")
    expect(shelfContextKey(7)).toBe("shelf:7")
    expect(shelfContextKey(8)).toBe("shelf:8")
  })
})

describe("applyShelfOrder", () => {
  it("keeps enter order when a conversation becomes newer", () => {
    const older = buildShelfRows(
      [folder(10, { name: "A" }), folder(20, { name: "B" })],
      [
        conv(1, { folder_id: 10, updated_at: "2026-10-02T00:00:00Z" }),
        conv(2, { folder_id: 20, updated_at: "2026-10-01T00:00:00Z" }),
      ]
    )
    const first = applyShelfOrder(older, null)
    expect(first.rows.map((r) => r.folder.id)).toEqual([10, 20])

    const bumped = buildShelfRows(
      [folder(10, { name: "A" }), folder(20, { name: "B" })],
      [
        conv(1, { folder_id: 10, updated_at: "2026-10-02T00:00:00Z" }),
        conv(2, { folder_id: 20, updated_at: "2026-10-03T00:00:00Z" }),
      ]
    )
    const held = applyShelfOrder(bumped, first.snapshot)
    expect(held.rows.map((r) => r.folder.id)).toEqual([10, 20])
    expect(held.rows[1].conversations[0].updated_at).toBe(
      "2026-10-03T00:00:00Z"
    )
  })
})

describe("mergePersistedShelfOrder", () => {
  it("puts unordered new folders after the user order, newest first", () => {
    const live = buildShelfRows(
      [
        folder(10, { name: "A", last_opened_at: "2026-10-01T00:00:00Z" }),
        folder(20, { name: "B", last_opened_at: "2026-10-03T00:00:00Z" }),
        folder(30, { name: "C", last_opened_at: "2026-10-02T00:00:00Z" }),
      ],
      []
    )
    const merged = mergePersistedShelfOrder(live, [10], null)
    expect(merged.map((r) => r.folder.id)).toEqual([10, 20, 30])
  })
})

describe("moveShelfOrderId", () => {
  it("moves an id up and clamps at the ends", () => {
    expect(moveShelfOrderId([10, 20, 30], 20, -1)).toEqual([20, 10, 30])
    expect(moveShelfOrderId([10, 20, 30], 10, -1)).toEqual([10, 20, 30])
  })
})

describe("shelfLiveSurfaceKeys", () => {
  it("claims only expanded conversations that are currently shown", () => {
    const rows = buildShelfRows(
      [folder(10)],
      [
        conv(7, { folder_id: 10, status: "in_progress" }),
        conv(9, { folder_id: 10, status: "completed" }),
      ]
    )
    const keys = shelfLiveSurfaceKeys(rows, new Set([7, 9]), [7])
    expect([...keys]).toEqual(["shelf:7"])
  })

  it("uses the side surface key for an expanded card", () => {
    const rows = buildShelfRows(
      [folder(10)],
      [conv(7, { folder_id: 10, status: "in_progress" })]
    )
    const keys = shelfLiveSurfaceKeys(rows, new Set([7]), [7], { 7: 99 })
    expect([...keys]).toEqual(["shelf:99"])
  })
})

describe("filterShelfMiniRows", () => {
  const rows = buildShelfRows(
    [folder(10, { name: "Alpha" }), folder(20, { name: "Beta" })],
    [
      conv(7, { folder_id: 10, title: "Fix the flaky test" }),
      conv(8, { folder_id: 10, title: "Review the patch" }),
      conv(9, { folder_id: 20, title: "Ship the shelf" }),
    ]
  )

  it("returns all rows when the query is blank", () => {
    expect(filterShelfMiniRows(rows, "  ").map((r) => r.folder.id)).toEqual([
      10, 20,
    ])
  })

  it("keeps a whole row when the folder name matches", () => {
    const hit = filterShelfMiniRows(rows, "alp")
    expect(hit.map((r) => r.folder.id)).toEqual([10])
    expect(hit[0].conversations.map((c) => c.id)).toEqual([7, 8])
  })

  it("keeps only matching conversations when the title matches", () => {
    const hit = filterShelfMiniRows(rows, "shelf")
    expect(hit.map((r) => r.folder.id)).toEqual([20])
    expect(hit[0].conversations.map((c) => c.id)).toEqual([9])
  })
})
