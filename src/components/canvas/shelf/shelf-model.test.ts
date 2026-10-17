import { describe, expect, it } from "vitest"
import type { DbConversationSummary, FolderDetail } from "@/lib/types"
import {
  applyShelfOrder,
  buildShelfRows,
  countShelf,
  defaultVisibleFolderIds,
  defaultVisibleConversationIds,
  filterShelfMiniRows,
  fitRecentStrip,
  isActiveShelfConversation,
  mergePersistedShelfOrder,
  moveShelfOrderId,
  recentShelfConversations,
  SHELF_RECENT_OPEN_HEIGHT,
  SHELF_RECENT_PANEL_PAGE,
  nextRecentPage,
  newShelfDraftNonce,
  visibleShelfConversations,
  isShelfConversation,
  shelfContextKey,
  shelfDraftContextKey,
  intersectShelfLiveKeys,
  shelfLiveSurfaceKeys,
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
  it("isShelfConversation keeps regular and drops loop/delegate/chat", () => {
    expect(isShelfConversation(conv(1, { kind: "regular" }))).toBe(true)
    expect(isShelfConversation(conv(2, { kind: "chat" }))).toBe(false)
    expect(isShelfConversation(conv(3, { kind: "loop" }))).toBe(false)
    expect(isShelfConversation(conv(4, { kind: "delegate" }))).toBe(false)
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

  it("shelfDraftContextKey includes a per-draft nonce", () => {
    expect(shelfDraftContextKey(10, "aaa")).toBe("shelf-draft:10:aaa")
    expect(shelfDraftContextKey(10, "bbb")).not.toBe(
      shelfDraftContextKey(10, "aaa")
    )
    expect(shelfDraftContextKey(20, "aaa")).toBe("shelf-draft:20:aaa")
  })

  it("newShelfDraftNonce returns two different values", () => {
    expect(newShelfDraftNonce()).not.toBe(newShelfDraftNonce())
  })

  it("newShelfDraftNonce works when crypto.randomUUID is missing (LAN HTTP)", () => {
    const cryptoObj = globalThis.crypto as Crypto & {
      randomUUID?: () => `${string}-${string}-${string}-${string}-${string}`
    }
    const original = cryptoObj.randomUUID
    Object.defineProperty(cryptoObj, "randomUUID", {
      configurable: true,
      writable: true,
      value: undefined,
    })
    try {
      const a = newShelfDraftNonce()
      const b = newShelfDraftNonce()
      expect(a).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      )
      expect(a).not.toBe(b)
    } finally {
      Object.defineProperty(cryptoObj, "randomUUID", {
        configurable: true,
        writable: true,
        value: original,
      })
    }
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

describe("intersectShelfLiveKeys", () => {
  it("keeps only keys that are both live and mounted", () => {
    const held = intersectShelfLiveKeys(
      new Set(["shelf:7", "shelf:8"]),
      new Set(["shelf:8", "shelf:9"])
    )
    expect([...held].sort()).toEqual(["shelf:8"])
  })

  it("is empty when liveKeys was never claimed this visit", () => {
    expect([
      ...intersectShelfLiveKeys(new Set(), new Set(["shelf:8"])),
    ]).toEqual([])
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

describe("recentShelfConversations", () => {
  it("orders regular conversations newest-left and drops non-regular", () => {
    const list = recentShelfConversations([
      conv(1, { updated_at: "2026-10-01T00:00:00Z" }),
      conv(2, { kind: "chat", updated_at: "2026-10-09T00:00:00Z" }),
      conv(3, { updated_at: "2026-10-08T00:00:00Z" }),
      conv(4, { kind: "loop", updated_at: "2026-10-10T00:00:00Z" }),
    ])
    expect(list.map((c) => c.id)).toEqual([3, 1])
  })

  it("moves a bumped conversation to index 0 without dropping others", () => {
    const first = recentShelfConversations([
      conv(1, { updated_at: "2026-10-02T00:00:00Z" }),
      conv(2, { updated_at: "2026-10-01T00:00:00Z" }),
    ])
    expect(first.map((c) => c.id)).toEqual([1, 2])
    const bumped = recentShelfConversations([
      conv(1, { updated_at: "2026-10-02T00:00:00Z" }),
      conv(2, { updated_at: "2026-10-03T00:00:00Z" }),
    ])
    expect(bumped.map((c) => c.id)).toEqual([2, 1])
  })

  it("does not cap the recency list", () => {
    const many = Array.from({ length: SHELF_RECENT_PANEL_PAGE + 5 }, (_, i) =>
      conv(i + 1, {
        updated_at: `2026-10-01T00:${String(i).padStart(2, "0")}:00Z`,
      })
    )
    expect(recentShelfConversations(many)).toHaveLength(
      SHELF_RECENT_PANEL_PAGE + 5
    )
    expect(recentShelfConversations(many)[0].id).toBe(
      SHELF_RECENT_PANEL_PAGE + 5
    )
  })
})

it("locks the expanded recent chrome to three chip rows", () => {
  expect(SHELF_RECENT_OPEN_HEIGHT).toBe(32 * 3 + 8 * 2)
  expect(SHELF_RECENT_OPEN_HEIGHT).toBe(112)
})

describe("nextRecentPage", () => {
  it("skips chip ids and pages 20", () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1)
    const first = nextRecentPage(ids, [1, 2, 3], 0)
    expect(first.ids).toHaveLength(20)
    expect(first.ids[0]).toBe(4)
    expect(first.done).toBe(false)
    const second = nextRecentPage(ids, [1, 2, 3], first.nextOffset)
    expect(second.ids).toEqual([24, 25, 26, 27, 28, 29, 30])
    expect(second.done).toBe(true)
  })
})

describe("fitRecentStrip", () => {
  const ids = [1, 2, 3, 4, 5]
  const chipWidths = [80, 80, 80, 80, 80]

  it("shows every chip and no overflow when they fit", () => {
    expect(
      fitRecentStrip({
        ids,
        chipWidths,
        containerWidth: 500,
        moreWidth: 72,
        gap: 8,
        expanded: false,
      })
    ).toEqual({ visibleCount: 5, overflowCount: 0 })
  })

  it("reserves space for the more control when they do not fit", () => {
    expect(
      fitRecentStrip({
        ids,
        chipWidths,
        containerWidth: 340,
        moreWidth: 72,
        gap: 8,
        expanded: false,
      })
    ).toEqual({ visibleCount: 3, overflowCount: 2 })
  })

  it("reveals all chips when expanded", () => {
    expect(
      fitRecentStrip({
        ids,
        chipWidths,
        containerWidth: 200,
        moreWidth: 72,
        expanded: true,
      })
    ).toEqual({ visibleCount: 5, overflowCount: 0 })
  })

  it("falls back to 8 chips when the track is unmeasured", () => {
    const many = Array.from({ length: 12 }, (_, i) => i + 1)
    expect(
      fitRecentStrip({
        ids: many,
        chipWidths: many.map(() => 80),
        containerWidth: 0,
        moreWidth: 72,
        expanded: false,
      })
    ).toEqual({ visibleCount: 8, overflowCount: 4 })
  })
})
