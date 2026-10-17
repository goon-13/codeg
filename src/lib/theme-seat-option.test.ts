import { describe, expect, it } from "vitest"
import {
  THEME_SEAT_PROTOCOL_CONFIG_ID,
  buildThemeSeatProtocolOption,
  enabledAgentTypeList,
  interceptThemeSeatProtocolChange,
  mergeThemeSeatProtocolOption,
} from "./theme-seat-option"
import type { SessionConfigOptionInfo } from "./types"

const labels = {
  name: "Protocol",
  off: "Off",
  council: "Council",
  debate: "Debate",
  relay: "Relay",
}

describe("theme-seat protocol chip", () => {
  it("synthesizes a select option that must not be sent to ACP", () => {
    const option = buildThemeSeatProtocolOption({ current: "off", ...labels })
    expect(option.id).toBe(THEME_SEAT_PROTOCOL_CONFIG_ID)
    expect(option.kind.type).toBe("select")
    expect(interceptThemeSeatProtocolChange(option.id, "council")).toBe(
      "council"
    )
    expect(interceptThemeSeatProtocolChange("model", "x")).toBeNull()
  })

  it("prepends the chip", () => {
    const option = buildThemeSeatProtocolOption({ current: "debate", ...labels })
    const model: SessionConfigOptionInfo = {
      id: "model",
      name: "Model",
      kind: { type: "select", current_value: "g", options: [], groups: [] },
    }
    const merged = mergeThemeSeatProtocolOption([model], option)
    expect(merged[0]?.id).toBe(THEME_SEAT_PROTOCOL_CONFIG_ID)
  })
})

describe("enabledAgentTypeList", () => {
  it("puts the current agent first and skips disabled ones", () => {
    expect(
      enabledAgentTypeList(
        [
          { agent_type: "hermes", enabled: true, available: true },
          { agent_type: "grok", enabled: true, available: true },
          { agent_type: "claude", enabled: false, available: true },
        ],
        "grok"
      )
    ).toEqual(["grok", "hermes"])
  })
})
