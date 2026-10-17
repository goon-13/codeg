import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

import enMessages from "@/i18n/messages/en.json"
import type { DbConversationSummary } from "@/lib/types"

const conn = vi.hoisted(() => ({
  current: {
    pendingAskQuestion: null as unknown,
    pendingPlanApproval: null as unknown,
    pendingPermission: null as unknown,
  },
}))

vi.mock("@/hooks/use-connection", () => ({
  useConnection: () => conn.current,
}))

vi.mock("../canvas-conversation-surface", () => ({
  CanvasConversationSurface: () => <div data-testid="conversation-surface" />,
}))

import { ShelfSessionCard } from "./shelf-session-card"

function conversation(
  over: Partial<DbConversationSummary> = {}
): DbConversationSummary {
  return {
    id: 42,
    folder_id: 10,
    title: "Ask me",
    title_locked: false,
    agent_type: "claude_code",
    status: "in_progress",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 1,
    child_count: 0,
    created_at: "2026-08-30T00:00:00Z",
    updated_at: "2026-10-17T00:00:00Z",
    pinned_at: null,
    ...over,
  }
}

const noop = () => {}

function renderCard(props: {
  expanded: boolean
  conversation?: DbConversationSummary
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShelfSessionCard
        conversation={props.conversation ?? conversation()}
        expanded={props.expanded}
        onShelf
        moveTargets={[]}
        onToggleExpand={noop}
        onMove={noop}
        onHideFromShelf={noop}
        onAddToShelf={noop}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  conn.current = {
    pendingAskQuestion: null,
    pendingPlanApproval: null,
    pendingPermission: null,
  }
})

describe("ShelfSessionCard waiting chrome", () => {
  it("marks an expanded waiting card with data-shelf-expanded and data-acp-waiting", () => {
    conn.current.pendingAskQuestion = {}
    renderCard({ expanded: true })
    const card = document.querySelector('[data-shelf-card="42"]')
    expect(card).not.toBeNull()
    expect(card).toHaveAttribute("data-shelf-expanded")
    expect(card).toHaveAttribute("data-acp-waiting", "question")
    expect(card?.className).toMatch(/ring-amber-500/)
    expect(card?.className).not.toMatch(/ring-primary\/30/)
    expect(card?.className).not.toMatch(/ring-primary\/25/)
  })

  it("does not set data-shelf-expanded on the collapsed card", () => {
    conn.current.pendingAskQuestion = {}
    renderCard({ expanded: false })
    const card = document.querySelector('[data-shelf-card="42"]')
    expect(card).not.toBeNull()
    expect(card).not.toHaveAttribute("data-shelf-expanded")
    expect(card).toHaveAttribute("data-acp-waiting", "question")
    expect(card?.className).toMatch(/ring-amber-500/)
    expect(card?.className).not.toMatch(/ring-primary\/30/)
  })

  it("keeps the running primary ring when the connection is not waiting", () => {
    renderCard({ expanded: false })
    const card = document.querySelector('[data-shelf-card="42"]')
    expect(card?.className).toMatch(/ring-primary\/30/)
    expect(card?.className).not.toMatch(/ring-amber-500/)
    expect(card).not.toHaveAttribute("data-acp-waiting")
  })

  it("titles the status dot with the waiting copy", () => {
    conn.current.pendingAskQuestion = {}
    renderCard({ expanded: false })
    expect(screen.getByTitle("Waiting for you")).toBeTruthy()
  })
})
