import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { HandoffAgentDock } from "./handoff-agent-dock"
import { getAgentLabel } from "@/lib/custom-agents"
import type { DbConversationSummary } from "@/lib/types"

const { openTab, handoffConversation } = vi.hoisted(() => ({
  openTab: vi.fn(),
  handoffConversation: vi.fn(),
}))

vi.mock("@/hooks/use-acp-agents", () => ({
  useAcpAgents: () => ({
    agents: [
      {
        agent_type: "cursor",
        enabled: true,
        available: true,
      },
      {
        agent_type: "grok",
        enabled: true,
        available: true,
      },
      {
        agent_type: "claude_code",
        enabled: true,
        available: true,
      },
    ],
  }),
}))

vi.mock("@/contexts/tab-context", () => ({
  useTabStore: (
    sel: (s: { openTab: typeof openTab; rawTabs: [] }) => unknown
  ) => sel({ openTab, rawTabs: [] }),
}))

vi.mock("@/lib/api", () => ({
  handoffConversation,
}))

const summary = {
  id: 1,
  folder_id: 9,
  title: "src",
  title_locked: false,
  agent_type: "cursor",
  status: "in_progress",
  kind: "regular",
  model: null,
  git_branch: null,
  external_id: null,
  message_count: 1,
  child_count: 0,
  created_at: "t",
  updated_at: "t",
  pinned_at: null,
} as DbConversationSummary

const messages = {
  Folder: {
    handoff: {
      dockLabel: "Relay",
      goalTitle: "Relay with {agent}",
      goalPlaceholder: "goal",
      emptyGoal: "先写下一刀目标。",
      confirm: "Go",
      cancel: "Cancel",
      handoffTo: "Continue with {agent}",
      currentSession: "This session",
    },
  },
}

function renderDock() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HandoffAgentDock
        source={{
          id: 1,
          folderId: 9,
          agentType: "cursor",
          title: "src",
          summary,
        }}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  openTab.mockReset()
  handoffConversation.mockReset()
  handoffConversation.mockResolvedValue({
    conversationId: 42,
    clusterId: 3,
    sourceId: 1,
  })
})

describe("HandoffAgentDock", () => {
  it("does not render per-agent buttons until the menu opens", () => {
    renderDock()
    expect(document.querySelector("[data-handoff-dock]")).toBeTruthy()
    expect(document.querySelector("[data-handoff-trigger]")).toBeTruthy()
    expect(document.querySelector("[data-handoff-agent]")).toBeNull()
  })

  it("is one current-agent trigger, not a row of avatars", () => {
    const { container } = renderDock()
    const triggers = container.querySelectorAll("[data-handoff-trigger]")
    expect(triggers).toHaveLength(1)
    expect(triggers[0]).toHaveTextContent(getAgentLabel("cursor"))
    expect(triggers[0]).toHaveAttribute("aria-haspopup", "menu")
    expect(container.querySelectorAll("button")).toHaveLength(1)
    expect(container.querySelector("[data-handoff-agent]")).toBeNull()
    expect(container.querySelector('[class*="h-7 w-7"]')).toBeNull()
  })

  it("lists other agents as handoff actions", async () => {
    const user = userEvent.setup()
    renderDock()
    await user.click(document.querySelector("[data-handoff-trigger]")!)
    await waitFor(() => {
      expect(document.querySelector('[data-handoff-agent="grok"]')).toBeTruthy()
    })
    expect(document.querySelector('[data-handoff-agent="cursor"]')).toBeNull()
    expect(
      document.querySelector('[data-handoff-agent="claude_code"]')
    ).toBeTruthy()
    expect(document.querySelectorAll("[data-handoff-trigger]")).toHaveLength(1)
  })

  it("does not create a conversation when the current agent is chosen", async () => {
    handoffConversation.mockReset()
    openTab.mockReset()
    const user = userEvent.setup({
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    })
    renderDock()
    await user.click(document.querySelector("[data-handoff-trigger]")!)
    const current = await screen.findByRole("menuitem", {
      name: /This session/,
    })
    expect(current).toHaveAttribute("aria-disabled", "true")
    expect(current).not.toHaveAttribute("data-handoff-agent")
    await user.click(current)
    expect(handoffConversation).not.toHaveBeenCalled()
    expect(openTab).not.toHaveBeenCalled()
    expect(document.querySelector("[data-handoff-goal]")).toBeNull()
  })

  it("hands off immediately on the shelf without a goal dialog", async () => {
    const user = userEvent.setup()
    const opened: unknown[] = []
    const packets: { tabId: string; text: string }[] = []
    const onOpen = (event: Event) => {
      opened.push((event as CustomEvent).detail)
    }
    const onAppend = (event: Event) => {
      packets.push(
        (event as CustomEvent<{ tabId: string; text: string }>).detail
      )
    }
    window.addEventListener("codeg:shelf-open-conversation", onOpen)
    window.addEventListener("codeg:append-text-to-session", onAppend)
    renderDock()
    await user.click(document.querySelector("[data-handoff-trigger]")!)
    await user.click(document.querySelector('[data-handoff-agent="grok"]')!)
    await waitFor(() => expect(handoffConversation).toHaveBeenCalledTimes(1))
    expect(handoffConversation).toHaveBeenCalledWith({
      sourceId: 1,
      agentType: "grok",
    })
    expect(document.querySelector("[data-handoff-goal]")).toBeNull()
    expect(openTab).not.toHaveBeenCalled()
    expect(opened).toEqual([{ conversationId: 42, folderId: 9, afterId: 1 }])
    await waitFor(() => expect(packets).toHaveLength(1))
    expect(packets[0]?.tabId).toBe("shelf:42")
    expect(packets[0]?.text).toContain("目标：（未抽出，请改）")
    window.removeEventListener("codeg:shelf-open-conversation", onOpen)
    window.removeEventListener("codeg:append-text-to-session", onAppend)
  })

  it("opens a tab when the canvas is not the shelf", async () => {
    localStorage.setItem("workspace:canvas-layout", JSON.stringify("board"))
    const user = userEvent.setup()
    const opened: unknown[] = []
    const packets: { tabId: string }[] = []
    const onOpen = (event: Event) => {
      opened.push((event as CustomEvent).detail)
    }
    const onAppend = (event: Event) => {
      packets.push((event as CustomEvent<{ tabId: string }>).detail)
    }
    window.addEventListener("codeg:shelf-open-conversation", onOpen)
    window.addEventListener("codeg:append-text-to-session", onAppend)
    renderDock()
    await user.click(document.querySelector("[data-handoff-trigger]")!)
    await user.click(document.querySelector('[data-handoff-agent="grok"]')!)
    await waitFor(() => expect(openTab).toHaveBeenCalledTimes(1))
    expect(openTab).toHaveBeenCalledWith(9, 42, "grok", false, "src")
    expect(opened).toEqual([])
    expect(document.querySelector("[data-handoff-goal]")).toBeNull()
    await waitFor(() => expect(packets).toHaveLength(1))
    expect(packets[0]?.tabId).toBe("conv-9-grok-42")
    window.removeEventListener("codeg:shelf-open-conversation", onOpen)
    window.removeEventListener("codeg:append-text-to-session", onAppend)
  })
})
