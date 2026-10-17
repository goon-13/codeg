import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import enMessages from "@/i18n/messages/en.json"
import type { DbConversationSummary } from "@/lib/types"

import type { ShelfRailRow } from "./shelf-session-rail-model"
import { ShelfSessionRail } from "./shelf-session-rail"

function conv(
  id: number,
  title: string,
  kind: DbConversationSummary["kind"] = "regular"
): DbConversationSummary {
  return {
    id,
    folder_id: 1,
    title,
    title_locked: false,
    agent_type: "claude_code",
    status: "pending",
    kind,
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 0,
    child_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    pinned_at: null,
    parent_id: kind === "side" ? 1 : null,
  }
}

const rows: ShelfRailRow[] = [
  { kind: "folder", folderId: 1, title: "Alpha" },
  {
    kind: "cluster",
    clusterId: 3,
    title: "Theme",
    memberCount: 2,
    agentTypes: ["claude_code"],
    expanded: true,
    depth: 0,
  },
  { kind: "conversation", conversation: conv(1, "Source"), depth: 1 },
  {
    kind: "conversation",
    conversation: conv(2, "Side ask", "side"),
    depth: 2,
  },
]

function renderRail(
  open: boolean,
  onSelectConversation = vi.fn(),
  onOpenChange = vi.fn()
) {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShelfSessionRail
        rows={rows}
        open={open}
        onOpenChange={onOpenChange}
        onToggleCluster={vi.fn()}
        onSelectConversation={onSelectConversation}
        onRename={vi.fn()}
        onDissolve={vi.fn()}
      />
    </NextIntlClientProvider>
  )
  return { onSelectConversation, onOpenChange }
}

describe("ShelfSessionRail", () => {
  it("renders folder, cluster, and conversation rows when open", () => {
    renderRail(true)
    const rail = document.querySelector("[data-shelf-session-rail]")
    expect(rail).toBeTruthy()
    expect(rail?.getAttribute("data-open")).toBe("true")
    expect(rail?.className).toContain("w-[18rem]")
    expect(rail?.className).toContain("shrink-0")
    expect(rail?.className).toContain("self-stretch")
    expect(rail?.className).toContain("border-r")
    expect(rail?.className).toContain("border-border")
    expect(screen.getByText("Alpha").className).toContain("text-xs")
    expect(screen.getByText("Alpha").className).toContain(
      "text-muted-foreground"
    )
    expect(document.querySelector("[data-conversation-cluster]")).toBeTruthy()
    expect(document.querySelector("[data-rail-conversation='1']")).toBeTruthy()
    const side = document.querySelector("[data-rail-conversation='2']")
    expect(side).toHaveAttribute("data-side-row", "")
    expect(side?.textContent).toContain("Side")
    expect(
      screen.getByRole("button", { name: "Hide session list" }).textContent
    ).toContain("Sessions")
  })

  it("keeps the root mounted when closed", () => {
    const { onOpenChange } = renderRail(false)
    const rail = document.querySelector("[data-shelf-session-rail]")
    expect(rail).toBeTruthy()
    expect(rail?.getAttribute("data-open")).toBe("false")
    expect(rail?.className).toContain("w-12")
    expect(rail?.className).not.toContain("w-[18rem]")
    fireEvent.keyDown(document.body, { key: "Escape" })
    fireEvent.mouseDown(document.body)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "Show session list" }).textContent
    ).toContain("Sessions")
  })

  it("selects a conversation and does not call openConversations", () => {
    const { onSelectConversation } = renderRail(true)
    fireEvent.click(document.querySelector("[data-rail-conversation='2']")!)
    expect(onSelectConversation).toHaveBeenCalledTimes(1)
    expect(onSelectConversation.mock.calls[0][0].id).toBe(2)

    for (const path of [
      "src/components/canvas/shelf/shelf-session-rail.tsx",
      "src/components/canvas/shelf/shelf-view.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8")
      expect(source).not.toContain("openConversations")
      expect(source).not.toContain("openTab")
    }
  })
})
