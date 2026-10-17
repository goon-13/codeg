import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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

  it("uses a short trigger and a left-edge panel that closes outside", () => {
    renderOutline()
    const trigger = screen.getByTestId("shelf-outline-trigger")
    expect(trigger.textContent).toMatch(/Outline/)
    expect(trigger.textContent).toMatch(/1·2/)
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByTestId("shelf-outline-panel")).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByTestId("shelf-outline-panel")).toBeTruthy()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId("shelf-outline-panel")).toBeNull()
  })

  it("keeps the panel open when toggling a card inside it", () => {
    renderOutline()
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    fireEvent.click(screen.getByRole("checkbox", { name: "Ship the shelf" }))
    expect(screen.getByTestId("shelf-outline-panel")).toBeTruthy()
  })

  it("expands a mini track to three columns with the double-chevron, not Move up", () => {
    const fat = {
      ...rows[0],
      conversations: [
        conv(7, 10, "A"),
        conv(8, 10, "B"),
        conv(11, 10, "C"),
        conv(12, 10, "D"),
      ],
    }
    const props = renderOutline({
      rows: [fat, rows[1]],
      folderOrder: [20, 10],
      visibleConversationIds: [7, 8, 11, 12],
    })
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    const track = screen.getByTestId("shelf-mini-track-10")
    expect(track.className).toMatch(/overflow-x-auto/)
    expect(screen.queryByTestId("shelf-mini-expand-20")).toBeNull()
    const exp = screen.getByTestId("shelf-mini-expand-10")
    expect(exp.textContent?.trim()).toBe("")
    fireEvent.click(exp)
    expect(track.className).toMatch(/grid-cols-3/)
    fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[0])
    expect(props.onMoveFolder).toHaveBeenCalled()
    expect(track.className).toMatch(/grid-cols-3/)
  })

  it("labels a cancelled status dot so red is not mistaken for an error", () => {
    const cancelled = { ...conv(7, 10, "Fix the flaky test"), status: "cancelled" as const }
    renderOutline({
      rows: [
        { ...rows[0], conversations: [cancelled, rows[0].conversations[1]] },
        rows[1],
      ],
    })
    fireEvent.click(screen.getByTestId("shelf-outline-trigger"))
    const card = screen.getByTestId("shelf-mini-card-7")
    expect(card.querySelector('[title="cancelled"]')).toBeTruthy()
  })
})

  it("does not use a Popover overlay", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/canvas/shelf/shelf-outline.tsx"),
      "utf8"
    )
    expect(src).not.toMatch(/Popover/)
  })

  it("uses the short directory label, not the shelf summary sentence", () => {
    renderOutline()
    const trigger = screen.getByTestId("shelf-outline-trigger")
    expect(trigger.textContent ?? "").toMatch(/Directory 1·2|目录 1·2/)
    expect(trigger.textContent ?? "").not.toMatch(/Shelf ·/)
  })
