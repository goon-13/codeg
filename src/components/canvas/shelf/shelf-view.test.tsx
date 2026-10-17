import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
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
    listChildConversations: vi.fn().mockResolvedValue([]),
    openSideConversation: vi.fn(),
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
  listChildConversations: h.listChildConversations,
  openSideConversation: h.openSideConversation,
  createConversationCluster: vi.fn(),
  deleteConversationCluster: vi.fn(),
  listConversationClusters: vi.fn().mockResolvedValue([]),
  updateConversationCluster: vi.fn(),
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

function film() {
  return within(screen.getByTestId("shelf-scroller"))
}

beforeEach(() => {
  localStorage.clear()
  h.surfaceRendered.mockClear()
  h.registerLiveSurfaceKeys.mockClear()
  h.createConversation.mockClear()
  h.moveConversation.mockClear()
  h.listChildConversations.mockClear()
})

afterEach(() => {
  localStorage.clear()
})

describe("ShelfView", () => {
  it("shows working projects only, running and waiting counts, and no ReactFlow", () => {
    renderShelf()

    expect(film().getByText("Alpha")).toBeTruthy()
    expect(screen.queryByText("Beta")).toBeNull()
    expect(screen.getByText("1 in progress")).toBeTruthy()
    expect(screen.getByText("1 pending review")).toBeTruthy()
    expect(film().getByText("Fix the flaky test")).toBeTruthy()
    expect(film().getByText("Review the patch")).toBeTruthy()
    expect(screen.queryByText("Ship the shelf")).toBeNull()
    expect(document.querySelector(".react-flow")).toBeNull()
    expect(screen.getByTestId("shelf-view")).toBeTruthy()
    expect(screen.getByTestId("shelf-row").className).toMatch(/shrink-0/)
  })

  it("lists off-shelf conversations in the outline, not on the canvas", () => {
    renderShelf()
    expect(screen.queryByText("Ship the shelf")).toBeNull()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    expect(
      screen.getByRole("checkbox", { name: "Ship the shelf" })
    ).toBeTruthy()
  })

  it("removes a conversation from the shelf working set", () => {
    renderShelf()
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Remove this conversation from the shelf",
      })[0]
    )
    expect(screen.queryByText("Fix the flaky test")).toBeNull()
    expect(film().getByText("Review the patch")).toBeTruthy()
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
    expect(
      screen.getByTestId("shelf-outline-title-conversation-9")
    ).toBeTruthy()
    expect(screen.getAllByText("Ship the shelf").length).toBeGreaterThanOrEqual(
      1
    )
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
    fireEvent.click(film().getByText("Fix the flaky test"))
    expect(row.className).toMatch(/min-h-\[560px\]/)
    expect(row.className).not.toMatch(/overflow-y-hidden/)
  })

  it("expands two cards and hands each surface its shelf key", () => {
    renderShelf()

    fireEvent.click(film().getByText("Fix the flaky test"))
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

    fireEvent.click(film().getByText("Review the patch"))
    expect(screen.getAllByTestId("conversation-surface")).toHaveLength(2)
    const keys = h.surfaceRendered.mock.calls.map(
      (call) => (call[0] as { contextKey: string }).contextKey
    )
    expect(keys).toEqual(expect.arrayContaining(["shelf:7", "shelf:8"]))
  })

  it("closes one expanded card and leaves the other mounted", () => {
    renderShelf()
    fireEvent.click(film().getByText("Fix the flaky test"))
    fireEvent.click(film().getByText("Review the patch"))

    const closeButtons = screen.getAllByRole("button", { name: "Close" })
    fireEvent.click(closeButtons[0])

    expect(screen.getAllByTestId("conversation-surface")).toHaveLength(1)
  })

  it("hides a project's cards when its title is collapsed", () => {
    renderShelf()
    expect(
      film().getByRole("button", { name: /Fix the flaky test/ })
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }))

    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    expect(
      film().queryByRole("button", { name: /Fix the flaky test/ })
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

    fireEvent.click(film().getByText("Fix the flaky test"))
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
    fireEvent.click(
      screen.getByRole("button", { name: "Beta", expanded: true })
    )
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-collapsed-folders") ?? "[]"
      )
    ).toEqual([10, 20])
  })

  it("registers expanded shown cards under source shelf", async () => {
    renderShelf()
    fireEvent.click(film().getByText("Fix the flaky test"))
    await waitFor(() => {
      expect(h.registerLiveSurfaceKeys).toHaveBeenCalled()
    })
    const last = h.registerLiveSurfaceKeys.mock.calls.at(-1)
    expect(last?.[0]).toBe("shelf")
    expect([...(last?.[1] ?? [])].sort()).toEqual(["shelf:7"])
  })

  it("only the last opened card is the active composer", () => {
    renderShelf()
    fireEvent.click(film().getByText("Fix the flaky test"))
    fireEvent.click(film().getByText("Review the patch"))
    const latestById = new Map<number, boolean>()
    for (const [props] of h.surfaceRendered.mock.calls) {
      latestById.set(props.conversationId as number, props.isActive as boolean)
    }
    expect(latestById.get(7)).toBe(false)
    expect(latestById.get(8)).toBe(true)
  })

  it("drops a live-surface key when that card collapses", () => {
    renderShelf()
    fireEvent.click(film().getByText("Fix the flaky test"))
    fireEvent.click(film().getByText("Review the patch"))
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
    fireEvent.click(film().getByText("Fix the flaky test"))
    view.unmount()
    const last =
      h.registerLiveSurfaceKeys.mock.calls[
        h.registerLiveSurfaceKeys.mock.calls.length - 1
      ]
    expect(last[0]).toBe("shelf")
    expect(last[1].size).toBe(0)
  })

  it("opens a handoff conversation into the working set", async () => {
    const previous = Element.prototype.scrollIntoView
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      renderShelf()
      expect(screen.queryByText("Ship the shelf")).toBeNull()

      act(() => {
        window.dispatchEvent(
          new CustomEvent("codeg:shelf-open-conversation", {
            detail: { conversationId: 9, folderId: 10 },
          })
        )
      })

      expect(await film().findByText("Ship the shelf")).toBeTruthy()
      expect(screen.getByTestId("conversation-surface")).toBeTruthy()
      expect(h.surfaceRendered.mock.lastCall![0]).toMatchObject({
        conversationId: 9,
        contextKey: "shelf:9",
      })
      expect(
        JSON.parse(
          localStorage.getItem("workspace:shelf-visible-conversations") ??
            "null"
        )
      ).toEqual([7, 8, 9])
      expect(
        JSON.parse(
          localStorage.getItem("workspace:shelf-expanded-conversations") ?? "[]"
        )
      ).toEqual([9])
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    } finally {
      Element.prototype.scrollIntoView = previous
    }
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

  it("does not mount the extra session list rail", () => {
    renderShelf()
    expect(document.querySelector("[data-shelf-session-rail]")).toBeNull()
  })

  it("mounts a side surface in the source card and returns to the source", async () => {
    const previous = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    try {
      h.listChildConversations.mockResolvedValueOnce([
        {
          ...h.conversations[0],
          id: 99,
          kind: "side" as const,
          parent_id: 7,
          title: "side ask",
          child_count: 0,
        },
      ])
      renderShelf()
      act(() => {
        window.dispatchEvent(
          new CustomEvent("codeg:shelf-open-side", {
            detail: { sourceId: 7, sideId: 99, folderId: 10 },
          })
        )
      })

      expect(
        document.querySelector("[data-shelf-side-surface='99']")
      ).toBeTruthy()
      expect(h.openSideConversation).not.toHaveBeenCalled()
      expect(h.surfaceRendered.mock.lastCall![0]).toMatchObject({
        conversationId: 99,
        contextKey: "shelf:99",
      })
      await waitFor(() => {
        const keys = h.registerLiveSurfaceKeys.mock.calls.at(-1)?.[1] as
          | Set<string>
          | undefined
        expect([...(keys ?? [])]).toEqual(["shelf:99"])
      })

      fireEvent.click(screen.getByRole("button", { name: "Back to source" }))
      expect(
        document.querySelector("[data-shelf-side-surface='99']")
      ).toBeNull()
      expect(h.surfaceRendered.mock.lastCall![0]).toMatchObject({
        conversationId: 7,
        contextKey: "shelf:7",
      })
    } finally {
      Element.prototype.scrollIntoView = previous
    }
  })

  it("does not leave the shelf through openConversations", () => {
    for (const path of [
      "src/components/canvas/shelf/shelf-view.tsx",
      "src/components/canvas/shelf/shelf-session-rail.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8")
      expect(source).not.toContain("openConversations(")
    }
  })

  it("does not revive the session list rail from localStorage", () => {
    localStorage.setItem("codeg.shelf.sessionRailOpen", JSON.stringify(true))
    renderShelf()
    expect(document.querySelector("[data-shelf-session-rail]")).toBeNull()
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

describe("expanded shelf card width", () => {
  it("is wide enough that the tick rail does not sit on the dashboard strip", () => {
    const src = readFileSync(
      resolve(__dirname, "shelf-session-card.tsx"),
      "utf8"
    )
    expect(src).toMatch(/SHELF_EXPANDED_WIDTH = 720/)
    expect(src).toMatch(/w-\[720px\]/)
    expect(src).not.toMatch(/SHELF_EXPANDED_WIDTH = 520/)
  })
})

