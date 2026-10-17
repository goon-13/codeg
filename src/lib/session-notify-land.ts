/**
 * Jump from a session toast to the conversation it names.
 *
 * A live shelf card is the conversation on the board; a keep-alive copy
 * hiding in `.conversation-tab-hidden` is not, and opening a tab would
 * yank the user off the shelf they are looking at.
 */

import { isLiveElement } from "@/lib/session-foreground"
import { getSessionNotifyOpenTab } from "@/lib/in-app-session-notify"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"

export function liveShelfCard(
  conversationId: number,
  doc?: Document
): Element | null {
  const root = doc ?? (typeof document === "undefined" ? null : document)
  if (!root) return null
  const nodes = root.querySelectorAll(`[data-shelf-card="${conversationId}"]`)
  let fallback: Element | null = null
  for (const node of nodes) {
    if (!isLiveElement(node)) continue
    if (node.hasAttribute("data-shelf-expanded")) return node
    fallback ??= node
  }
  return fallback
}

export function landSessionNotify(
  item: {
    conversationId: number | null
    folderId: number | null
    agentType: string | null
  },
  deps?: {
    document?: Document
    openTab?: (
      folderId: number,
      conversationId: number,
      agentType: string,
      pin?: boolean
    ) => void
    conversations?: Array<{
      id: number
      folder_id: number
      agent_type: string
    }>
  }
): "shelf" | "tab" | "none" {
  const conversationId = item.conversationId
  if (conversationId == null) return "none"
  const root =
    deps?.document ?? (typeof document === "undefined" ? null : document)
  const card = root ? liveShelfCard(conversationId, root) : null
  if (card) {
    const expanded = card.hasAttribute("data-shelf-expanded")
    if (!expanded) {
      const title =
        card.matches('[data-testid="shelf-card-title"]')
          ? card
          : card.querySelector('[data-testid="shelf-card-title"]')
      if (title instanceof HTMLElement) title.click()
      else if (card instanceof HTMLElement) card.click()
    }
    if (card instanceof HTMLElement && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
    return "shelf"
  }
  let folderId = item.folderId
  let agentType = item.agentType
  const conversations =
    deps?.conversations ??
    ((): Array<{ id: number; folder_id: number; agent_type: string }> => {
      try {
        return useAppWorkspaceStore.getState().conversations
      } catch {
        return []
      }
    })()
  if (folderId == null || agentType == null) {
    const conv = conversations.find((c) => c.id === conversationId)
    folderId = folderId ?? conv?.folder_id ?? null
    agentType = agentType ?? conv?.agent_type ?? null
  }
  const openTab = deps?.openTab ?? getSessionNotifyOpenTab()
  if (folderId == null || agentType == null || !openTab) return "none"
  openTab(folderId, conversationId, agentType, true)
  return "tab"
}
