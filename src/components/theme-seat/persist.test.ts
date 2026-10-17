import { describe, expect, it } from "vitest"
import { emptyRun } from "./protocol"
import { parseRun, serializeRun } from "./persist"

it("round-trips a gated run", () => {
  const state = emptyRun({
    conversationId: 8,
    folderId: 3,
    gate: {
      theme: "主题",
      protocol: "debate",
      seats: [
        {
          id: "a",
          agentType: "grok",
          label: "A",
          rolePrompt: "一",
          stance: "for",
          chair: false,
        },
        {
          id: "b",
          agentType: "grok",
          label: "B",
          rolePrompt: "二",
          stance: "against",
          chair: false,
        },
        {
          id: "c",
          agentType: "grok",
          label: "主席",
          rolePrompt: "合",
          stance: "chair",
          chair: true,
        },
      ],
      maxRound: 3,
      budgetUsd: 2.4,
    },
  })
  const again = parseRun(serializeRun(state))
  expect(again).toEqual(state)
})

it("rejects junk", () => {
  expect(parseRun("")).toBeNull()
  expect(parseRun("{}")).toBeNull()
  expect(parseRun('{"version":2}')).toBeNull()
})
