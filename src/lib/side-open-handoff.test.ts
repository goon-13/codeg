import { afterEach, describe, expect, it, vi } from "vitest"
import { SIDE_SEED_PREFIX, isSideSeedText } from "./side-seed"
import {
  SIDE_OPEN_PARKED_EVENT,
  consumeSideOpen,
  discardSideOpen,
  parkSideOpen,
  resetSideOpenForTests,
  sideOpenDrafts,
} from "./side-open-handoff"

afterEach(() => {
  resetSideOpenForTests()
})

describe("side open handoff", () => {
  it("is taken by the new tab only, once", () => {
    parkSideOpen("conv-1-claude-9", {
      seed: SIDE_SEED_PREFIX,
      question: "why",
    })
    expect(consumeSideOpen("conv-1-claude-8")).toBeNull()
    expect(consumeSideOpen("conv-1-claude-9")).toEqual({
      seed: SIDE_SEED_PREFIX,
      question: "why",
    })
    expect(consumeSideOpen("conv-1-claude-9")).toBeNull()
  })

  it("orders a hidden seed before the visible question", () => {
    const drafts = sideOpenDrafts({
      seed: SIDE_SEED_PREFIX,
      question: " why ",
    })
    expect(drafts.map((draft) => draft.displayText)).toEqual([
      SIDE_SEED_PREFIX,
      "why",
    ])
    expect(isSideSeedText(drafts[0].displayText)).toBe(true)
    expect(isSideSeedText(drafts[1].displayText)).toBe(false)
  })

  it("omits an empty question", () => {
    expect(
      sideOpenDrafts({ seed: SIDE_SEED_PREFIX, question: "  " })
    ).toHaveLength(1)
  })

  it("drops a packet when the tab closes before drain", () => {
    parkSideOpen("conv-1-claude-9", {
      seed: SIDE_SEED_PREFIX,
      question: "",
    })
    discardSideOpen("conv-1-claude-9")
    expect(consumeSideOpen("conv-1-claude-9")).toBeNull()
  })

  it("notifies the parked tab id", () => {
    const listener = vi.fn()
    window.addEventListener(SIDE_OPEN_PARKED_EVENT, listener)
    parkSideOpen("conv-1-claude-9", {
      seed: SIDE_SEED_PREFIX,
      question: "q",
    })
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0][0] as CustomEvent<{ tabId: string }>
    expect(event.detail.tabId).toBe("conv-1-claude-9")
    window.removeEventListener(SIDE_OPEN_PARKED_EVENT, listener)
  })
})
