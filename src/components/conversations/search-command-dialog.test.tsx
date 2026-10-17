import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SearchCommandDialog } from "./search-command-dialog"
import enMessages from "@/i18n/messages/en.json"

// The active folder and its conversations, per test: the agent filter chips
// only render once the folder holds more than one agent type.
const workspace = vi.hoisted(() => ({
  activeFolderId: null as number | null,
  conversations: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/components/agent-icon", () => ({ AgentIcon: () => null }))

const spies = vi.hoisted(() => ({
  openTab: vi.fn(),
  listAllConversations: vi.fn(async () => [] as unknown[]),
  searchCorpus: vi.fn(async () => {
    throw new Error("search_corpus 404")
  }),
}))

vi.mock("@/lib/api", () => ({
  listAllConversations: spies.listAllConversations,
  searchCorpus: spies.searchCorpus,
}))

vi.mock("@/contexts/tab-context", () => ({
  useTabActions: () => ({ openTab: spies.openTab }),
}))

vi.mock("@/contexts/workbench-route-context", () => ({
  useWorkbenchRoute: () => ({ openConversations: vi.fn() }),
}))

vi.mock("@/contexts/workspace-context", () => ({
  useWorkspaceActions: () => ({ openFilePreview: vi.fn() }),
}))

vi.mock("@/contexts/aux-panel-context", () => ({
  useAuxPanelContext: () => ({ revealInFileTree: vi.fn() }),
}))

vi.mock("@/contexts/active-folder-context", () => ({
  useActiveFolder: () => ({
    activeFolder: null,
    activeFolderId: workspace.activeFolderId,
  }),
}))

vi.mock("@/stores/app-workspace-store", () => ({
  useAppWorkspaceStore: (selector: (s: unknown) => unknown) =>
    selector({ conversations: workspace.conversations }),
}))

vi.mock("@/hooks/use-file-tree", () => ({
  useFileTree: () => ({ allFiles: [], loading: false, reset: vi.fn() }),
}))

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SearchCommandDialog open onOpenChange={() => {}} />
    </NextIntlClientProvider>
  )
}

describe("SearchCommandDialog focus", () => {
  beforeEach(() => {
    workspace.activeFolderId = null
    workspace.conversations = []
    spies.openTab.mockClear()
    spies.listAllConversations.mockReset()
    spies.listAllConversations.mockResolvedValue([])
    spies.searchCorpus.mockReset()
    spies.searchCorpus.mockRejectedValue(new Error("search_corpus 404"))
  })

  it("opens with the cursor in the search box, so typing searches", async () => {
    const user = userEvent.setup()
    renderDialog()

    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    expect(input).toHaveFocus()

    await user.keyboard("auth")
    expect(input).toHaveValue("auth")
  })

  it("does not render Conversations/Files tabs", async () => {
    renderDialog()
    expect(
      screen.queryByRole("button", { name: enMessages.Folder.search.tabFiles })
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: enMessages.Folder.search.tabConversations,
      })
    ).toBeNull()
  })

  it("keeps the cursor in the search box when picking an agent filter", async () => {
    workspace.activeFolderId = 1
    workspace.conversations = [
      { folder_id: 1, agent_type: "claude_code" },
      { folder_id: 1, agent_type: "codex" },
    ]
    const user = userEvent.setup()
    renderDialog()

    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.click(screen.getByRole("button", { name: "Codex" }))
    expect(input).toHaveFocus()

    await user.click(
      screen.getByRole("button", { name: enMessages.Folder.search.allAgents })
    )
    expect(input).toHaveFocus()
  })

  it("pulls the cursor back when the chat composer behind it takes focus", async () => {
    // The composer refocuses itself when an agent turn ends, whether or not
    // the dialog is open over it. The dialog's focus trap must bring the
    // cursor back, or the rest of the query is typed into the composer.
    const composer = document.createElement("textarea")
    document.body.appendChild(composer)
    try {
      const user = userEvent.setup()
      renderDialog()

      const input = await screen.findByPlaceholderText(
        enMessages.Folder.search.placeholder
      )
      act(() => composer.focus())
      expect(input).toHaveFocus()

      await user.keyboard("auth")
      expect(input).toHaveValue("auth")
      expect(composer).toHaveValue("")
    } finally {
      composer.remove()
    }
  })
})


describe("SearchCommandDialog shelf landing", () => {
  beforeEach(() => {
    spies.openTab.mockClear()
    spies.listAllConversations.mockReset()
    spies.searchCorpus.mockReset()
    spies.searchCorpus.mockRejectedValue(new Error("search_corpus 404"))
    document.querySelector("[data-testid=shelf-view]")?.remove()
  })

  it("scrolls to an on-shelf card instead of openTab", async () => {
    const user = userEvent.setup()
    spies.listAllConversations.mockResolvedValue([
      {
        id: 7,
        folder_id: 1,
        title: "Fix the flaky test",
        agent_type: "claude_code",
        status: "in_progress",
        kind: "regular",
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
        started_at: "2026-10-02T00:00:00Z",
        message_count: 1,
      },
    ])
    workspace.activeFolderId = 1
    workspace.conversations = [{ folder_id: 1, agent_type: "claude_code" }]
    const card = document.createElement("div")
    card.setAttribute("data-testid", "shelf-view")
    const inner = document.createElement("div")
    inner.setAttribute("data-shelf-card", "7")
    inner.scrollIntoView = vi.fn()
    card.appendChild(inner)
    document.body.appendChild(card)

    renderDialog()
    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.type(input, "flaky")
    const item = await screen.findByText("Fix the flaky test")
    await user.click(item)
    expect(spies.openTab).not.toHaveBeenCalled()
    expect(inner.scrollIntoView).toHaveBeenCalled()
  })

  it("opens a tab when the shelf card is inside conversation-tab-hidden", async () => {
    const user = userEvent.setup()
    spies.listAllConversations.mockResolvedValue([
      {
        id: 7,
        folder_id: 1,
        title: "Fix the flaky test",
        agent_type: "claude_code",
        status: "in_progress",
        kind: "regular",
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
        started_at: "2026-10-02T00:00:00Z",
        message_count: 1,
      },
    ])
    workspace.activeFolderId = 1
    workspace.conversations = [{ folder_id: 1, agent_type: "claude_code" }]
    const hidden = document.createElement("div")
    hidden.className = "conversation-tab-hidden"
    const card = document.createElement("div")
    card.setAttribute("data-testid", "shelf-view")
    const inner = document.createElement("div")
    inner.setAttribute("data-shelf-card", "7")
    inner.scrollIntoView = vi.fn()
    card.appendChild(inner)
    hidden.appendChild(card)
    document.body.appendChild(hidden)

    renderDialog()
    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.type(input, "flaky")
    const item = await screen.findByText("Fix the flaky test")
    await user.click(item)
    expect(spies.openTab).toHaveBeenCalled()
    expect(inner.scrollIntoView).not.toHaveBeenCalled()
    hidden.remove()
  })
})

describe("SearchCommandDialog groups", () => {
  beforeEach(() => {
    workspace.activeFolderId = 1
    workspace.conversations = [
      {
        id: 3,
        folder_id: 1,
        title: "Recent auth bug",
        agent_type: "claude_code",
        status: "in_progress",
        kind: "regular",
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-16T00:00:00Z",
        started_at: "2026-10-02T00:00:00Z",
        message_count: 1,
      },
    ]
    spies.openTab.mockClear()
    spies.listAllConversations.mockReset()
    spies.listAllConversations.mockResolvedValue([])
    spies.searchCorpus.mockReset()
    spies.searchCorpus.mockRejectedValue(new Error("search_corpus 404"))
  })

  it("shows recent conversations on empty query", async () => {
    renderDialog()
    expect(await screen.findByText("Recent auth bug")).toBeTruthy()
    expect(spies.listAllConversations).not.toHaveBeenCalled()
  })

  it("passes folder_ids null for in:all", async () => {
    const user = userEvent.setup()
    renderDialog()
    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.type(input, "in:all flaky")
    await waitFor(() => {
      expect(spies.listAllConversations).toHaveBeenCalled()
    })
    const arg = spies.listAllConversations.mock.calls.at(-1)?.[0]
    expect(arg?.folder_ids).toBeNull()
    expect(arg?.search).toBe("flaky")
  })
})

const summary = {
  id: 7,
  folder_id: 1,
  title: "Title match",
  agent_type: "claude_code",
  status: "in_progress",
  kind: "regular",
  created_at: "2026-10-02T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  started_at: "2026-10-02T00:00:00Z",
  message_count: 1,
}

describe("SearchCommandDialog corpus", () => {
  beforeEach(() => {
    workspace.activeFolderId = 1
    workspace.conversations = [{ folder_id: 1, agent_type: "claude_code" }]
    spies.openTab.mockClear()
    spies.listAllConversations.mockReset()
    spies.listAllConversations.mockResolvedValue([])
    spies.searchCorpus.mockReset()
    spies.searchCorpus.mockRejectedValue(new Error("search_corpus 404"))
  })

  it("falls back to listAllConversations when searchCorpus throws", async () => {
    const user = userEvent.setup()
    spies.searchCorpus.mockRejectedValue(
      Object.assign(new Error("missing"), { status: 404 })
    )
    spies.listAllConversations.mockResolvedValue([summary])
    renderDialog()
    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.type(input, "flaky")
    expect(await screen.findByText("Title match")).toBeTruthy()
    expect(spies.searchCorpus).toHaveBeenCalled()
    expect(spies.listAllConversations).toHaveBeenCalled()
  })

  it("shows a body snippet from searchCorpus and skips title LIKE", async () => {
    const user = userEvent.setup()
    spies.searchCorpus.mockResolvedValue({
      hits: [
        {
          conversation_id: 9,
          folder_id: 1,
          agent_type: "claude_code",
          title: "Net dial",
          snippet: "dial failed: ECONNRESET",
          message_ref: "m1",
          source: "body",
        },
      ],
    })
    renderDialog()
    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.type(input, "ECONNRESET")
    expect(await screen.findByText("dial failed: ECONNRESET")).toBeTruthy()
    expect(screen.getByText("Net dial")).toBeTruthy()
    expect(spies.listAllConversations).not.toHaveBeenCalled()
  })

  it("drops a stale searchCorpus hit after the query is cleared", async () => {
    const user = userEvent.setup()
    let resolveHits: (value: {
      hits: Array<Record<string, unknown>>
    }) => void = () => {}
    const deferred = new Promise<{ hits: Array<Record<string, unknown>> }>(
      (resolve) => {
        resolveHits = resolve
      }
    )
    let firstCall = true
    spies.searchCorpus.mockImplementation(() => {
      if (firstCall) {
        firstCall = false
        return deferred
      }
      return new Promise(() => {})
    })
    workspace.conversations = [
      {
        id: 3,
        folder_id: 1,
        title: "Recent keep",
        agent_type: "claude_code",
        status: "in_progress",
        kind: "regular",
        created_at: "2026-10-02T00:00:00Z",
        updated_at: "2026-10-16T00:00:00Z",
        started_at: "2026-10-02T00:00:00Z",
        message_count: 1,
      },
    ]
    renderDialog()
    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.type(input, "ECONNRESET")
    await waitFor(() => {
      expect(spies.searchCorpus).toHaveBeenCalled()
    })
    await user.clear(input)
    expect(await screen.findByText("Recent keep")).toBeTruthy()
    expect(
      screen.getByText(enMessages.Folder.search.recentConversations)
    ).toBeTruthy()
    await act(async () => {
      resolveHits({
        hits: [
          {
            conversation_id: 99,
            folder_id: 1,
            agent_type: "claude_code",
            title: "STALEHITTOKEN",
            snippet: "dial failed: ECONNRESET",
            message_ref: "m1",
            source: "body",
          },
        ],
      })
    })
    expect(screen.queryByText("STALEHITTOKEN")).toBeNull()
    expect(screen.getByText("Recent keep")).toBeTruthy()
    await user.type(input, "q")
    expect(screen.queryByText("STALEHITTOKEN")).toBeNull()
  })

  it("merges workspace status and time onto a corpus hit", async () => {
    const user = userEvent.setup()
    workspace.conversations = [
      {
        id: 9,
        folder_id: 1,
        title: "Store title",
        title_locked: false,
        agent_type: "claude_code",
        status: "completed",
        kind: "regular",
        model: null,
        git_branch: null,
        external_id: "ext-9",
        message_count: 3,
        child_count: 0,
        created_at: "2026-10-01T00:00:00.000Z",
        updated_at: "2026-10-01T00:00:00.000Z",
        pinned_at: null,
      },
    ]
    spies.searchCorpus.mockResolvedValue({
      hits: [
        {
          conversation_id: 9,
          folder_id: 1,
          agent_type: "claude_code",
          title: "Net dial",
          snippet: "dial failed: ECONNRESET",
          message_ref: "m1",
          source: "body",
        },
      ],
    })
    renderDialog()
    const input = await screen.findByPlaceholderText(
      enMessages.Folder.search.placeholder
    )
    await user.type(input, "ECONNRESET")
    expect(await screen.findByText("dial failed: ECONNRESET")).toBeTruthy()
    const item = screen
      .getByText("dial failed: ECONNRESET")
      .closest('[data-slot="command-item"]')
    expect(item).toBeTruthy()
    const text = item?.textContent ?? ""
    expect(text).not.toMatch(/1970/)
    expect(text).not.toMatch(/55 years/)
    expect(text).not.toMatch(/56 years/)
    expect(text).not.toMatch(/57 years/)
    expect(text).toMatch(/days ago/)
    expect(item?.querySelector(".bg-green-500")).toBeTruthy()
    expect(item?.querySelector(".bg-yellow-400")).toBeNull()
    expect(spies.listAllConversations).not.toHaveBeenCalled()
  })
})
