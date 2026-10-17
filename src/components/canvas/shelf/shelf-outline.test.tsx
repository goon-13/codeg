import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "@/i18n/messages/en.json"
import type { DbConversationSummary, FolderDetail } from "@/lib/types"
import { ShelfOutline } from "./shelf-outline"
import type { ShelfProjectRow } from "./shelf-model"

function conv(
  id: number,
  folderId: number,
  title: string
): DbConversationSummary {
  return {
    id,
    folder_id: folderId,
    title,
    title_locked: false,
    agent_type: "claude_code",
    status: "completed",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 1,
    child_count: 0,
    created_at: "2026-08-30T00:00:00Z",
    updated_at: "2026-08-30T10:00:00Z",
    pinned_at: null,
  }
}

function folder(id: number, name: string): FolderDetail {
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
    kind: "regular",
    alias: null,
    group_id: null,
  }
}

const rows: ShelfProjectRow[] = [
  {
    folder: folder(10, "Alpha"),
    conversations: [
      conv(7, 10, "Fix the flaky test"),
      conv(8, 10, "Review the patch"),
    ],
    counts: { running: 0, waiting: 0 },
  },
  {
    folder: folder(20, "Beta"),
    conversations: [conv(9, 20, "Ship the shelf")],
    counts: { running: 0, waiting: 0 },
  },
]

function renderOutline(overrides: Partial<Parameters<typeof ShelfOutline>[0]> = {}) {
  const props = {
    rows,
    visibleFolderIds: [10],
    visibleConversationIds: [7, 8],
    folderOrder: [10, 20],
    conversationOrderByFolder: { 10: [7, 8] } as Record<number, number[]>,
    onToggleFolder: vi.fn(),
    onToggleConversation: vi.fn(),
    onMoveFolder: vi.fn(),
    onMoveConversation: vi.fn(),
    onJumpFolder: vi.fn(),
    onJumpConversation: vi.fn(),
    ...overrides,
  }
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShelfOutline {...props} />
    </NextIntlClientProvider>
  )
  return props
}

describe("ShelfOutline", () => {
  it("toggles membership without jumping", () => {
    const props = renderOutline()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.click(screen.getByRole("checkbox", { name: "Ship the shelf" }))
    expect(props.onToggleConversation).toHaveBeenCalledWith(9, 20)
    expect(props.onJumpConversation).not.toHaveBeenCalled()
  })

  it("jumps from the title without toggling", () => {
    const props = renderOutline()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.click(screen.getByTestId("shelf-outline-title-conversation-7"))
    expect(props.onJumpConversation).toHaveBeenCalledWith(7, 10)
    expect(props.onToggleConversation).not.toHaveBeenCalled()
  })

  it("moves a conversation down", () => {
    const props = renderOutline()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.click(screen.getAllByRole("button", { name: "Move down" })[1])
    expect(props.onMoveConversation).toHaveBeenCalledWith(7, 10, 1)
    expect(props.onJumpConversation).not.toHaveBeenCalled()
  })

  it("renders conversation tiles in a mini track, not a nested tree indent", () => {
    renderOutline()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    expect(screen.getByTestId("shelf-mini-row-10")).toBeTruthy()
    expect(screen.getByTestId("shelf-mini-track-10")).toBeTruthy()
    expect(screen.getByTestId("shelf-mini-card-7")).toBeTruthy()
    expect(screen.getByTestId("shelf-mini-card-8")).toBeTruthy()
    expect(screen.getByTestId("shelf-mini-card-9")).toBeTruthy()
    expect(screen.getByTestId("shelf-mini-card-9").className).toMatch(
      /opacity-50/
    )
  })

  it("filters mini cards from the search box", () => {
    renderOutline()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.change(screen.getByPlaceholderText("Edit shelf"), {
      target: { value: "ship" },
    })
    expect(screen.queryByTestId("shelf-mini-card-7")).toBeNull()
    expect(screen.getByTestId("shelf-mini-card-9")).toBeTruthy()
  })
})
