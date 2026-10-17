import type { PromptDraft } from "@/lib/types"

/**
 * `/side` hand-off. The source panel must not prompt itself. It parks the
 * hidden seed and the visible question for the NEW tab, which may still be
 * mounting. Same reason as `ask-selection-handoff`: a CustomEvent alone fires
 * before the new panel listens, so the buffer is the mount path and the event
 * is the already-mounted path. Keyed by tab id so the source panel cannot
 * take it.
 */

export const SIDE_OPEN_PARKED_EVENT = "codeg:side-open-parked"

export interface SideOpenParkedDetail {
  tabId: string
}

export interface SideOpenPacket {
  seed: string
  question: string
}

const parked = new Map<string, SideOpenPacket>()

export function parkSideOpen(tabId: string, packet: SideOpenPacket): void {
  parked.set(tabId, packet)
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<SideOpenParkedDetail>(SIDE_OPEN_PARKED_EVENT, {
      detail: { tabId },
    })
  )
}

/** Take the packet once. A second call (and any other tab id) gets null. */
export function consumeSideOpen(tabId: string): SideOpenPacket | null {
  const packet = parked.get(tabId) ?? null
  if (packet) parked.delete(tabId)
  return packet
}

/** Drop a packet whose tab is closing before the panel drains it. */
export function discardSideOpen(tabId: string): void {
  parked.delete(tabId)
}

export function resetSideOpenForTests(): void {
  parked.clear()
}

/** Seed first, then the question when it is non-empty. */
export function sideOpenDrafts(packet: SideOpenPacket): PromptDraft[] {
  const drafts: PromptDraft[] = [
    {
      blocks: [{ type: "text", text: packet.seed }],
      displayText: packet.seed,
    },
  ]
  const question = packet.question.trim()
  if (!question) return drafts
  drafts.push({
    blocks: [{ type: "text", text: question }],
    displayText: question,
  })
  return drafts
}
