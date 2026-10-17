import { describe, expect, it } from "vitest"
import {
  shouldRekeyNamedSession,
  wouldBindForeignSession,
} from "./session-bind-guard"

describe("wouldBindForeignSession", () => {
  it("is false when the session is unbound or the card has no row yet", () => {
    expect(wouldBindForeignSession(425, null)).toBe(false)
    expect(wouldBindForeignSession(null, 422)).toBe(false)
    expect(wouldBindForeignSession(425, 425)).toBe(false)
  })

  it("is true when the live session already belongs to another row", () => {
    expect(wouldBindForeignSession(425, 422)).toBe(true)
  })
})

describe("shouldRekeyNamedSession", () => {
  it("rekeys when the destination is the holder, or either side is unknown", () => {
    expect(shouldRekeyNamedSession(422, 422)).toBe(true)
    expect(shouldRekeyNamedSession(undefined, 422)).toBe(true)
    expect(shouldRekeyNamedSession(425, null)).toBe(true)
  })

  it("does not rekey a named session onto a different conversation", () => {
    expect(shouldRekeyNamedSession(425, 422)).toBe(false)
  })
})
