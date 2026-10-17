"use client"

import { useEffect } from "react"

import { useTabActions, useTabStore } from "@/contexts/tab-context"
import {
  setSessionNotifyLander,
  setSessionNotifyOpenTab,
  setSessionNotifyTabForeground,
} from "@/lib/in-app-session-notify"
import { landSessionNotify } from "@/lib/session-notify-land"

/** Wires toast Open / live-tab mute into workspace without importing the tab store from notify. */
export function SessionNotifyLandBridge() {
  const { openTab } = useTabActions()
  const liveTabId = useTabStore((s) => s.activeTabId)
  const liveTabConversationId = useTabStore((s) => {
    const id = s.activeTabId
    if (!id) return null
    return s.tabs.find((t) => t.id === id)?.conversationId ?? null
  })

  useEffect(() => {
    setSessionNotifyOpenTab((folderId, conversationId, agentType, pin) => {
      openTab(folderId, conversationId, agentType, pin)
    })
    setSessionNotifyLander((item) => {
      landSessionNotify(item)
    })
    return () => {
      setSessionNotifyOpenTab(null)
      setSessionNotifyLander(null)
    }
  }, [openTab])

  useEffect(() => {
    setSessionNotifyTabForeground({
      liveTabId,
      liveTabConversationId,
    })
  }, [liveTabId, liveTabConversationId])

  return null
}
