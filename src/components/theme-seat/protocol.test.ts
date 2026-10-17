import { describe, expect, it } from "vitest"
import {
  applyTurn,
  argumentMap,
  defaultSeats,
  emptyRun,
  estimateRun,
  halt,
  isThemeSeatTitle,
  nextCalls,
  themeSeatTitle,
  validateGate,
  type Gate,
  type Seat,
} from "./protocol"

const chair: Seat = {
  id: "chair",
  agentType: "grok",
  label: "主席",
  rolePrompt: "合成",
  stance: "chair",
  chair: true,
}
const a: Seat = {
  id: "a",
  agentType: "grok",
  label: "A",
  rolePrompt: "合同",
  stance: "for",
  chair: false,
}
const b: Seat = {
  id: "b",
  agentType: "hermes",
  label: "B",
  rolePrompt: "试点",
  stance: "against",
  chair: false,
}

function gate(over: Partial<Gate> = {}): Gate {
  return {
    theme: "要不要主题席",
    protocol: "council",
    seats: [a, b, chair],
    maxRound: 3,
    budgetUsd: 2.4,
    ...over,
  }
}

describe("validateGate", () => {
  it("blocks an empty theme", () => {
    expect(validateGate(gate({ theme: "  " }))).toBe("empty-theme")
  })
  it("blocks identical speaking personas", () => {
    expect(
      validateGate(
        gate({
          seats: [
            { ...a, rolePrompt: "同" },
            { ...b, rolePrompt: "同" },
            chair,
          ],
        })
      )
    ).toBe("duplicate-persona")
  })
  it("accepts two speaking seats and one chair", () => {
    expect(validateGate(gate())).toBeNull()
  })
})

describe("titles", () => {
  it("prefixes the theme", () => {
    expect(themeSeatTitle(" 闸 ")).toBe("主题席 · 闸")
    expect(isThemeSeatTitle("主题席 · 闸")).toBe(true)
    expect(isThemeSeatTitle("普通")).toBe(false)
  })
})

describe("council nextCalls", () => {
  it("runs speaking seats in parallel then the chair", () => {
    let state = emptyRun({ conversationId: 1, folderId: 9, gate: gate() })
    state = { ...state, status: "running" }
    const r1 = nextCalls(state)
    expect(r1.map((c) => c.seatId).sort()).toEqual(["a", "b"])
    expect(new Set(r1.map((c) => c.parallelGroup)).size).toBe(1)
    expect(r1.every((c) => c.prompt.includes("不要使用任何工具"))).toBe(true)

    state = applyTurn(state, {
      id: "1",
      round: 1,
      seatId: "a",
      text: "甲",
      costUsd: 0.1,
      edges: [],
    })
    state = applyTurn(state, {
      id: "2",
      round: 1,
      seatId: "b",
      text: "乙",
      costUsd: 0.1,
      edges: [],
    })
    const r2 = nextCalls(state)
    expect(r2.map((c) => c.seatId).sort()).toEqual(["a", "b"])
    expect(r2[0]?.prompt).toMatch(/A|B|甲|乙/)

    state = applyTurn(state, {
      id: "3",
      round: 2,
      seatId: "a",
      text: "评",
      costUsd: 0.1,
      edges: [],
    })
    state = applyTurn(state, {
      id: "4",
      round: 2,
      seatId: "b",
      text: "评",
      costUsd: 0.1,
      edges: [],
    })
    const r3 = nextCalls(state)
    expect(r3).toEqual([
      expect.objectContaining({ seatId: "chair", round: 3 }),
    ])

    state = applyTurn(state, {
      id: "5",
      round: 3,
      seatId: "chair",
      text: "终",
      costUsd: 0.2,
      edges: [],
    })
    expect(state.status).toBe("done")
    expect(nextCalls(state)).toEqual([])
  })
})

describe("debate edges", () => {
  it("tags critique turns as 批", () => {
    let state = emptyRun({
      conversationId: 1,
      folderId: 9,
      gate: gate({ protocol: "debate" }),
    })
    state = { ...state, status: "running" }
    state = applyTurn(state, {
      id: "1",
      round: 1,
      seatId: "a",
      text: "甲",
      costUsd: 0,
      edges: [],
    })
    state = applyTurn(state, {
      id: "2",
      round: 1,
      seatId: "b",
      text: "乙",
      costUsd: 0,
      edges: [],
    })
    const r2 = nextCalls(state)
    expect(r2[0]?.prompt).toMatch(/批评|critique|乙|甲/)
    const edged = r2.find((c) => c.seatId === "a")
    expect(edged).toBeTruthy()
  })
})

describe("relay is sequential", () => {
  it("only unlocks the next seat after the previous turn", () => {
    let state = emptyRun({
      conversationId: 1,
      folderId: 9,
      gate: gate({ protocol: "relay" }),
    })
    state = { ...state, status: "running" }
    const first = nextCalls(state)
    expect(first).toHaveLength(1)
    expect(first[0]?.seatId).toBe("a")
    state = applyTurn(state, {
      id: "1",
      round: 1,
      seatId: "a",
      text: "先",
      costUsd: 0,
      edges: [],
    })
    expect(nextCalls(state).map((c) => c.seatId)).toEqual(["b"])
  })
})

describe("halt and budget", () => {
  it("keeps turns after a user halt", () => {
    let state = emptyRun({ conversationId: 1, folderId: 9, gate: gate() })
    state = { ...state, status: "running" }
    state = applyTurn(state, {
      id: "1",
      round: 1,
      seatId: "a",
      text: "甲",
      costUsd: 0.1,
      edges: [],
    })
    state = halt(state, "user")
    expect(state.status).toBe("halted")
    expect(state.turns).toHaveLength(1)
    expect(nextCalls(state)).toEqual([])
  })
  it("estimates council as 5 calls for two speakers", () => {
    const est = estimateRun(gate(), { a: 0.2, b: 0.2, chair: 0.3 })
    expect(est.calls).toBe(5)
    expect(est.usd).toBeCloseTo(0.2 + 0.2 + 0.2 + 0.2 + 0.3)
    expect(est.overBudget).toBe(false)
  })
  it("does not invent a dollar total when a seat is unpriced", () => {
    const est = estimateRun(gate(), { a: 0.2, b: null, chair: 0.3 })
    expect(est.usd).toBeNull()
    expect(est.overBudget).toBe(false)
  })
})

describe("defaultSeats", () => {
  it("gives distinct role prompts even on one agent", () => {
    const seats = defaultSeats(["grok"])
    const speaking = seats.filter((s) => !s.chair)
    expect(speaking.length).toBe(2)
    expect(new Set(speaking.map((s) => s.rolePrompt)).size).toBe(2)
    expect(
      validateGate({
        theme: "x",
        protocol: "council",
        seats,
        maxRound: 3,
        budgetUsd: 2.4,
      })
    ).toBeNull()
  })
})

describe("argumentMap", () => {
  it("flattens turn edges in order", () => {
    expect(
      argumentMap([
        {
          id: "1",
          round: 2,
          seatId: "a",
          text: "批",
          costUsd: 0,
          edges: [{ from: "a", to: "b", kind: "批", note: "试点会变成器官" }],
        },
      ])
    ).toEqual([{ from: "a", to: "b", kind: "批", note: "试点会变成器官" }])
  })
})
