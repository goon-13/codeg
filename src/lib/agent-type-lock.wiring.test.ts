import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("agent type picker wiring", () => {
  it("hides the canvas AgentSelector once the conversation has started", () => {
    const src = readFileSync(
      resolve("src/components/canvas/canvas-conversation-surface.tsx"),
      "utf8"
    )
    expect(src).toContain("shouldShowAgentTypePicker")
    expect(src).not.toMatch(/\{isDraft && onAgentTypeChange && \(/)
  })
})
