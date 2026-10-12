"use client"

const LAYOUT_KEY = "workspace:canvas-layout"
const COLLAPSED_FOLDERS_KEY = "workspace:shelf-collapsed-folders"
const EXPANDED_CONVERSATIONS_KEY = "workspace:shelf-expanded-conversations"

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
