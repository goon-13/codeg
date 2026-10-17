"use client"

const LAYOUT_KEY = "workspace:canvas-layout"
const COLLAPSED_FOLDERS_KEY = "workspace:shelf-collapsed-folders"
const EXPANDED_CONVERSATIONS_KEY = "workspace:shelf-expanded-conversations"
const VISIBLE_FOLDERS_KEY = "workspace:shelf-visible-folders"
const SHOW_ALL_KEY = "workspace:shelf-show-all"
const VISIBLE_CONVERSATIONS_KEY = "workspace:shelf-visible-conversations"
const SHOW_ALL_CONVERSATIONS_KEY = "workspace:shelf-show-all-conversations"

export type CanvasLayoutMode = "shelf" | "board"

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore storage quota/permission failures */
  }
}

function loadIds(key: string): number[] {
  const parsed = readJson(key)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((id): id is number => Number.isInteger(id))
}

export function loadCanvasLayoutMode(): CanvasLayoutMode {
  const parsed = readJson(LAYOUT_KEY)
  return parsed === "shelf" || parsed === "board" ? parsed : "shelf"
}

export function saveCanvasLayoutMode(mode: CanvasLayoutMode): void {
  writeJson(LAYOUT_KEY, mode)
}

export const CANVAS_LAYOUT_EVENT = "codeg:canvas-layout"

export function setCanvasLayoutMode(mode: CanvasLayoutMode): void {
  saveCanvasLayoutMode(mode)
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CANVAS_LAYOUT_EVENT, { detail: mode }))
  }
}

export function loadShelfCollapsedFolderIds(): number[] {
  return loadIds(COLLAPSED_FOLDERS_KEY)
}

export function saveShelfCollapsedFolderIds(ids: number[]): void {
  writeJson(COLLAPSED_FOLDERS_KEY, [...ids])
}

export function loadShelfExpandedConversationIds(): number[] {
  return loadIds(EXPANDED_CONVERSATIONS_KEY)
}

export function saveShelfExpandedConversationIds(ids: number[]): void {
  writeJson(EXPANDED_CONVERSATIONS_KEY, [...ids])
}

/** `null` means the user has not edited the working set — use the auto default. */
export function loadShelfVisibleFolderIds(): number[] | null {
  const parsed = readJson(VISIBLE_FOLDERS_KEY)
  if (parsed == null) return null
  if (!Array.isArray(parsed)) return null
  return parsed.filter((id): id is number => Number.isInteger(id))
}

export function saveShelfVisibleFolderIds(ids: number[] | null): void {
  if (ids == null) {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(VISIBLE_FOLDERS_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  writeJson(VISIBLE_FOLDERS_KEY, [...ids])
}

export function loadShelfShowAll(): boolean {
  return readJson(SHOW_ALL_KEY) === true
}

export function saveShelfShowAll(showAll: boolean): void {
  writeJson(SHOW_ALL_KEY, showAll)
}

/** `null` means the conversation working set has not been edited. */
export function loadShelfVisibleConversationIds(): number[] | null {
  const parsed = readJson(VISIBLE_CONVERSATIONS_KEY)
  if (parsed == null) return null
  if (!Array.isArray(parsed)) return null
  return parsed.filter((id): id is number => Number.isInteger(id))
}

export function saveShelfVisibleConversationIds(ids: number[] | null): void {
  if (ids == null) {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(VISIBLE_CONVERSATIONS_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  writeJson(VISIBLE_CONVERSATIONS_KEY, [...ids])
}

/** Folder ids whose rows currently list every conversation. */
export function loadShelfShowAllConversationFolderIds(): number[] {
  return loadIds(SHOW_ALL_CONVERSATIONS_KEY)
}

export function saveShelfShowAllConversationFolderIds(ids: number[]): void {
  writeJson(SHOW_ALL_CONVERSATIONS_KEY, [...ids])
}

export function loadShelfFolderOrder(): number[] | null {
  const parsed = readJson(FOLDER_ORDER_KEY)
  if (parsed == null) return null
  if (!Array.isArray(parsed)) return null
  return parsed.filter((id): id is number => Number.isInteger(id))
}

export function saveShelfFolderOrder(ids: number[] | null): void {
  if (ids == null) {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(FOLDER_ORDER_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  writeJson(FOLDER_ORDER_KEY, [...ids])
}

export function loadShelfConversationOrder(): Record<number, number[]> | null {
  const parsed = readJson(CONVERSATION_ORDER_KEY)
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null
  }
  const out: Record<number, number[]> = {}
  for (const [key, value] of Object.entries(parsed)) {
    const folderId = Number(key)
    if (!Number.isInteger(folderId) || !Array.isArray(value)) continue
    out[folderId] = value.filter((id): id is number => Number.isInteger(id))
  }
  return out
}

export function saveShelfConversationOrder(
  byFolder: Record<number, number[]> | null
): void {
  if (byFolder == null) {
    if (typeof window === "undefined") return
    try {
      localStorage.removeItem(CONVERSATION_ORDER_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  const serialized: Record<string, number[]> = {}
  for (const [folderId, ids] of Object.entries(byFolder)) {
    serialized[folderId] = [...ids]
  }
  writeJson(CONVERSATION_ORDER_KEY, serialized)
}

/** Shelf session rail. Missing or unreadable storage stays collapsed. */
const SESSION_RAIL_OPEN_KEY = "codeg.shelf.sessionRailOpen"

export function loadShelfSessionRailOpen(): boolean {
  return readJson(SESSION_RAIL_OPEN_KEY) === true
}

export function saveShelfSessionRailOpen(open: boolean): void {
  writeJson(SESSION_RAIL_OPEN_KEY, open)
}
