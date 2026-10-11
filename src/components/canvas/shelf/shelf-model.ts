import type { DbConversationSummary, FolderDetail } from "@/lib/types"

export type ShelfCounts = { running: number; waiting: number }

export type ShelfProjectRow = {
  folder: FolderDetail
  conversations: DbConversationSummary[]
  counts: ShelfCounts
}

export function isShelfConversation(c: DbConversationSummary): boolean {
  return c.kind === "regular"
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

export function buildShelfRows(
  folders: FolderDetail[],
  conversations: DbConversationSummary[]
): ShelfProjectRow[] {
  return folders.map((folder) => {
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
}

export function shelfContextKey(conversationId: number): string {
  return `shelf:${conversationId}`
}
