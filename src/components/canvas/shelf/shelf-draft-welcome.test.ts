import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("shelf draft welcome", () => {
  it("asks the surface for the sidebar welcome column", () => {
    const card = read("src/components/canvas/shelf/shelf-session-card.tsx")
    expect(card).toContain("showWelcome")
    expect(card).toContain("conversationId={null}")
    expect(card).toContain("onAgentTypeChange")

    const surface = read(
      "src/components/canvas/canvas-conversation-surface.tsx"
    )
    expect(surface).toContain("WelcomeHero")
    expect(surface).toContain("QuickActions")
    expect(surface).toMatch(/isDraft && showWelcome && onAgentTypeChange/)
  })

  it("does not persist a row from the new-conversation button", () => {
    const view = read("src/components/canvas/shelf/shelf-view.tsx")
    expect(view).not.toMatch(/onNewConversation=\{async \(\) => \{[\s\S]*createConversation/)
    expect(view).toContain("setDrafts")
  })
})
