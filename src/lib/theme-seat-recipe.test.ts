import { describe, expect, it } from "vitest"
import { speakingSeats } from "@/components/theme-seat/protocol"
import {
  buildDefaultSeats,
  isSeatMouthTitle,
  isThemeSeatRecipe,
  parseRecipe,
  shouldInterceptFirstSend,
  themeSeatCreatePlan,
} from "./theme-seat-recipe"

const roles = {
  for: "赞成。只看验收口。",
  against: "反对。只看规格缺口。",
  specialist: "专项。",
  chair: "合成。不抬杠。",
}

describe("theme-seat-recipe", () => {
  it("defaults unknown to code", () => {
    expect(parseRecipe(null)).toBe("code")
    expect(parseRecipe("forum")).toBe("code")
    expect(parseRecipe("debate")).toBe("debate")
  })

  it("theme-seat recipes are not code", () => {
    expect(isThemeSeatRecipe("debate")).toBe(true)
    expect(isThemeSeatRecipe("code")).toBe(false)
  })

  it("intercepts only unpersisted non-code sends", () => {
    expect(shouldInterceptFirstSend("debate", false)).toBe(true)
    expect(shouldInterceptFirstSend("code", false)).toBe(false)
    expect(shouldInterceptFirstSend("debate", true)).toBe(false)
  })

  it("hides seat mouth titles", () => {
    expect(isSeatMouthTitle("席 · Grok · 闸")).toBe(true)
    expect(isSeatMouthTitle("主题席 · 闸")).toBe(false)
  })

  it("fills two speaking seats even with one other agent", () => {
    const seats = buildDefaultSeats({
      protocol: "debate",
      chairAgent: "grok",
      chairLabel: "Grok",
      others: [{ agentType: "claude", label: "Claude" }],
      role: roles,
    })
    const speaking = speakingSeats({
      theme: "t",
      protocol: "debate",
      seats,
      maxRound: 3,
      budgetUsd: 2.4,
    })
    expect(speaking).toHaveLength(2)
    expect(speaking[0]?.stance).toBe("for")
    expect(speaking[1]?.stance).toBe("against")
    expect(speaking[0]?.rolePrompt).not.toBe(speaking[1]?.rolePrompt)
    expect(seats.filter((seat) => seat.chair)).toHaveLength(1)
  })

  it("rejects empty theme before create", () => {
    const seats = buildDefaultSeats({
      protocol: "council",
      chairAgent: "grok",
      chairLabel: "Grok",
      others: [
        { agentType: "claude", label: "Claude" },
        { agentType: "cursor", label: "Cursor" },
      ],
      role: roles,
    })
    expect(themeSeatCreatePlan({
      folderId: 3,
      recipe: "council",
      theme: "   ",
      seats,
    })).toEqual({ error: "empty-theme" })
  })

  it("titles the parent with the prefix", () => {
    const seats = buildDefaultSeats({
      protocol: "relay",
      chairAgent: "grok",
      chairLabel: "Grok",
      others: [
        { agentType: "claude", label: "Claude" },
        { agentType: "cursor", label: "Cursor" },
      ],
      role: roles,
    })
    const plan = themeSeatCreatePlan({
      folderId: 3,
      recipe: "relay",
      theme: "要不要锁三家",
      seats,
    })
    expect("title" in plan && plan.title).toBe("主题席 · 要不要锁三家")
  })
})
