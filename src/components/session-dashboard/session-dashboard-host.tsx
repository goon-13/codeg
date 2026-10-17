"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useConnectionStore } from "@/contexts/acp-connections-context"
import { useTabStore } from "@/contexts/tab-context"
import { useConversationRuntimeStore } from "@/stores/conversation-runtime-store"
import { contextBarModel, type DashboardSeg } from "./dashboard-model"
import type { RoundMapRound } from "./round-map-model"
import { SessionDashboard } from "./session-dashboard"
import { useRunReveal } from "./run-reveal-context"

/**
 * Isolates live usage + sessionStats so token ticks re-render only the
 * dashboard, not virtua / ConversationDetailHeader. Precedence copies
 * ComposerContextUsage: live used>0 wins, else sessionStats.
 */
export function SessionDashboardHost({
  conversationId,
  segs,
  rounds,
  activeFirst,
  onJump,
  onJumpUser,
}: {
  conversationId: number
  segs: DashboardSeg[]
  rounds?: RoundMapRound[]
  activeFirst?: number
  onJump?: (first: number) => void
  onJumpUser?: (threadIndex: number) => void
}) {
  const reveal = useRunReveal()
  const sessionStats = useConversationRuntimeStore(
    (s) => s.byConversationId.get(conversationId)?.sessionStats ?? null
  )
  const tabId = useTabStore((s) => {
    const tab = s.tabs.find((x) => {
      if (x.kind !== "conversation") return false
      const id = x.runtimeConversationId ?? x.conversationId ?? null
      return id === conversationId
    })
    return tab?.id ?? null
  })
  const store = useConnectionStore()
  const subscribeConn = useCallback(
    (cb: () => void) => {
      if (!tabId) return () => {}
      return store.subscribeKey(tabId, cb)
    },
    [store, tabId]
  )
  const getConnSnapshot = useCallback(
    () => (tabId ? store.getConnection(tabId) : undefined),
    [store, tabId]
  )
  const conn = useSyncExternalStore(
    subscribeConn,
    getConnSnapshot,
    getConnSnapshot
  )
  const bar = useMemo(
    () =>
      contextBarModel({
        liveUsed: conn?.usage?.used ?? null,
        liveMax: conn?.usage?.size ?? null,
        statsUsed: sessionStats?.context_window_used_tokens ?? null,
        statsMax: sessionStats?.context_window_max_tokens ?? null,
        statsPercent: sessionStats?.context_window_usage_percent ?? null,
      }),
    [conn?.usage?.used, conn?.usage?.size, sessionStats]
  )

  return (
    <SessionDashboard
      conversationId={conversationId}
      segs={segs}
      rounds={rounds}
      activeFirst={activeFirst}
      bar={bar}
      pulsing={activeFirst != null}
      onJump={onJump}
      onJumpUser={onJumpUser}
      onRevealTool={reveal.focusTool}
    />
  )
}
