import { describe, expect, it } from "vitest"
import { emptyRun, type Gate, type PlannedCall, type RunState, type SeatTurn } from "./protocol"
import { playRun, type SeatRunner } from "./run-loop"

const gate: Gate = {
  theme: "要不要主题席",
  protocol: "council",
  seats: [
    {
      id: "a",
      agentType: "grok",
      label: "A",
      rolePrompt: "合同",
      stance: "for",
      chair: false,
    },
    {
      id: "b",
      agentType: "hermes",
      label: "B",
      rolePrompt: "试点",
      stance: "against",
      chair: false,
    },
    {
      id: "chair",
      agentType: "grok",
      label: "主席",
      rolePrompt: "合成",
      stance: "chair",
      chair: true,
    },
  ],
  maxRound: 3,
  budgetUsd: 2.4,
}

const fake: SeatRunner = {
  async complete(call: PlannedCall, _state: RunState): Promise<SeatTurn> {
    return {
      id: `${call.round}:${call.seatId}`,
      round: call.round,
      seatId: call.seatId,
      text: `ok:${call.seatId}`,
      costUsd: 0.01,
      edges: [],
    }
  },
}

describe("playRun", () => {
  it("walks a two-speaker council to done with five turns", async () => {
    const start = emptyRun({ conversationId: 1, folderId: 1, gate })
    const snapshots: RunState[] = []
    const end = await playRun(start, fake, (state) => snapshots.push(state))
    expect(end.status).toBe("done")
    expect(end.turns).toHaveLength(5)
    expect(end.turns.map((turn) => turn.seatId).sort()).toEqual(
      ["a", "a", "b", "b", "chair"].sort()
    )
    expect(snapshots.length).toBeGreaterThan(0)
  })

  it("stops on halt after the first group and keeps those turns", async () => {
    const start = emptyRun({ conversationId: 1, folderId: 1, gate })
    const signal = { halted: false }
    const end = await playRun(
      start,
      fake,
      (state) => {
        if (state.turns.length >= 2) signal.halted = true
      },
      signal
    )
    expect(end.status).toBe("halted")
    expect(end.turns.length).toBeGreaterThanOrEqual(2)
    expect(end.turns.length).toBeLessThan(5)
  })
})
