import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "@/i18n/messages/en.json"
import { ShelfView } from "./shelf-view"

/**
 * `CanvasConversationSurface` pulls in the chat stack. The shelf only has to
 * hand it a stable per-card key and keep every expanded card mounted.
 */
const h = vi.hoisted(() => {
  function folder(id: number, name: string) {
    return {
      id,
      name,
      path: `/tmp/${name}`,
      git_branch: null,
      default_agent_type: null,
      last_opened_at: "2026-08-30T00:00:00Z",
      sort_order: id,
      color: "inherit",
      parent_id: null,
      kind: "regular" as const,
      alias: null,
      group_id: null,
    }
  }

  function conv(
    id: number,
    folderId: number,
    title: string,
    status: string,
    updatedAt: string
  ) {
    return {
      id,
      folder_id: folderId,
      title,
      title_locked: false,
      agent_type: "claude_code",
      status,
      kind: "regular" as const,
      model: null,
      git_branch: null,
      external_id: null,
      message_count: 1,
      child_count: 0,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: updatedAt,
      pinned_at: null,
    }
  }

  return {
    surfaceRendered: vi.fn(),
    registerLiveSurfaceKeys: vi.fn(),
    createConversation: vi.fn().mockResolvedValue(42),
    moveConversation: vi.fn().mockResolvedValue(undefined),
    folders: [folder(10, "Alpha"), folder(20, "Beta")],
    conversations: [
      conv(7, 10, "Fix the flaky test", "in_progress", "2026-10-02T00:00:00Z"),
      conv(8, 10, "Review the patch", "pending_review", "2026-10-01T00:00:00Z"),
      conv(9, 10, "Ship the shelf", "completed", "2026-09-01T00:00:00Z"),
    ],
  }
})

vi.mock("../canvas-conversation-surface", () => ({
  CanvasConversationSurface: (props: Record<string, unknown>) => {
    h.surfaceRendered(props)
    return <div data-testid="conversation-surface" />
  },
}))

vi.mock("@/lib/api", () => ({
  createConversation: h.createConversation,
  moveConversation: h.moveConversation,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}))

vi.mock("@/contexts/acp-connections-context", () => ({
  useAcpActions: () => ({
    registerLiveSurfaceKeys: h.registerLiveSurfaceKeys,
  }),
}))

vi.mock("@/stores/app-workspace-store", () => ({
  useAppWorkspaceStore: (
    selector: (s: {
      folders: typeof h.folders
      conversations: typeof h.conversations
    }) => unknown
  ) => selector({ folders: h.folders, conversations: h.conversations }),
}))

function renderShelf() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShelfView />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  h.surfaceRendered.mockClear()
  h.registerLiveSurfaceKeys.mockClear()
  h.createConversation.mockClear()
  h.moveConversation.mockClear()
})

afterEach(() => {
  localStorage.clear()
})

describe("ShelfView", () => {
  it("shows working projects only, running and waiting counts, and no ReactFlow", () => {
    renderShelf()

    expect(screen.getByText("Alpha")).toBeTruthy()
    expect(screen.queryByText("Beta")).toBeNull()
    expect(screen.getByText("1 in progress")).toBeTruthy()
    expect(screen.getByText("1 pending review")).toBeTruthy()
    expect(screen.getByText("Fix the flaky test")).toBeTruthy()
    expect(screen.getByText("Review the patch")).toBeTruthy()
    expect(screen.queryByText("Ship the shelf")).toBeNull()
    expect(document.querySelector(".react-flow")).toBeNull()
    expect(screen.getByTestId("shelf-view")).toBeTruthy()
    expect(screen.getByTestId("shelf-row").className).toMatch(/shrink-0/)
  })

  it("lists off-shelf conversations in the outline, not on the canvas", () => {
    renderShelf()
    expect(screen.queryByText("Ship the shelf")).toBeNull()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    expect(screen.getByRole("checkbox", { name: "Ship the shelf" })).toBeTruthy()
  })

  it("removes a conversation from the shelf working set", () => {
    renderShelf()
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Remove this conversation from the shelf",
      })[0]
    )
    expect(screen.queryByText("Fix the flaky test")).toBeNull()
    expect(screen.getByText("Review the patch")).toBeTruthy()
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-visible-conversations") ?? "null"
      )
    ).toEqual([8])
  })

  it("adds a conversation to the shelf from the outline", () => {
    renderShelf()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.click(screen.getByRole("checkbox", { name: "Ship the shelf" }))
    expect(screen.getByTestId("shelf-outline-title-conversation-9")).toBeTruthy()
    expect(
      screen.getAllByText("Ship the shelf").length
    ).toBeGreaterThanOrEqual(1)
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-visible-conversations") ?? "null"
      )
    ).toEqual([7, 8, 9])
  })

  it("opens a draft in the project row so the agent can be chosen", async () => {
    renderShelf()
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }))
    expect(h.createConversation).not.toHaveBeenCalled()
    expect(screen.getByTestId("shelf-draft-card")).toBeTruthy()
    expect(screen.getByTestId("shelf-row").className).toMatch(/min-h-\[560px\]/)
    expect(h.surfaceRendered.mock.lastCall![0]).toMatchObject({
      conversationId: null,
      agentType: "claude_code",
      contextKey: "shelf-draft:10",
      isActive: true,
      showWelcome: true,
    })
    expect(h.surfaceRendered.mock.lastCall![0].draftTarget).toEqual({
      kind: "folder",
      folderId: 10,
      workingDir: "/tmp/Alpha",
    })
    expect(h.surfaceRendered.mock.lastCall![0].onAgentTypeChange).toEqual(
      expect.any(Function)
    )

    await waitFor(() => {
      const keys = h.registerLiveSurfaceKeys.mock.calls.map(
        (call) => call[1] as Set<string>
      )
      expect(keys.some((set) => set.has("shelf-draft:10"))).toBe(true)
    })

    act(() => {
      ;(
        h.surfaceRendered.mock.lastCall![0].onAgentTypeChange as (
          agent: string
        ) => void
      )("codex")
    })
    expect(h.surfaceRendered.mock.lastCall![0].agentType).toBe("codex")

    act(() => {
      ;(
        h.surfaceRendered.mock.lastCall![0].onConversationCreated as (
          id: number,
          folderId: number
        ) => void
      )(42, 10)
    })
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-visible-conversations") ?? "[]"
      )
    ).toEqual(expect.arrayContaining([7, 8, 42]))
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-expanded-conversations") ?? "[]"
      )
    ).toEqual(expect.arrayContaining([42]))
  })

  it("adds a hidden project from the outline", () => {
    renderShelf()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }))
    expect(
      screen.getByRole("button", { name: "Beta", expanded: true })
    ).toBeTruthy()
    expect(screen.getByText("This project has no conversations")).toBeTruthy()
  })

  it("hides a project from the working set and persists it", () => {
    renderShelf()
    fireEvent.click(
      screen.getByRole("button", { name: "Remove this project from the shelf" })
    )
    expect(screen.queryByText("Alpha")).toBeNull()
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-visible-folders") ?? "null"
      )
    ).toEqual([])
  })

  it("grows the row when a card expands", () => {
    renderShelf()
    const row = screen.getByTestId("shelf-row")
    expect(row.className).toMatch(/min-h-\[148px\]/)
    fireEvent.click(screen.getByText("Fix the flaky test"))
    expect(row.className).toMatch(/min-h-\[560px\]/)
    expect(row.className).not.toMatch(/overflow-y-hidden/)
  })

  it("expands two cards and hands each surface its shelf key", () => {
    renderShelf()

    fireEvent.click(screen.getByText("Fix the flaky test"))
    expect(h.surfaceRendered.mock.lastCall![0]).toMatchObject({
      contextKey: "shelf:7",
      conversationId: 7,
      agentType: "claude_code",
      isActive: true,
    })
    expect(
      h.surfaceRendered.mock.lastCall![0].folderPickerOverride
    ).toMatchObject({
      folderId: 10,
      editable: false,
    })
    expect(
      h.surfaceRendered.mock.lastCall![0].onSaveSelectionAsNote
    ).toBeUndefined()

    fireEvent.click(screen.getByText("Review the patch"))
    expect(screen.getAllByTestId("conversation-surface")).toHaveLength(2)
    const keys = h.surfaceRendered.mock.calls.map(
      (call) => (call[0] as { contextKey: string }).contextKey
    )
    expect(keys).toEqual(expect.arrayContaining(["shelf:7", "shelf:8"]))
  })

  it("closes one expanded card and leaves the other mounted", () => {
    renderShelf()
    fireEvent.click(screen.getByText("Fix the flaky test"))
    fireEvent.click(screen.getByText("Review the patch"))

    const closeButtons = screen.getAllByRole("button", { name: "Close" })
    fireEvent.click(closeButtons[0])

    expect(screen.getAllByTestId("conversation-surface")).toHaveLength(1)
  })

  it("hides a project's cards when its title is collapsed", () => {
    renderShelf()
    expect(
      screen.getByRole("button", { name: /Fix the flaky test/ })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }))

    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(
      screen.queryByRole("button", { name: /Fix the flaky test/ })
    ).toBeNull()
  })

  it("hydrates expanded cards and persists a new one", () => {
    localStorage.setItem(
      "workspace:shelf-expanded-conversations",
      JSON.stringify([8])
    )
    renderShelf()

    expect(screen.getByTestId("conversation-surface")).toBeTruthy()
    expect(h.surfaceRendered.mock.lastCall![0]).toMatchObject({
      contextKey: "shelf:8",
      conversationId: 8,
      isActive: false,
    })

    fireEvent.click(screen.getByText("Fix the flaky test"))
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-expanded-conversations") ?? "[]"
      )
    ).toEqual([8, 7])
  })

  it("hydrates a collapsed project and persists the toggle", () => {
    localStorage.setItem(
      "workspace:shelf-collapsed-folders",
      JSON.stringify([10])
    )
    renderShelf()
    const alpha = screen.getByRole("button", { name: "Alpha" })
    expect(alpha).toHaveAttribute("aria-expanded", "false")
    const film = screen.getByTestId("shelf-row").querySelector("[hidden]")
    expect(film?.textContent).toContain("Fix the flaky test")

    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }))
    fireEvent.click(screen.getByRole("button", { name: "Beta", expanded: true }))
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-collapsed-folders") ?? "[]"
      )
    ).toEqual([10, 20])
  })

  it("registers expanded shown cards under source shelf", async () => {
    renderShelf()
    fireEvent.click(screen.getByText("Fix the flaky test"))
    await waitFor(() => {
      expect(h.registerLiveSurfaceKeys).toHaveBeenCalled()
    })
    const last = h.registerLiveSurfaceKeys.mock.calls.at(-1)
    expect(last?.[0]).toBe("shelf")
    expect([...(last?.[1] ?? [])].sort()).toEqual(["shelf:7"])
  })

  it("only the last opened card is the active composer", () => {
    renderShelf()
    fireEvent.click(screen.getByText("Fix the flaky test"))
    fireEvent.click(screen.getByText("Review the patch"))
    const latestById = new Map<number, boolean>()
    for (const [props] of h.surfaceRendered.mock.calls) {
      latestById.set(props.conversationId as number, props.isActive as boolean)
    }
    expect(latestById.get(7)).toBe(false)
    expect(latestById.get(8)).toBe(true)
  })
})
