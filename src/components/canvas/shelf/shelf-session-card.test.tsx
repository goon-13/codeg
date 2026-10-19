import { act, fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi, beforeEach } from "vitest"

import enMessages from "@/i18n/messages/en.json"
import type { DbConversationSummary } from "@/lib/types"
import { ShelfSessionCard } from "./shelf-session-card"

const api = vi.hoisted(() => ({
  updateConversationTitle: vi.fn(async () => {}),
}))
vi.mock("@/lib/api", () => ({
  updateConversationTitle: api.updateConversationTitle,
}))
vi.mock("@/components/agent-icon", () => ({
  AgentIcon: () => <span data-testid="agent-icon" />,
}))
vi.mock("../canvas-conversation-surface", () => ({
  CanvasConversationSurface: () => <div data-testid="surface" />,
}))

const connStub = vi.hoisted(() => ({
  current: {
    pendingAskQuestion: null as unknown,
    pendingPlanApproval: null as unknown,
    pendingPermission: null as unknown,
  },
}))
vi.mock("@/hooks/use-connection", () => ({
  useConnection: () => connStub.current,
}))

const conv: DbConversationSummary = {
  id: 11,
  folder_id: 1,
  title: "Shelf card",
  title_locked: false,
  agent_type: "claude_code",
  status: "pending",
  kind: "regular",
  model: null,
  git_branch: null,
  external_id: null,
  message_count: 1,
  child_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  pinned_at: null,
  parent_id: null,
}

const nop = () => {}

function renderCard(expanded: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShelfSessionCard
        conversation={conv}
        expanded={expanded}
        onShelf
        moveTargets={[]}
        onToggleExpand={vi.fn()}
        onMove={nop}
        onHideFromShelf={nop}
        onAddToShelf={nop}
      />
    </NextIntlClientProvider>
  )
}

describe("ShelfSessionCard inline title", () => {
  beforeEach(() => {
    api.updateConversationTitle.mockClear()
    connStub.current = {
      pendingAskQuestion: null,
      pendingPlanApproval: null,
      pendingPermission: null,
    }
  })

  it("click collapsed title expands and does not show input", () => {
    const onToggleExpand = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShelfSessionCard
          conversation={conv}
          expanded={false}
          onShelf
          moveTargets={[]}
          onToggleExpand={onToggleExpand}
          onMove={nop}
          onHideFromShelf={nop}
          onAddToShelf={nop}
        />
      </NextIntlClientProvider>
    )
    fireEvent.click(screen.getByTestId("shelf-card-title"))
    expect(onToggleExpand).toHaveBeenCalled()
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })

  it("pencil opens input without expanding", () => {
    const onToggleExpand = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShelfSessionCard
          conversation={conv}
          expanded={false}
          onShelf
          moveTargets={[]}
          onToggleExpand={onToggleExpand}
          onMove={nop}
          onHideFromShelf={nop}
          onAddToShelf={nop}
        />
      </NextIntlClientProvider>
    )
    fireEvent.click(screen.getByTestId("shelf-card-rename"))
    expect(onToggleExpand).not.toHaveBeenCalled()
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
  })

  it("expanded title click collapses, no input", () => {
    const onToggleExpand = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShelfSessionCard
          conversation={conv}
          expanded
          onShelf
          moveTargets={[]}
          onToggleExpand={onToggleExpand}
          onMove={nop}
          onHideFromShelf={nop}
          onAddToShelf={nop}
        />
      </NextIntlClientProvider>
    )
    fireEvent.click(screen.getByText("Shelf card"))
    expect(onToggleExpand).toHaveBeenCalled()
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })

  it("expanded pencil opens input (editor already mounted)", () => {
    renderCard(true)
    fireEvent.click(screen.getByTestId("shelf-card-rename"))
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
  })

  it("Enter calls updateConversationTitle", async () => {
    renderCard(false)
    fireEvent.click(screen.getByTestId("shelf-card-rename"))
    const input = screen.getByTestId("inline-title-editor-input")
    fireEvent.change(input, { target: { value: "renamed-shelf" } })
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" })
    })
    expect(api.updateConversationTitle).toHaveBeenCalledWith(11, "renamed-shelf")
  })

  it("keeps data-shelf-card while collapsed editing", () => {
    renderCard(false)
    fireEvent.click(screen.getByTestId("shelf-card-rename"))
    expect(document.querySelector('[data-shelf-card="11"]')).toBeTruthy()
  })

  it("F2 on the card does not open the editor", () => {
    renderCard(false)
    fireEvent.keyDown(screen.getByTestId("shelf-card-title"), { key: "F2" })
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })
})

describe("ShelfSessionCard waiting chrome", () => {
  beforeEach(() => {
    connStub.current = {
      pendingAskQuestion: null,
      pendingPlanApproval: null,
      pendingPermission: null,
    }
  })

  function renderWaiting(expanded: boolean, status: DbConversationSummary["status"] = "in_progress") {
    return render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ShelfSessionCard
          conversation={{ ...conv, status }}
          expanded={expanded}
          onShelf
          moveTargets={[]}
          onToggleExpand={vi.fn()}
          onMove={nop}
          onHideFromShelf={nop}
          onAddToShelf={nop}
        />
      </NextIntlClientProvider>
    )
  }

  it("marks an expanded waiting card with data-shelf-expanded and data-acp-waiting", () => {
    connStub.current.pendingAskQuestion = {}
    renderWaiting(true)
    const card = document.querySelector('[data-shelf-card="11"]')
    expect(card).not.toBeNull()
    expect(card).toHaveAttribute("data-shelf-expanded")
    expect(card).toHaveAttribute("data-acp-waiting", "question")
    expect(card?.className).toMatch(/ring-amber-500/)
    expect(card?.className).not.toMatch(/ring-primary\/30/)
    expect(card?.className).not.toMatch(/ring-primary\/25/)
  })

  it("does not set data-shelf-expanded on the collapsed card", () => {
    connStub.current.pendingAskQuestion = {}
    renderWaiting(false)
    const card = document.querySelector('[data-shelf-card="11"]')
    expect(card).not.toBeNull()
    expect(card).not.toHaveAttribute("data-shelf-expanded")
    expect(card).toHaveAttribute("data-acp-waiting", "question")
    expect(card?.className).toMatch(/ring-amber-500/)
    expect(card?.className).not.toMatch(/ring-primary\/30/)
  })

  it("keeps the running primary ring when the connection is not waiting", () => {
    renderWaiting(false)
    const card = document.querySelector('[data-shelf-card="11"]')
    expect(card?.className).toMatch(/ring-primary\/30/)
    expect(card?.className).not.toMatch(/ring-amber-500/)
    expect(card).not.toHaveAttribute("data-acp-waiting")
  })

  it("titles the status dot with the waiting copy", () => {
    connStub.current.pendingAskQuestion = {}
    renderWaiting(false)
    expect(screen.getByTitle("Waiting for you")).toBeTruthy()
  })
})
