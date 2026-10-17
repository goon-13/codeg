"use client"

/**
 * In-app session toasts. Gates on whether that session is on screen, not on
 * whether the window is focused — the OS notifier already covers the latter,
 * and LAN HTTP cannot.
 */

import { toast } from "sonner"

import type { NotifyPayload } from "@/lib/desktop-notification"
import {
  getInAppSessionNotifyPrefs,
  type InAppSessionNotifyPrefs,
  type SessionNotifyEventId,
} from "@/lib/in-app-session-notify-prefs"
import {
  isConversationWorkspaceLive,
  isSessionForeground,
  isShelfViewLive,
  readForegroundSession,
  resolveForegroundSession,
  type ForegroundSession,
} from "@/lib/session-foreground"
export type SessionNotifyKind = "info" | "waiting"

export const SESSION_NOTIFY_INFO_DURATION_MS = 8000

export type SessionNotifyItem = {
  eventId: SessionNotifyEventId
  contextKey: string
  conversationId: number | null
  folderId: number | null
  agentType: string | null
  title: string
  body: string
}

export type SessionNotifyDecision =
  | { action: "drop"; reason: "disabled" | "event-off" | "foreground" | "suppressed" }
  | { action: "show"; item: SessionNotifyItem; duration: number }
  | { action: "merge"; items: SessionNotifyItem[]; duration: number }

const WAITING: ReadonlySet<SessionNotifyEventId> = new Set([
  "permission_request",
  "question_request",
  "plan_approval_request",
  "work_task",
])

export function sessionNotifyKind(id: SessionNotifyEventId): SessionNotifyKind {
  return WAITING.has(id) ? "waiting" : "info"
}

export function sessionNotifyToastId(item: SessionNotifyItem): string {
  return `codeg-session-notify:${item.contextKey}:${item.eventId}`
}

export function sessionNotifyBatchToastId(kind: SessionNotifyKind): string {
  return `codeg-session-notify:batch:${kind}`
}

function sameItem(a: SessionNotifyItem, b: SessionNotifyItem): boolean {
  return a.contextKey === b.contextKey && a.eventId === b.eventId
}

export function decideSessionNotify(
  item: SessionNotifyItem,
  showing: SessionNotifyItem[],
  opts: {
    prefs: Pick<InAppSessionNotifyPrefs, "enabled" | "events">
    foreground: ForegroundSession
    suppressed: boolean
  }
): SessionNotifyDecision {
  if (opts.suppressed) return { action: "drop", reason: "suppressed" }
  if (!opts.prefs.enabled) return { action: "drop", reason: "disabled" }
  if (opts.prefs.events[item.eventId] === false) {
    return { action: "drop", reason: "event-off" }
  }
  if (
    isSessionForeground(
      { conversationId: item.conversationId, contextKey: item.contextKey },
      opts.foreground
    )
  ) {
    return { action: "drop", reason: "foreground" }
  }
  const kind = sessionNotifyKind(item.eventId)
  const duration =
    kind === "waiting"
      ? Number.POSITIVE_INFINITY
      : SESSION_NOTIFY_INFO_DURATION_MS
  const others = showing.filter(
    (x) => sessionNotifyKind(x.eventId) === kind && !sameItem(x, item)
  )
  if (others.length >= 1) {
    return { action: "merge", items: [...others, item], duration }
  }
  return { action: "show", item, duration }
}

let showing: SessionNotifyItem[] = []
type OpenTabFn = (
  folderId: number,
  conversationId: number,
  agentType: string,
  pin?: boolean
) => void
let openTabFn: OpenTabFn | null = null
type Lander = (item: SessionNotifyItem) => void
let lander: Lander | null = null

export function setSessionNotifyOpenTab(fn: OpenTabFn | null): void {
  openTabFn = fn
}

export function setSessionNotifyLander(fn: Lander | null): void {
  lander = fn
}

export function getSessionNotifyOpenTab(): OpenTabFn | null {
  return openTabFn
}

let tabForeground: {
  liveTabId: string | null
  liveTabConversationId: number | null
} = { liveTabId: null, liveTabConversationId: null }

/** Workspace layout publishes the live tab so this module never imports the tab store. */
export function setSessionNotifyTabForeground(next: {
  liveTabId: string | null
  liveTabConversationId: number | null
}): void {
  tabForeground = next
}

function computeForeground(): ForegroundSession {
  const shelfLive = isShelfViewLive()
  const shelf = readForegroundSession()
  const tabLive = isConversationWorkspaceLive()
  return resolveForegroundSession({
    shelfViewLive: shelfLive,
    liveExpandedShelfConversationId: shelfLive ? shelf.conversationId : null,
    liveTabConversationId: tabLive ? tabForeground.liveTabConversationId : null,
    liveTabId: tabLive ? tabForeground.liveTabId : null,
  })
}

function redact(
  item: SessionNotifyItem,
  payload: NotifyPayload,
  hideBody: boolean
): SessionNotifyItem {
  const title =
    hideBody && payload.redactedTitle !== undefined
      ? payload.redactedTitle
      : payload.title || item.title
  const body =
    hideBody && payload.redactedBody !== undefined
      ? payload.redactedBody
      : payload.body || item.body
  return { ...item, title, body }
}

function raiseToast(
  title: string,
  options: {
    id: string
    description: string
    duration: number
    onOpen: () => void
    openLabel: string
  }
): void {
  toast(title, {
    id: options.id,
    description: options.description,
    duration: options.duration,
    className: "session-notify-toast",
    action: {
      label: options.openLabel,
      onClick: options.onOpen,
    },
  })
}

export function notifySession(
  item: SessionNotifyItem,
  payload: NotifyPayload,
  opts?: {
    suppressed?: boolean
    foreground?: ForegroundSession
    openLabel?: string
  }
): void {
  const prefs = getInAppSessionNotifyPrefs()
  const next = redact(item, payload, prefs.hideBody)
  const foreground = opts?.foreground ?? computeForeground()
  const decision = decideSessionNotify(next, showing, {
    prefs,
    foreground,
    suppressed: opts?.suppressed ?? false,
  })
  const openLabel = opts?.openLabel ?? "Open"
  if (decision.action === "drop") return
  if (decision.action === "show") {
    showing = [
      ...showing.filter((x) => !sameItem(x, decision.item)),
      decision.item,
    ]
    const toastItem = decision.item
    raiseToast(toastItem.title, {
      id: sessionNotifyToastId(toastItem),
      description: toastItem.body,
      duration: decision.duration,
      openLabel,
      onOpen: () => {
        if (lander) lander(toastItem)
        else void import("./session-notify-land").then((m) =>
          m.landSessionNotify(toastItem)
        )
        toast.dismiss(sessionNotifyToastId(toastItem))
      },
    })
    return
  }
  const kind = sessionNotifyKind(next.eventId)
  for (const old of showing.filter((x) => sessionNotifyKind(x.eventId) === kind)) {
    toast.dismiss(sessionNotifyToastId(old))
  }
  showing = [
    ...showing.filter((x) => sessionNotifyKind(x.eventId) !== kind),
    ...decision.items,
  ]
  const newest = decision.items[decision.items.length - 1]
  const titles = decision.items.map((i) => i.title)
  const shown = titles.slice(0, 5)
  const extra = titles.length - shown.length
  const description =
    extra > 0 ? `${shown.join(" · ")} +${extra}` : shown.join(" · ")
  const heading =
    kind === "waiting"
      ? `${decision.items.length} sessions waiting`
      : `${decision.items.length} sessions finished`
  raiseToast(heading, {
    id: sessionNotifyBatchToastId(kind),
    description,
    duration: decision.duration,
    openLabel,
    onOpen: () => {
      if (newest) {
        if (lander) lander(newest)
        else void import("./session-notify-land").then((m) =>
          m.landSessionNotify(newest)
        )
      }
      toast.dismiss(sessionNotifyBatchToastId(kind))
    },
  })
}

export function dismissSessionNotify(
  contextKey: string,
  eventId: SessionNotifyEventId
): void {
  toast.dismiss(`codeg-session-notify:${contextKey}:${eventId}`)
  showing = showing.filter(
    (x) => !(x.contextKey === contextKey && x.eventId === eventId)
  )
  const kind = sessionNotifyKind(eventId)
  const rest = showing.filter((x) => sessionNotifyKind(x.eventId) === kind)
  if (rest.length === 0) toast.dismiss(sessionNotifyBatchToastId(kind))
}

export function resetInAppSessionNotifyForTests(): void {
  showing = []
  lander = null
  openTabFn = null
  tabForeground = { liveTabId: null, liveTabConversationId: null }
}
