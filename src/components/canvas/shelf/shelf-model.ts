import type { DbConversationSummary, FolderDetail } from "@/lib/types"

export type ShelfCounts = { running: number; waiting: number }

export type ShelfProjectRow = {
  folder: FolderDetail
  conversations: DbConversationSummary[]
  counts: ShelfCounts
}

export type ShelfSessionFilter = "active" | "all"

export function isShelfConversation(c: DbConversationSummary): boolean {
  return c.kind === "regular"
}

export function isActiveShelfConversation(c: DbConversationSummary): boolean {
  return c.status === "in_progress" || c.status === "pending_review"
}

export function filterShelfConversations(
  conversations: DbConversationSummary[],
  filter: ShelfSessionFilter
): DbConversationSummary[] {
  if (filter === "all") return conversations
  return conversations.filter(isActiveShelfConversation)
}

export function countShelf(
  conversations: DbConversationSummary[]
): ShelfCounts {
  let running = 0
  let waiting = 0
  for (const c of conversations) {
    if (!isShelfConversation(c)) continue
    if (c.status === "in_progress") running += 1
    else if (c.status === "pending_review") waiting += 1
  }
  return { running, waiting }
}

export function sortShelfConversations(
  conversations: DbConversationSummary[]
): DbConversationSummary[] {
  return [...conversations].sort((a, b) => {
    const ap = a.pinned_at ? Date.parse(a.pinned_at) : 0
    const bp = b.pinned_at ? Date.parse(b.pinned_at) : 0
    if (ap !== bp) return bp - ap
    return Date.parse(b.updated_at) - Date.parse(a.updated_at)
  })
}

export function rowActivityMs(row: ShelfProjectRow): number {
  let max = Date.parse(row.folder.last_opened_at) || 0
  for (const c of row.conversations) {
    const t = Date.parse(c.updated_at)
    if (Number.isFinite(t) && t > max) max = t
  }
  return max
}

export function sortShelfRows(rows: ShelfProjectRow[]): ShelfProjectRow[] {
  return [...rows].sort((a, b) => rowActivityMs(b) - rowActivityMs(a))
}

/** Working-set default: projects with running/waiting, else the 8 newest. */
export function defaultVisibleFolderIds(rows: ShelfProjectRow[]): number[] {
  const active = rows.filter((r) => r.counts.running + r.counts.waiting > 0)
  if (active.length > 0) return active.map((r) => r.folder.id)
  return rows.slice(0, 8).map((r) => r.folder.id)
}

export function buildShelfRows(
  folders: FolderDetail[],
  conversations: DbConversationSummary[]
): ShelfProjectRow[] {
  const rows = folders.map((folder) => {
    const conversationsForFolder = sortShelfConversations(
      conversations.filter(
        (c) => c.folder_id === folder.id && isShelfConversation(c)
      )
    )
    return {
      folder,
      conversations: conversationsForFolder,
      counts: countShelf(conversationsForFolder),
    }
  })
  return sortShelfRows(rows)
}

export function shelfContextKey(conversationId: number): string {
  return `shelf:${conversationId}`
}
