import { describe, expect, it } from "vitest"
import {
  hermesDispatcherLaunch,
  hermesProfileLaunch,
} from "./hermes-profile-launch"

describe("hermesProfileLaunch", () => {
  it("points HERMES_HOME at the named profile and only passes acp", () => {
    const spec = hermesProfileLaunch("homeops", "/home/dev/.hermes")
    expect(spec).toEqual({
      cmd: "hermes",
      args: ["acp"],
      env: { HERMES_HOME: "/home/dev/.hermes/profiles/homeops" },
    })
    expect(spec.args).not.toContain("-p")
  })

  it("rejects path-like profile ids", () => {
    expect(() => hermesProfileLaunch("../x", "/home/dev/.hermes")).toThrow(
      /profile id/i
    )
  })
})

describe("hermesDispatcherLaunch", () => {
  it("does not set HERMES_HOME and does not pass -p", () => {
    expect(hermesDispatcherLaunch("/home/dev/.hermes")).toEqual({
      cmd: "hermes",
      args: ["acp"],
      env: {},
    })
  })
})
