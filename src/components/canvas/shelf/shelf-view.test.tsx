import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

  it("creates a conversation in the project row", async () => {
    renderShelf()
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }))
    await waitFor(() =>
      expect(h.createConversation).toHaveBeenCalledWith(10, "claude_code")
    )
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

  it("drops a live-surface key when that card collapses", () => {
    renderShelf()
    fireEvent.click(screen.getByText("Fix the flaky test"))
    fireEvent.click(screen.getByText("Review the patch"))
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
    fireEvent.click(screen.getByText("Fix the flaky test"))
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
    expect(anchor.className).toMatch(/top-3/)
    expect(anchor.className).toMatch(/left-3/)
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
})

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
