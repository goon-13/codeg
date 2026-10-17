import { describe, expect, it } from "vitest"

import { acpWaitingKind } from "./acp-waiting"

describe("acpWaitingKind", () => {
  it("returns null for missing connections", () => {
    expect(acpWaitingKind(null)).toBeNull()
    expect(acpWaitingKind(undefined)).toBeNull()
    expect(acpWaitingKind({})).toBeNull()
  })

  it("prefers question, then plan, then permission", () => {
    expect(acpWaitingKind({ pendingAskQuestion: { id: 1 } })).toBe("question")
    expect(acpWaitingKind({ pendingPlanApproval: { id: 1 } })).toBe("plan")
    expect(acpWaitingKind({ pendingPermission: { id: 1 } })).toBe("permission")
    expect(
      acpWaitingKind({
        pendingAskQuestion: {},
        pendingPlanApproval: {},
        pendingPermission: {},
      })
    ).toBe("question")
  })
})
