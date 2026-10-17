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
  useConnectionStore: () => ({
    getConnection: () => undefined,
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
    expect(screen.getAllByText("Fix the flaky test").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Review the patch").length).toBeGreaterThan(0)
    expect(document.querySelector('[data-shelf-card="9"]')).toBeNull()
    expect(screen.getByTestId("shelf-recent-chip-9")).toBeTruthy()
    expect(document.querySelector(".react-flow")).toBeNull()
    expect(screen.getByTestId("shelf-view")).toBeTruthy()
    expect(screen.getByTestId("shelf-row").className).toMatch(/shrink-0/)
  })

  it("lists off-shelf conversations in the outline, not on the canvas", () => {
    renderShelf()
    expect(document.querySelector('[data-shelf-card="9"]')).toBeNull()
    expect(screen.getByTestId("shelf-recent-chip-9")).toBeTruthy()
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
    expect(document.querySelector('[data-shelf-card="7"]')).toBeNull()
    expect(screen.getByTestId("shelf-recent-chip-7")).toBeTruthy()
    expect(document.querySelector('[data-shelf-card="8"]')).toBeTruthy()
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
      agentType: "grok",
      isActive: true,
      showWelcome: true,
    })
    expect(h.surfaceRendered.mock.lastCall![0].contextKey).toMatch(
      /^shelf-draft:10:/
    )
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
      expect(
        keys.some((set) =>
          [...set].some((key) => key.startsWith("shelf-draft:10:"))
        )
      ).toBe(true)
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
    expect(screen.queryByTestId("shelf-draft-card")).toBeNull()
    const leaked = h.surfaceRendered.mock.calls
      .map((call) => call[0] as { conversationId?: number; contextKey?: string })
      .filter(
        (props) =>
          props.conversationId === 42 &&
          String(props.contextKey).startsWith("shelf-draft:")
      )
    expect(leaked).toEqual([])
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
    clickShelfCard(7)
    expect(row.className).toMatch(/min-h-\[560px\]/)
    expect(row.className).not.toMatch(/overflow-y-hidden/)
  })

  it("expands two cards and hands each surface its shelf key", () => {
    renderShelf()

    clickShelfCard(7)
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

    clickShelfCard(8)
    expect(screen.getAllByTestId("conversation-surface")).toHaveLength(2)
    const keys = h.surfaceRendered.mock.calls.map(
      (call) => (call[0] as { contextKey: string }).contextKey
    )
    expect(keys).toEqual(expect.arrayContaining(["shelf:7", "shelf:8"]))
  })

  it("closes one expanded card and leaves the other mounted", () => {
    renderShelf()
    clickShelfCard(7)
    clickShelfCard(8)

    const closeButtons = screen.getAllByRole("button", { name: "Close" })
    fireEvent.click(closeButtons[0])

    expect(screen.getAllByTestId("conversation-surface")).toHaveLength(1)
  })

  it("hides a project's cards when its title is collapsed", () => {
    renderShelf()
    expect(document.querySelector('[data-shelf-card="7"]')).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }))

    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(screen.getByTestId("shelf-row-cards")).toHaveAttribute("hidden")
    expect(screen.getByTestId("shelf-recent-chip-7")).toBeTruthy()
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
      composerActive: false,
    })

    clickShelfCard(7)
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
    clickShelfCard(7)
    await waitFor(() => {
      expect(h.registerLiveSurfaceKeys).toHaveBeenCalled()
    })
    const last = h.registerLiveSurfaceKeys.mock.calls.at(-1)
    expect(last?.[0]).toBe("shelf")
    expect([...(last?.[1] ?? [])].sort()).toEqual(["shelf:7"])
  })

  it("keeps the first expanded card live when a second is opened", () => {
    renderShelf()
    clickShelfCard(7)
    clickShelfCard(8)
    const latest = new Map<
      number,
      { isActive?: boolean; composerActive?: boolean }
    >()
    for (const [props] of h.surfaceRendered.mock.calls) {
      latest.set(props.conversationId as number, {
        isActive: props.isActive as boolean,
        composerActive: props.composerActive as boolean | undefined,
      })
    }
    expect(latest.get(7)).toMatchObject({
      isActive: true,
      composerActive: false,
    })
    expect(latest.get(8)).toMatchObject({
      isActive: true,
      composerActive: true,
    })
  })

  it("registers only claimed live keys, not a restored shell", async () => {
    localStorage.setItem(
      "workspace:shelf-expanded-conversations",
      JSON.stringify([8])
    )
    renderShelf()
    await waitFor(() => {
      expect(h.registerLiveSurfaceKeys).toHaveBeenCalled()
    })
    const restored = h.registerLiveSurfaceKeys.mock.calls.at(-1)
    expect([...(restored?.[1] ?? [])]).not.toContain("shelf:8")
    clickShelfCard(7)
    await waitFor(() => {
      const last = h.registerLiveSurfaceKeys.mock.calls.at(-1)
      expect([...(last?.[1] ?? [])].sort()).toEqual(["shelf:7"])
    })
  })

  it("drops a live-surface key when that card collapses", () => {
    renderShelf()
    clickShelfCard(7)
    clickShelfCard(8)
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0])
    const last =
      h.registerLiveSurfaceKeys.mock.calls[
        h.registerLiveSurfaceKeys.mock.calls.length - 1
      ]
    expect(last[0]).toBe("shelf")
    expect([...last[1]]).toEqual(["shelf:8"])
  })

  it("clears the shelf live-surface source on unmount", () => {
    const view = renderShelf()
    clickShelfCard(7)
    view.unmount()
    const last =
      h.registerLiveSurfaceKeys.mock.calls[
        h.registerLiveSurfaceKeys.mock.calls.length - 1
      ]
    expect(last[0]).toBe("shelf")
    expect(last[1].size).toBe(0)
  })

  it("anchors the outline on the left edge and keeps jump on the rail", () => {
    renderShelf()
    const anchor = screen.getByTestId("shelf-outline-anchor")
    const jump = screen.getByTestId("shelf-jump")
    expect(anchor.contains(screen.getByTestId("shelf-outline-trigger"))).toBe(
      true
    )
    expect(jump.contains(screen.getByTestId("shelf-outline-trigger"))).toBe(
      false
    )
    expect(screen.queryByTestId("shelf-nav")).toBeNull()
    expect(anchor.closest('[data-testid="shelf-chrome"]')).toBeTruthy()
    expect(anchor.className).toMatch(/w-\[188px\]/)
    expect(jump.className).toMatch(/bottom-3/)
    expect(jump.className).toMatch(/w-\[188px\]/)
    expect(
      screen.getByTestId("shelf-view").querySelector(".border-b.border-border.px-3")
    ).toBeNull()
  })

  it("shows both jump buttons side by side in the middle of the shelf", () => {
    renderShelf()
    const scroller = screen.getByTestId("shelf-scroller")
    const jump = screen.getByTestId("shelf-jump")
    expect(jump.className).toMatch(/w-\[188px\]/)

    setScrollerMetrics(scroller, {
      scrollTop: 0,
      clientHeight: 800,
      scrollHeight: 800,
    })
    expect(screen.queryByRole("button", { name: "Jump to top" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Jump to bottom" })).toBeNull()

    setScrollerMetrics(scroller, {
      scrollTop: 0,
      clientHeight: 800,
      scrollHeight: 2400,
    })
    expect(screen.queryByRole("button", { name: "Jump to top" })).toBeNull()
    expect(screen.getByRole("button", { name: "Jump to bottom" })).toBeTruthy()

    setScrollerMetrics(scroller, {
      scrollTop: 800,
      clientHeight: 800,
      scrollHeight: 2400,
    })
    const toTop = screen.getByRole("button", { name: "Jump to top" })
    const toBottom = screen.getByRole("button", { name: "Jump to bottom" })
    expect(
      toTop.compareDocumentPosition(toBottom) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    setScrollerMetrics(scroller, {
      scrollTop: 1600,
      clientHeight: 800,
      scrollHeight: 2400,
    })
    expect(screen.queryByRole("button", { name: "Jump to bottom" })).toBeNull()
    expect(screen.getByRole("button", { name: "Jump to top" })).toBeTruthy()
  })

  it("jumps the scroller from the project-column buttons", () => {
    renderShelf()
    const scroller = screen.getByTestId("shelf-scroller")
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo

    setScrollerMetrics(scroller, {
      scrollTop: 800,
      clientHeight: 800,
      scrollHeight: 2400,
    })
    fireEvent.click(screen.getByRole("button", { name: "Jump to bottom" }))
    expect(scrollTo).toHaveBeenCalledWith({
      top: 2400,
      behavior: "smooth",
    })
    fireEvent.click(screen.getByRole("button", { name: "Jump to top" }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" })
  })

  it("maps a vertical mouse wheel on the film strip to horizontal scroll", () => {
    renderShelf()
    const film = screen.getByTestId("shelf-row-cards")
    let left = 40
    Object.defineProperty(film, "scrollWidth", {
      configurable: true,
      value: 2000,
    })
    Object.defineProperty(film, "clientWidth", {
      configurable: true,
      value: 400,
    })
    Object.defineProperty(film, "scrollLeft", {
      configurable: true,
      get: () => left,
      set: (value: number) => {
        left = value
      },
    })

    fireEvent.wheel(film, { deltaX: 0, deltaY: 80 })
    expect(left).toBe(120)
  })

  it("puts the recent row above project rows and live-bumps only that row", () => {
    const view = renderShelf()
    const chrome = screen.getByTestId("shelf-chrome")
    expect(chrome.querySelector('[data-testid="shelf-recent-row"]')).toBeTruthy()
    expect(
      chrome.querySelector('[data-testid="shelf-outline-anchor"]')
    ).toBeTruthy()
    const scroller = screen.getByTestId("shelf-scroller")
    expect(
      scroller.querySelector('[data-testid="shelf-recent-row"]')
    ).toBeNull()
    const recentChips = screen.getAllByTestId(/shelf-recent-chip-/)
    expect(recentChips[0]).toHaveAttribute("data-testid", "shelf-recent-chip-7")
    expect(screen.getAllByTestId("shelf-row")[0]).toHaveTextContent("Alpha")

    const original = h.conversations
    h.conversations = [
      { ...original[0], updated_at: "2026-10-02T00:00:00Z" },
      { ...original[1], updated_at: "2026-10-20T00:00:00Z" },
      original[2],
    ]
    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShelfView />
      </NextIntlClientProvider>
    )
    const bumped = screen.getAllByTestId(/shelf-recent-chip-/)
    expect(bumped[0]).toHaveAttribute("data-testid", "shelf-recent-chip-8")
    expect(screen.getAllByTestId("shelf-row")[0]).toHaveTextContent("Alpha")
    const titles = screen
      .getAllByTestId("shelf-card-title")
      .map((el) => el.textContent)
    expect(titles[0]).toMatch(/Fix the flaky test/)
    expect(titles[1]).toMatch(/Review the patch/)
    h.conversations = original
  })

  it("does not steal composer focus when recency live-bumps", () => {
    const view = renderShelf()
    clickShelfCard(7)
    expect(readActive("shelf:7")).toBe(true)

    const original = h.conversations
    h.conversations = [
      original[0],
      { ...original[1], updated_at: "2026-10-21T00:00:00Z" },
      original[2],
    ]
    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShelfView />
      </NextIntlClientProvider>
    )
    expect(readActive("shelf:7")).toBe(true)
    expect(readActive("shelf:8")).not.toBe(true)
    expect(screen.getAllByTestId("conversation-surface")).toHaveLength(1)
    h.conversations = original
  })

  it("opens an off-shelf conversation from a recent chip", () => {
    renderShelf()
    expect(document.querySelector('[data-shelf-card="9"]')).toBeNull()
    fireEvent.click(screen.getByTestId("shelf-recent-chip-9"))
    expect(document.querySelector('[data-shelf-card="9"]')).toBeTruthy()
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-visible-conversations") ?? "null"
      )
    ).toEqual(expect.arrayContaining([9]))
  })

  it("opens the outline panel below chrome, not inside the 188px rail", () => {
    renderShelf()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    const panel = screen.getByTestId("shelf-outline-panel")
    const anchor = screen.getByTestId("shelf-outline-anchor")
    const layer = screen.getByTestId("shelf-outline-layer")
    expect(anchor.contains(panel)).toBe(false)
    expect(layer.contains(panel)).toBe(true)
    expect(panel.className).toMatch(/w-\[24rem\]/)
  })

  it("grows chrome to three chip rows when Recent expands", () => {
    const original = h.conversations
    h.conversations = [
      ...original,
      ...Array.from({ length: 10 }, (_, i) => ({
        ...original[0],
        id: 100 + i,
        title: `Extra ${i + 1}`,
        status: "completed",
        updated_at: `2026-09-${String(i + 10).padStart(2, "0")}T00:00:00Z`,
      })),
    ]
    try {
      renderShelf()
      const chrome = screen.getByTestId("shelf-chrome")
      expect(chrome.className).toMatch(/h-\[52px\]/)
      fireEvent.click(screen.getByTestId("shelf-recent-more"))
      expect(chrome.className).toMatch(/h-\[112px\]/)
      expect(chrome.className).not.toMatch(/h-\[140px\]/)
      expect(chrome.className).toMatch(/overflow-hidden/)
      expect(chrome.className).not.toMatch(/h-\[52px\]/)
    } finally {
      h.conversations = original
    }
  })
})

function clickShelfCard(id: number) {
  const el = document.querySelector(
    `[data-testid="shelf-card-title"][data-shelf-card="${id}"]`
  )
  expect(el).toBeTruthy()
  fireEvent.click(el as HTMLElement)
}

function readActive(key: string) {
  return h.surfaceRendered.mock.calls
    .map((call) => call[0] as { contextKey: string; isActive?: boolean })
    .filter((props) => props.contextKey === key)
    .at(-1)?.isActive
}

function setScrollerMetrics(
  scroller: HTMLElement,
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }
) {
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    value: metrics.scrollTop,
  })
  Object.defineProperty(scroller, "clientHeight", {
    configurable: true,
    value: metrics.clientHeight,
  })
  Object.defineProperty(scroller, "scrollHeight", {
    configurable: true,
    value: metrics.scrollHeight,
  })
  fireEvent.scroll(scroller)
}
