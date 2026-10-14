import { describe, expect, it } from "vitest"
import { compareAgentType, type AgentType } from "./types"

function sorted(ids: AgentType[]): AgentType[] {
  return [...ids].sort(compareAgentType)
}

describe("compareAgentType", () => {
  it("keeps custom hermes roles immediately after built-in hermes", () => {
    expect(
      sorted([
        "custom:goose",
        "custom:hermes-homeops",
        "antigravity",
        "cline",
        "hermes",
        "custom:hermes-roleadmin",
        "codex",
      ])
    ).toEqual([
      "codex",
      "cline",
      "hermes",
      "custom:hermes-homeops",
      "custom:hermes-roleadmin",
      "antigravity",
      "custom:goose",
    ])
  })
})
