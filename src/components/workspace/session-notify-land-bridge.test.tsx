import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  openTab: vi.fn(),
  setSessionNotifyOpenTab: vi.fn(),
  setSessionNotifyLander: vi.fn(),
  setSessionNotifyTabForeground: vi.fn(),
  tabs: {
    activeTabId: "tab-7" as string | null,
    tabs: [{ id: "tab-7", conversationId: 7 }],
  },
}))

vi.mock("@/contexts/tab-context", () => ({
  useTabActions: () => ({ openTab: h.openTab }),
  useTabStore: (selector: (s: typeof h.tabs) => unknown) => selector(h.tabs),
}))

vi.mock("@/lib/in-app-session-notify", () => ({
  setSessionNotifyOpenTab: h.setSessionNotifyOpenTab,
  setSessionNotifyLander: h.setSessionNotifyLander,
  setSessionNotifyTabForeground: h.setSessionNotifyTabForeground,
}))

vi.mock("@/lib/session-notify-land", () => ({
  landSessionNotify: vi.fn(),
}))

import { SessionNotifyLandBridge } from "./session-notify-land-bridge"
import { landSessionNotify } from "@/lib/session-notify-land"

describe("SessionNotifyLandBridge", () => {
  beforeEach(() => {
    h.openTab.mockClear()
    h.setSessionNotifyOpenTab.mockClear()
    h.setSessionNotifyLander.mockClear()
    h.setSessionNotifyTabForeground.mockClear()
    h.tabs.activeTabId = "tab-7"
    h.tabs.tabs = [{ id: "tab-7", conversationId: 7 }]
  })
  afterEach(() => cleanup())

  it("registers openTab, lander, and the live tab", () => {
    render(<SessionNotifyLandBridge />)
    expect(h.setSessionNotifyOpenTab).toHaveBeenCalled()
    expect(h.setSessionNotifyLander).toHaveBeenCalled()
    expect(h.setSessionNotifyTabForeground).toHaveBeenCalledWith({
      liveTabId: "tab-7",
      liveTabConversationId: 7,
    })
    const openTab = h.setSessionNotifyOpenTab.mock.calls[0][0] as (
      folderId: number,
      conversationId: number,
      agentType: string,
      pin?: boolean
    ) => void
    openTab(10, 7, "codex", true)
    expect(h.openTab).toHaveBeenCalledWith(10, 7, "codex", true)
    const lander = h.setSessionNotifyLander.mock.calls[0][0] as (
      item: { conversationId: number }
    ) => void
    const item = { conversationId: 7 }
    lander(item)
    expect(landSessionNotify).toHaveBeenCalledWith(item)
  })

  it("clears openTab and lander on unmount", () => {
    const { unmount } = render(<SessionNotifyLandBridge />)
    unmount()
    expect(h.setSessionNotifyOpenTab).toHaveBeenLastCalledWith(null)
    expect(h.setSessionNotifyLander).toHaveBeenLastCalledWith(null)
  })
})
