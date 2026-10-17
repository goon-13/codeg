import { describe, expect, it } from "vitest"
import { shouldShowAgentTypePicker } from "./agent-type-lock"

describe("shouldShowAgentTypePicker", () => {
  it("shows on an empty draft that can still pick an agent", () => {
    expect(
      shouldShowAgentTypePicker({
        canPick: true,
        isDraft: true,
        hasTranscript: false,
        hasStartedSend: false,
      })
    ).toBe(true)
  })

  it("hides once the draft has any transcript", () => {
    expect(
      shouldShowAgentTypePicker({
        canPick: true,
        isDraft: true,
        hasTranscript: true,
        hasStartedSend: false,
      })
    ).toBe(false)
  })

  it("hides once the first send has started, even before turns land", () => {
    expect(
      shouldShowAgentTypePicker({
        canPick: true,
        isDraft: true,
        hasTranscript: false,
        hasStartedSend: true,
      })
    ).toBe(false)
  })

  it("hides on a persisted conversation even if the picker callback exists", () => {
    expect(
      shouldShowAgentTypePicker({
        canPick: true,
        isDraft: false,
        hasTranscript: false,
        hasStartedSend: false,
      })
    ).toBe(false)
  })

  it("hides when there is no picker callback", () => {
    expect(
      shouldShowAgentTypePicker({
        canPick: false,
        isDraft: true,
        hasTranscript: false,
        hasStartedSend: false,
      })
    ).toBe(false)
  })
})
