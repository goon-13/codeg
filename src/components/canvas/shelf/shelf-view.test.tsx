import { fireEvent, render, screen } from "@testing-library/react"
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
})

afterEach(() => {
  localStorage.clear()
})

describe("ShelfView", () => {
  it("shows project names, running and waiting counts, and no ReactFlow", () => {
    renderShelf()

    expect(screen.getByText("Alpha")).toBeTruthy()
    expect(screen.getByText("Beta")).toBeTruthy()
    expect(screen.getByText("1 running")).toBeTruthy()
    expect(screen.getByText("1 waiting")).toBeTruthy()
    expect(screen.getByText("0 running")).toBeTruthy()
    expect(screen.getByText("0 waiting")).toBeTruthy()
    expect(screen.getByText("No conversations here yet")).toBeTruthy()
    expect(screen.getByText("Fix the flaky test")).toBeTruthy()
    expect(screen.getByText("Review the patch")).toBeTruthy()
    expect(screen.getByText("Ship the shelf")).toBeTruthy()
    expect(document.querySelector(".react-flow")).toBeNull()
    expect(screen.getByTestId("shelf-view")).toBeTruthy()
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
    expect(screen.getByText("No conversations here yet")).toBeTruthy()
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
      isActive: true,
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
    const film = alpha.parentElement?.parentElement?.querySelector("[hidden]")
    expect(film?.textContent).toContain("Fix the flaky test")

    fireEvent.click(screen.getByRole("button", { name: "Beta" }))
    expect(
      JSON.parse(
        localStorage.getItem("workspace:shelf-collapsed-folders") ?? "[]"
      )
    ).toEqual([10, 20])
  })
})
