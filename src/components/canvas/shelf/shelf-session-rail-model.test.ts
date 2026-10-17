import { describe, expect, it } from "vitest"
import type { DbConversationSummary } from "@/lib/types"

import {
  buildShelfRailRows,
  type ShelfRailRow,
} from "./shelf-session-rail-model"

const MINUTE = 60_000

function conv(
  id: number,
  folderId: number,
  overrides: Partial<DbConversationSummary> = {}
): DbConversationSummary {
  const createdAt = new Date(1_700_000_000_000 + id * MINUTE).toISOString()
  return {
    id,
    folder_id: folderId,
    title: `conv-${id}`,
    title_locked: false,
    agent_type: "claude_code",
    status: "pending",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 0,
    child_count: 0,
    created_at: createdAt,
    updated_at: createdAt,
    pinned_at: null,
    ...overrides,
  }
}

const clusters = new Map([[10, { id: 10, title: "主题" }]])

function kinds(rows: ShelfRailRow[]): string[] {
  return rows.map((row) => row.kind)
}

describe("buildShelfRailRows", () => {
  it("nests two visible regulars under one cluster header", () => {
    const a = conv(1, 7, { cluster_id: 10, agent_type: "cursor" })
    const b = conv(2, 7, { cluster_id: 10, agent_type: "grok" })
    const rows = buildShelfRailRows({
      folders: [{ id: 7, name: "proj" }],
      conversationsByFolder: new Map([[7, [a, b]]]),
      visibleConversationIds: [1, 2],
      clustersById: clusters,
    })
    expect(rows).toEqual([
      { kind: "folder", folderId: 7, title: "proj" },
      {
        kind: "cluster",
        clusterId: 10,
        title: "主题",
        memberCount: 2,
        agentTypes: ["cursor", "grok"],
        expanded: true,
        depth: 0,
      },
      { kind: "conversation", conversation: a, depth: 1 },
      { kind: "conversation", conversation: b, depth: 1 },
    ])
  })

  it("counts only the visible member after the bucket is filtered", () => {
    const a = conv(1, 7, { cluster_id: 10 })
    const hidden = conv(2, 7, { cluster_id: 10 })
    const rows = buildShelfRailRows({
      folders: [{ id: 7, name: "proj" }],
      conversationsByFolder: new Map([[7, [a, hidden]]]),
      visibleConversationIds: [1],
      clustersById: clusters,
    })
    expect(kinds(rows)).toEqual(["folder", "cluster", "conversation"])
    expect(rows[1]).toMatchObject({
      kind: "cluster",
      memberCount: 1,
      clusterId: 10,
    })
    expect(rows[2]).toEqual({
      kind: "conversation",
      conversation: a,
      depth: 1,
    })
  })

  it("emits side and delegate children at depth 2 when the parent is expanded", () => {
    const parent = conv(1, 7, { cluster_id: 10, child_count: 2 })
    const side = conv(2, 7, { kind: "side", parent_id: 1 })
    const delegate = conv(3, 7, { kind: "delegate", parent_id: 1 })
    const rows = buildShelfRailRows({
      folders: [{ id: 7, name: "proj" }],
      conversationsByFolder: new Map([[7, [parent]]]),
      visibleConversationIds: [1],
      clustersById: clusters,
      conversationExpanded: new Set([1]),
      childrenByParent: new Map([[1, [side, delegate]]]),
    })
    expect(kinds(rows)).toEqual([
      "folder",
      "cluster",
      "conversation",
      "conversation",
      "conversation",
    ])
    expect(rows[2]).toEqual({
      kind: "conversation",
      conversation: parent,
      depth: 1,
    })
    expect(rows[3]).toEqual({
      kind: "conversation",
      conversation: side,
      depth: 2,
    })
    expect(rows[4]).toEqual({
      kind: "conversation",
      conversation: delegate,
      depth: 2,
    })
  })

  it("emits no rows for an empty folder or a folder with nothing visible", () => {
    const hidden = conv(1, 8, { cluster_id: 10 })
    const sideOnly = conv(2, 9, { kind: "side", parent_id: 1 })
    const rows = buildShelfRailRows({
      folders: [
        { id: 6, name: "missing" },
        { id: 7, name: "empty" },
        { id: 8, name: "hidden" },
        { id: 9, name: "side-only" },
      ],
      conversationsByFolder: new Map<number, DbConversationSummary[]>([
        [7, []],
        [8, [hidden]],
        [9, [sideOnly]],
      ]),
      visibleConversationIds: [],
      clustersById: clusters,
    })
    expect(rows).toEqual([])
  })

  it("emits side children under a loose regular when the parent is expanded", () => {
    const parent = conv(1, 7, { child_count: 1 })
    const side = conv(2, 7, { kind: "side", parent_id: 1 })
    const collapsed = buildShelfRailRows({
      folders: [{ id: 7, name: "proj" }],
      conversationsByFolder: new Map([[7, [parent]]]),
      visibleConversationIds: [1],
      clustersById: clusters,
      childrenByParent: new Map([[1, [side]]]),
    })
    expect(kinds(collapsed)).toEqual(["folder", "conversation"])
    const expanded = buildShelfRailRows({
      folders: [{ id: 7, name: "proj" }],
      conversationsByFolder: new Map([[7, [parent]]]),
      visibleConversationIds: [1],
      clustersById: clusters,
      conversationExpanded: new Set([1]),
      childrenByParent: new Map([[1, [side]]]),
    })
    expect(kinds(expanded)).toEqual(["folder", "conversation", "conversation"])
    expect(expanded[2]).toEqual({
      kind: "conversation",
      conversation: side,
      depth: 1,
    })
  })

  it("emits a loose conversation when there is no cluster_id", () => {
    const a = conv(1, 7)
    const rows = buildShelfRailRows({
      folders: [{ id: 7, name: "proj" }],
      conversationsByFolder: new Map([[7, [a]]]),
      visibleConversationIds: [1],
      clustersById: clusters,
    })
    expect(rows).toEqual([
      { kind: "folder", folderId: 7, title: "proj" },
      { kind: "conversation", conversation: a, depth: 0 },
    ])
    expect(rows.some((row) => row.kind === "cluster")).toBe(false)
  })
})
