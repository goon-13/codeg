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

export function isActiveShelfConversation(c: DbConversationSummary): boolean {
  return c.status === "in_progress" || c.status === "pending_review"
}

/** First-visit default: in-progress and pending-review ids in this row. */
export function defaultVisibleConversationIds(
  conversations: DbConversationSummary[]
): number[] {
  return conversations.filter(isActiveShelfConversation).map((c) => c.id)
}

export function visibleShelfConversations(
  conversations: DbConversationSummary[],
  visibleIds: number[] | null,
  showAll: boolean
): DbConversationSummary[] {
  if (showAll) return conversations
  const allowed = new Set(
    visibleIds ?? defaultVisibleConversationIds(conversations)
  )
  return conversations.filter((c) => allowed.has(c.id))
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

export function shelfDraftContextKey(folderId: number): string {
  return `shelf-draft:${folderId}`
}

export type ShelfOrderSnapshot = {
  folderIds: number[]
  conversationIdsByFolder: Record<number, number[]>
}

function orderByIds<T>(
  items: T[],
  ids: number[],
  idOf: (item: T) => number
): T[] {
  const map = new Map(items.map((item) => [idOf(item), item]))
  const seen = new Set<number>()
  const out: T[] = []
  for (const id of ids) {
    const item = map.get(id)
    if (item) {
      out.push(item)
      seen.add(id)
    }
  }
  for (const item of items) {
    const id = idOf(item)
    if (!seen.has(id)) out.push(item)
  }
  return out
}

function snapshotOf(rows: ShelfProjectRow[]): ShelfOrderSnapshot {
  const conversationIdsByFolder: Record<number, number[]> = {}
  for (const row of rows) {
    conversationIdsByFolder[row.folder.id] = row.conversations.map((c) => c.id)
  }
  return {
    folderIds: rows.map((r) => r.folder.id),
    conversationIdsByFolder,
  }
}

export function applyShelfOrder(
  liveRows: ShelfProjectRow[],
  snapshot: ShelfOrderSnapshot | null
): { rows: ShelfProjectRow[]; snapshot: ShelfOrderSnapshot } {
  if (snapshot == null) {
    return { rows: liveRows, snapshot: snapshotOf(liveRows) }
  }
  const folderOrdered = orderByIds(
    liveRows,
    snapshot.folderIds,
    (row) => row.folder.id
  )
  const rows = folderOrdered.map((row) => ({
    ...row,
    conversations: orderByIds(
      row.conversations,
      snapshot.conversationIdsByFolder[row.folder.id] ?? [],
      (c) => c.id
    ),
  }))
  return { rows, snapshot: snapshotOf(rows) }
}

export function mergePersistedShelfOrder(
  liveRows: ShelfProjectRow[],
  folderOrder: number[] | null,
  conversationOrderByFolder: Record<number, number[]> | null
): ShelfProjectRow[] {
  const folderOrdered =
    folderOrder == null
      ? liveRows
      : orderByIds(liveRows, folderOrder, (row) => row.folder.id)
  if (conversationOrderByFolder == null) return folderOrdered
  return folderOrdered.map((row) => ({
    ...row,
    conversations: orderByIds(
      row.conversations,
      conversationOrderByFolder[row.folder.id] ?? [],
      (c) => c.id
    ),
  }))
}

export function moveShelfOrderId(
  ids: number[],
  id: number,
  delta: number
): number[] {
  const from = ids.indexOf(id)
  if (from < 0) return ids
  const to = Math.max(0, Math.min(ids.length - 1, from + delta))
  if (to === from) return ids
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function shelfLiveSurfaceKeys(
  rows: ShelfProjectRow[],
  expandedIds: ReadonlySet<number>,
  visibleConversationIds: number[] | null
): Set<string> {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const c of visibleShelfConversations(
      row.conversations,
      visibleConversationIds,
      false
    )) {
      if (expandedIds.has(c.id)) keys.add(shelfContextKey(c.id))
    }
  }
  return keys
}

function matchesMiniQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query)
}

export function filterShelfMiniRows(
  rows: ShelfProjectRow[],
  query: string
): ShelfProjectRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.flatMap((row) => {
    if (matchesMiniQuery(row.folder.name, needle)) return [row]
    const conversations = row.conversations.filter((conversation) =>
      matchesMiniQuery(conversation.title ?? "", needle)
    )
    if (conversations.length === 0) return []
    return [{ ...row, conversations }]
  })
}
