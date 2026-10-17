import { describe, expect, it } from "vitest"
import {
  buildHandoffPacket,
  extractHandoffTurns,
  HANDOFF_PACKET_CHARS,
  HANDOFF_TURN_CHARS,
} from "./handoff-packet"
import type { MessageTurn } from "@/lib/types"

describe("buildHandoffPacket", () => {
  it("uses a placeholder when the goal is empty", () => {
    const packet = buildHandoffPacket({
      goal: "  ",
      sourceTitle: "A",
      turns: [],
    })
    expect(packet).toContain("目标：（未抽出，请改）")
    expect(packet).not.toMatch(/@/)
  })

  it("fills placeholders and includes the goal", () => {
    const packet = buildHandoffPacket({
      goal: "把货架新建改成草稿卡",
      sourceTitle: "货架新建",
      turns: [{ role: "user", text: "hello" }],
    })
    expect(packet).toContain("目标：把货架新建改成草稿卡")
    expect(packet).toContain("（未抽出，请改）")
    expect(packet).not.toMatch(/@货架新建/)
    expect(packet).toContain("用户：hello")
    expect(packet).not.toMatch(/"tool_use"/)
  })

  it("clips overlong turns", () => {
    const packet = buildHandoffPacket({
      goal: "x",
      sourceTitle: "A",
      turns: [{ role: "user", text: "y".repeat(HANDOFF_TURN_CHARS + 50) }],
    })
    expect(packet.length).toBeLessThanOrEqual(HANDOFF_PACKET_CHARS)
    expect(packet).toContain("…")
  })
})

describe("extractHandoffTurns", () => {
  it("keeps only user/assistant text", () => {
    const turns = [
      {
        id: "1",
        role: "user",
        timestamp: "t",
        blocks: [{ type: "text", text: "hi" }],
      },
      {
        id: "2",
        role: "assistant",
        timestamp: "t",
        blocks: [
          {
            type: "tool_use",
            tool_use_id: "1",
            tool_name: "bash",
            input_preview: '{"cmd":1}',
          },
        ],
      },
      {
        id: "3",
        role: "assistant",
        timestamp: "t",
        blocks: [{ type: "text", text: "done" }],
      },
    ] as MessageTurn[]
    expect(extractHandoffTurns(turns)).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "done" },
    ])
  })
})
