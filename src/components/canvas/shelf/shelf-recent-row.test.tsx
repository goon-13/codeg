import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "@/i18n/messages/en.json"
import type { DbConversationSummary } from "@/lib/types"
import { ShelfRecentRow } from "./shelf-recent-row"

vi.mock("../canvas-conversation-surface", () => ({
  CanvasConversationSurface: () => {
    throw new Error("recent row must not mount a conversation surface")
  },
}))

function conv(
  id: number,
  title: string,
  updatedAt: string,
  folderId = 10
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
    updated_at: updatedAt,
    pinned_at: null,
  }
}

function renderRow(
  conversations: DbConversationSummary[],
  onOpen = vi.fn()
) {
  return {
    onOpen,
    ...render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShelfRecentRow
          conversations={conversations}
          onOpenConversation={onOpen}
        />
      </NextIntlClientProvider>
    ),
  }
}

describe("ShelfRecentRow", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    conv(
      i + 1,
      `Session ${i + 1}`,
      `2026-10-16T00:${String(12 - i).padStart(2, "0")}:00Z`
    )
  )

  it("renders newest chip first and no conversation surface", () => {
    renderRow(many.slice(0, 3))
    const chips = screen.getAllByTestId(/shelf-recent-chip-/)
    expect(chips[0]).toHaveAttribute("data-testid", "shelf-recent-chip-1")
    expect(screen.queryByTestId("conversation-surface")).toBeNull()
  })

  it("expands overflow chips inside the strip, not a dropdown", () => {
    renderRow(many)
    expect(screen.queryByTestId("shelf-recent-chip-12")).toBeNull()
    const more = screen.getByTestId("shelf-recent-more")
    expect(more).toHaveAttribute("aria-expanded", "false")
    expect(more.textContent?.trim()).toBe("")
    expect(more).toHaveAttribute("aria-label", "More")
    fireEvent.click(more)
    expect(screen.getByTestId("shelf-recent-panel")).toBeTruthy()
    expect(screen.getByTestId("shelf-recent-chip-12")).toBeTruthy()
    expect(screen.queryByTestId("shelf-recent-panel-12")).toBeNull()
    expect(more).toHaveAttribute("aria-expanded", "true")
    expect(more).toHaveAttribute("aria-label", "Show less")
    expect(more.textContent?.trim()).toBe("")
    fireEvent.click(more)
    expect(screen.queryByTestId("shelf-recent-chip-12")).toBeNull()
  })

  it("keeps the Recent label visible in the chrome", () => {
    renderRow(many.slice(0, 2))
    expect(screen.getByText("Recent")).toBeTruthy()
  })

  it("closes the panel on Escape", () => {
    renderRow(many)
    fireEvent.click(screen.getByTestId("shelf-recent-more"))
    expect(screen.getByTestId("shelf-recent-panel")).toBeTruthy()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByTestId("shelf-recent-panel")).toBeNull()
  })

  it("notifies the parent when a chip is clicked, without claiming a surface", () => {
    const { onOpen } = renderRow(many.slice(0, 2))
    fireEvent.click(screen.getByTestId("shelf-recent-chip-2"))
    expect(onOpen).toHaveBeenCalledWith(2, 10)
  })

  it("locks the expanded chip track to a bounded vertical scroller", () => {
    renderRow(many)
    fireEvent.click(screen.getByTestId("shelf-recent-more"))
    const row = screen.getByTestId("shelf-recent-row")
    const panel = screen.getByTestId("shelf-recent-panel")
    expect(row.className).toMatch(/h-full/)
    expect(row.className).toMatch(/overflow-hidden/)
    expect(panel.className).toMatch(/h-full/)
    expect(panel.className).toMatch(/overflow-y-auto/)
    expect(panel.className).toMatch(/flex-wrap/)
    expect(panel.className).toMatch(/scrollbar-thin/)
  })

  it("lazy-loads the next page when the locked track is scrolled near the bottom", () => {
    const lots = Array.from({ length: 40 }, (_, i) =>
      conv(
        i + 1,
        `Session ${i + 1}`,
        `2026-10-16T00:${String(40 - i).padStart(2, "0")}:00Z`
      )
    )
    renderRow(lots)
    fireEvent.click(screen.getByTestId("shelf-recent-more"))
    expect(screen.getByTestId("shelf-recent-chip-28")).toBeTruthy()
    expect(screen.queryByTestId("shelf-recent-chip-29")).toBeNull()
    const panel = screen.getByTestId("shelf-recent-panel")
    Object.defineProperty(panel, "scrollHeight", {
      configurable: true,
      value: 400,
    })
    Object.defineProperty(panel, "clientHeight", {
      configurable: true,
      value: 80,
    })
    Object.defineProperty(panel, "scrollTop", {
      configurable: true,
      value: 200,
    })
    fireEvent.scroll(panel)
    expect(screen.queryByTestId("shelf-recent-chip-29")).toBeNull()
    Object.defineProperty(panel, "scrollTop", {
      configurable: true,
      value: 360,
    })
    fireEvent.scroll(panel)
    expect(screen.getByTestId("shelf-recent-chip-29")).toBeTruthy()
  })
})
