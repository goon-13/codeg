"use client"

/**
 * In-app session-toast preferences. Twin of desktop-notification-prefs:
 * per-device localStorage, because a phone browser on the same server must
 * not inherit the desktop's toast switches — and because LAN HTTP cannot
 * use the OS notification permission at all.
 */

import { useSyncExternalStore } from "react"

const PREFS_KEY = "settings:in-app-session-notify:v1"
const PREFS_EVENT = "codeg:in-app-session-notify-changed"

export const SESSION_NOTIFY_EVENT_IDS = [
  "turn_complete",
  "permission_request",
  "question_request",
  "plan_approval_request",
  "error",
  "background_task",
  "work_task",
] as const

export type SessionNotifyEventId = (typeof SESSION_NOTIFY_EVENT_IDS)[number]

export interface InAppSessionNotifyPrefs {
  enabled: boolean
  hideBody: boolean
  events: Record<SessionNotifyEventId, boolean>
}

function defaultEvents(): Record<SessionNotifyEventId, boolean> {
  return {
    turn_complete: true,
    permission_request: true,
    question_request: true,
    plan_approval_request: true,
    error: true,
    background_task: true,
    work_task: true,
  }
}

export const DEFAULT_IN_APP_SESSION_NOTIFY_PREFS: InAppSessionNotifyPrefs = {
  enabled: true,
  hideBody: false,
  events: defaultEvents(),
}

export function parseInAppSessionNotifyPrefs(
  raw: unknown
): InAppSessionNotifyPrefs {
  const defaults = DEFAULT_IN_APP_SESSION_NOTIFY_PREFS
  if (!raw || typeof raw !== "object") {
    return { ...defaults, events: { ...defaults.events } }
  }
  const source = raw as Record<string, unknown>
  const events = { ...defaults.events }
  const storedEvents = source.events
  if (storedEvents && typeof storedEvents === "object") {
    const entries = storedEvents as Record<string, unknown>
    for (const id of SESSION_NOTIFY_EVENT_IDS) {
      const value = entries[id]
      if (typeof value === "boolean") events[id] = value
    }
  }
  return {
    enabled:
      typeof source.enabled === "boolean" ? source.enabled : defaults.enabled,
    hideBody:
      typeof source.hideBody === "boolean"
        ? source.hideBody
        : defaults.hideBody,
    events,
  }
}

export function loadInAppSessionNotifyPrefs(): InAppSessionNotifyPrefs {
  const defaults = DEFAULT_IN_APP_SESSION_NOTIFY_PREFS
  if (typeof window === "undefined") {
    return { ...defaults, events: { ...defaults.events } }
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...defaults, events: { ...defaults.events } }
    return parseInAppSessionNotifyPrefs(JSON.parse(raw))
  } catch {
    return { ...defaults, events: { ...defaults.events } }
  }
}

export function saveInAppSessionNotifyPrefs(
  prefs: InAppSessionNotifyPrefs
): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }))
}

let snapshot: InAppSessionNotifyPrefs | null = null
const listeners = new Set<() => void>()
let windowBound = false

function bindWindow(): void {
  if (windowBound || typeof window === "undefined") return
  windowBound = true
  const invalidate = () => {
    snapshot = null
    for (const listener of listeners) listener()
  }
  window.addEventListener(PREFS_EVENT, invalidate)
  window.addEventListener("storage", invalidate)
}

export function getInAppSessionNotifyPrefs(): InAppSessionNotifyPrefs {
  bindWindow()
  if (typeof window === "undefined") return DEFAULT_IN_APP_SESSION_NOTIFY_PREFS
  snapshot ??= loadInAppSessionNotifyPrefs()
  return snapshot
}

export function subscribeInAppSessionNotifyPrefs(
  onChange: () => void
): () => void {
  bindWindow()
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

function getServerInAppSessionNotifyPrefs(): InAppSessionNotifyPrefs {
  return DEFAULT_IN_APP_SESSION_NOTIFY_PREFS
}

export function useInAppSessionNotifyPrefs(): InAppSessionNotifyPrefs {
  return useSyncExternalStore(
    subscribeInAppSessionNotifyPrefs,
    getInAppSessionNotifyPrefs,
    getServerInAppSessionNotifyPrefs
  )
}

export function resetInAppSessionNotifyPrefsCacheForTests(): void {
  snapshot = null
}
