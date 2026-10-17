import { describe, expect, it, vi } from "vitest"

import { landSessionNotify, liveShelfCard } from "./session-notify-land"

function mount(html: string) {
  document.body.innerHTML = html
}

describe("liveShelfCard", () => {
  it("hidden keep-alive card is not live", () => {
    mount(`<div class="conversation-tab-hidden">
      <button data-shelf-card="5" data-testid="shelf-card-title"></button>
    </div>`)
    expect(liveShelfCard(5, document)).toBeNull()
  })
})

describe("landSessionNotify", () => {
  it("clicks live collapsed card and does not openTab", () => {
    mount(`<button data-shelf-card="5" data-testid="shelf-card-title"></button>`)
    const btn = document.querySelector("button")!
    let clicked = false
    btn.addEventListener("click", () => {
      clicked = true
    })
    const openTab = vi.fn()
    const result = landSessionNotify(
      { conversationId: 5, folderId: 1, agentType: "codex" },
      { document, openTab }
    )
    expect(result).toBe("shelf")
    expect(clicked).toBe(true)
    expect(openTab).not.toHaveBeenCalled()
  })

  it("openTab when no live card", () => {
    mount(`<div></div>`)
    const openTab = vi.fn()
    const result = landSessionNotify(
      { conversationId: 5, folderId: 1, agentType: "codex" },
      { document, openTab }
    )
    expect(result).toBe("tab")
    expect(openTab).toHaveBeenCalledWith(1, 5, "codex", true)
  })

  it("none when conversationId is missing", () => {
    const openTab = vi.fn()
    expect(
      landSessionNotify(
        { conversationId: null, folderId: 1, agentType: "codex" },
        { document, openTab }
      )
    ).toBe("none")
    expect(openTab).not.toHaveBeenCalled()
  })
})
