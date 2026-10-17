/**
 * Which session the user is looking at right now.
 *
 * OS notifications gate on the window. In-app toasts gate on the session:
 * the one whose transcript is actually on screen. A keep-alive tab sitting
 * in `.conversation-tab-hidden` is not on screen, and neither is a shelf
 * card buried under `inert`.
 */

export type ForegroundSession = {
  conversationId: number | null
  contextKey: string | null
}

export function isLiveElement(el: Element | null | undefined): boolean {
  if (!el) return false
  if (el.closest("[inert]")) return false
  if (el.closest(".conversation-tab-hidden")) return false
  return true
}

export function resolveForegroundSession(input: {
  shelfViewLive: boolean
  liveExpandedShelfConversationId: number | null
  liveTabConversationId: number | null
  liveTabId: string | null
}): ForegroundSession {
  if (input.shelfViewLive) {
    if (input.liveExpandedShelfConversationId != null) {
      const id = input.liveExpandedShelfConversationId
      return { conversationId: id, contextKey: `shelf:${id}` }
    }
    return { conversationId: null, contextKey: null }
  }
  if (input.liveTabId) {
    return {
      conversationId: input.liveTabConversationId,
      contextKey: input.liveTabId,
    }
  }
  return { conversationId: null, contextKey: null }
}

export function isSessionForeground(
  target: { conversationId: number | null; contextKey: string },
  foreground: ForegroundSession
): boolean {
  if (
    target.conversationId != null &&
    foreground.conversationId != null &&
    target.conversationId === foreground.conversationId
  ) {
    return true
  }
  return target.contextKey === foreground.contextKey
}

export function isShelfViewLive(doc?: Document): boolean {
  const root = doc ?? (typeof document === "undefined" ? null : document)
  if (!root) return false
  return isLiveElement(root.querySelector('[data-testid="shelf-view"]'))
}

export function isConversationWorkspaceLive(doc?: Document): boolean {
  const root = doc ?? (typeof document === "undefined" ? null : document)
  if (!root) return false
  return isLiveElement(root.querySelector('[data-testid="conversation-workspace"]'))
}

/** Shelf half of "what is on screen". Tab fallback is combined by notifySession. */
export function readForegroundSession(doc?: Document): ForegroundSession {
  const root = doc ?? (typeof document === "undefined" ? null : document)
  if (!root) return { conversationId: null, contextKey: null }
  const shelf = root.querySelector('[data-testid="shelf-view"]')
  if (!shelf || !isLiveElement(shelf)) {
    return { conversationId: null, contextKey: null }
  }
  const expanded = shelf.querySelector("[data-shelf-expanded][data-shelf-card]")
  if (!expanded || !isLiveElement(expanded)) {
    return { conversationId: null, contextKey: null }
  }
  const raw = expanded.getAttribute("data-shelf-card")
  const id = raw != null ? Number(raw) : NaN
  if (!Number.isFinite(id)) return { conversationId: null, contextKey: null }
  return { conversationId: id, contextKey: `shelf:${id}` }
}
