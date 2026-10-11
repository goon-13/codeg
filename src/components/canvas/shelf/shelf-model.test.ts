import { describe, expect, it } from "vitest"
import type { DbConversationSummary, FolderDetail } from "@/lib/types"
import {
  buildShelfRows,
  countShelf,
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

  it("shelfContextKey is stable per id", () => {
    expect(shelfContextKey(7)).toBe("shelf:7")
    expect(shelfContextKey(7)).toBe("shelf:7")
    expect(shelfContextKey(8)).toBe("shelf:8")
  })
})
