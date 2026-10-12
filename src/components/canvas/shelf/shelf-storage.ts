"use client"

const LAYOUT_KEY = "workspace:canvas-layout"
const COLLAPSED_FOLDERS_KEY = "workspace:shelf-collapsed-folders"
const EXPANDED_CONVERSATIONS_KEY = "workspace:shelf-expanded-conversations"
const VISIBLE_FOLDERS_KEY = "workspace:shelf-visible-folders"
const SHOW_ALL_KEY = "workspace:shelf-show-all"
const SESSION_FILTER_KEY = "workspace:shelf-session-filter"

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

/** Per-folder session filter. Missing id means `"active"` (running + waiting). */
export function loadShelfSessionFilters(): Record<number, "active" | "all"> {
  const parsed = readJson(SESSION_FILTER_KEY)
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {}
  }
  const out: Record<number, "active" | "all"> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const id = Number(key)
    if (!Number.isInteger(id)) continue
    if (value === "active" || value === "all") out[id] = value
  }
  return out
}

export function saveShelfSessionFilters(
  filters: Record<number, "active" | "all">
): void {
  writeJson(SESSION_FILTER_KEY, filters)
}
