import { describe, expect, it } from "vitest"
import type { ContentBlock } from "@/lib/types"
import {
  SIDE_SEED_PREFIX,
  buildSideSeed,
  isSideSeedText,
  parseSideSlash,
  planSideIntercept,
  sideSeedSourceTurns,
} from "./side-seed"

describe("parseSideSlash", () => {
  it("parses /BTW foo", () => {
    expect(parseSideSlash("  /BTW foo  ")).toEqual({
      cmd: "side",
      question: "foo",
    })
  })

  it("parses a bare /side", () => {
    expect(parseSideSlash("/side")).toEqual({ cmd: "side", question: "" })
  })

  it("rejects /sideways", () => {
    expect(parseSideSlash("/sideways")).toBeNull()
    expect(parseSideSlash("/sideways now")).toBeNull()
  })

  it("rejects a slash that is not the whole command", () => {
    expect(parseSideSlash("please /side this")).toBeNull()
  })
})

describe("planSideIntercept", () => {
  it("plans a side open instead of a source send", () => {
    // Non-null is the handleSend branch that returns before lifecycleSend.
    // Null is a normal source-session send.
    expect(
      planSideIntercept({
        kind: "regular",
        hasDbId: true,
        text: "/side where",
      })
    ).toEqual({ question: "where" })
    expect(
      planSideIntercept({
        kind: "regular",
        hasDbId: true,
        text: "where",
      })
    ).toBeNull()
    expect(
      planSideIntercept({
        kind: "side",
        hasDbId: true,
        text: "/side again",
      })
    ).toBeNull()
    expect(
      planSideIntercept({
        kind: "regular",
        hasDbId: false,
        text: "/btw x",
      })
    ).toBeNull()
  })

  it("plans again on a second call (1:N is not collapsed)", () => {
    const input = {
      kind: "regular" as const,
      hasDbId: true,
      text: "/btw again",
    }
    expect(planSideIntercept(input)).toEqual({ question: "again" })
    expect(planSideIntercept(input)).toEqual({ question: "again" })
  })
})

describe("sideSeedSourceTurns", () => {
  it("keeps user and assistant text and drops the rest", () => {
    const tool = {
      type: "tool_use",
      tool_use_id: null,
      tool_name: "read",
      input_preview: null,
    } as ContentBlock
    expect(
      sideSeedSourceTurns([
        { role: "system", blocks: [{ type: "text", text: "sys" }] },
        {
          role: "user",
          blocks: [
            { type: "thinking", text: "secret" },
            { type: "text", text: " hi " },
          ],
        },
        {
          role: "assistant",
          blocks: [tool, { type: "text", text: "there" }],
        },
        { role: "user", blocks: [{ type: "text", text: "   " }] },
      ])
    ).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "there" },
    ])
  })
})

describe("buildSideSeed", () => {
  it("returns the prefix when there are no turns", () => {
    expect(buildSideSeed([])).toBe(SIDE_SEED_PREFIX)
    expect(isSideSeedText(buildSideSeed([]))).toBe(true)
  })

  it("keeps a short pair and drops older turns once the packet exceeds 4000", () => {
    const turns = Array.from({ length: 6 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `T${i} ` + "x".repeat(2000),
    }))
    const seed = buildSideSeed(turns)
    expect(seed.startsWith(SIDE_SEED_PREFIX)).toBe(true)
    expect(seed.length).toBeLessThanOrEqual(4000)
    expect(seed).toContain("T4 ")
    expect(seed).toContain("T5 ")
    expect(seed).not.toContain("T0 ")
    expect(seed).not.toContain("T1 ")
    expect(seed).not.toContain("T2 ")
    expect(seed).not.toContain("T3 ")
    expect(isSideSeedText(seed)).toBe(true)
    expect(isSideSeedText("为什么")).toBe(false)
  })

  it("keeps up to four short turns", () => {
    const turns = [0, 1, 2, 3].map((i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      text: `S${i}`,
    }))
    const seed = buildSideSeed(turns)
    for (const i of [0, 1, 2, 3]) expect(seed).toContain(`S${i}`)
  })
})
