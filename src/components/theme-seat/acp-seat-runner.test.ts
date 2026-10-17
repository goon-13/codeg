import { describe, expect, it } from "vitest"
import { CHAT_ONLY_PREAMBLE } from "./protocol"
import {
  buildSeatPrompt,
  extractAssistantText,
  pickDenyOption,
} from "./acp-seat-runner"

describe("pickDenyOption", () => {
  it("picks a deny option", () => {
    expect(
      pickDenyOption([
        { optionId: "allow-once", name: "Allow" },
        { optionId: "reject", name: "Reject" },
      ])
    ).toBe("reject")
  })
  it("returns null when every option looks like allow", () => {
    expect(pickDenyOption([{ optionId: "a", name: "Allow once" }])).toBeNull()
  })
})

describe("extractAssistantText", () => {
  it("returns the last assistant text block", () => {
    expect(
      extractAssistantText([
        { role: "user", blocks: [{ type: "text", text: "问" }] },
        { role: "assistant", blocks: [{ type: "text", text: " 答 " }] },
      ])
    ).toBe("答")
  })
  it("skips empty assistant turns", () => {
    expect(
      extractAssistantText([
        { role: "assistant", blocks: [{ type: "text", text: "先" }] },
        { role: "assistant", blocks: [{ type: "text", text: "  " }] },
      ])
    ).toBe("先")
  })
})

describe("buildSeatPrompt", () => {
  it("always starts with the chat-only preamble", () => {
    expect(
      buildSeatPrompt({
        seatId: "a",
        round: 1,
        prompt: "主题：x",
        parallelGroup: 1,
      })
    ).toMatch(/^你是主题席/)
    expect(
      buildSeatPrompt({
        seatId: "a",
        round: 1,
        prompt: "主题：x",
        parallelGroup: 1,
      }).startsWith(CHAT_ONLY_PREAMBLE)
    ).toBe(true)
  })
})
