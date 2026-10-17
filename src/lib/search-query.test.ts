import { describe, expect, it } from "vitest"

import {
  DEFAULT_AGENT_TOKENS,
  parseSearchQuery,
  queryHasHan,
} from "./search-query"
import { ALL_AGENT_TYPES } from "./types"

describe("parseSearchQuery", () => {
  it("strips known modifiers", () => {
    expect(
      parseSearchQuery("agent:cursor in:all after:2026-10-01 ECONNRESET")
    ).toEqual({
      text: "ECONNRESET",
      agent: "cursor",
      scope: "all",
      after: "2026-10-01",
    })
  })

  it("keeps unknown agent token in text", () => {
    expect(parseSearchQuery("agent:nope hello").text).toBe("agent:nope hello")
    expect(parseSearchQuery("agent:nope hello").agent).toBe(null)
  })

  it("defaults to folder scope", () => {
    expect(parseSearchQuery("foo").scope).toBe("folder")
    expect(parseSearchQuery("foo")).toEqual({
      text: "foo",
      agent: null,
      scope: "folder",
      after: null,
    })
  })

  it("lets the last valid modifier win", () => {
    expect(
      parseSearchQuery(
        "agent:cursor agent:grok in:all in:folder after:2026-01-01 after:2026-02-02 hi"
      )
    ).toEqual({
      text: "hi",
      agent: "grok",
      scope: "folder",
      after: "2026-02-02",
    })
  })

  it("keeps invalid dates and unknown in: tokens in text", () => {
    expect(
      parseSearchQuery("after:2026-13-01 after:2026-02-31 in:work q")
    ).toEqual({
      text: "after:2026-13-01 after:2026-02-31 in:work q",
      agent: null,
      scope: "folder",
      after: null,
    })
    expect(
      parseSearchQuery("after:2026-10-01 after:nope in:all in:nope")
    ).toEqual({
      text: "after:nope in:nope",
      agent: null,
      scope: "all",
      after: "2026-10-01",
    })
  })

  it("rejects a non-leap day and accepts a leap day", () => {
    expect(parseSearchQuery("after:2025-02-29 ping").text).toBe(
      "after:2025-02-29 ping"
    )
    expect(parseSearchQuery("after:2025-02-29 ping").after).toBe(null)
    expect(parseSearchQuery("after:2024-02-29 ping").after).toBe("2024-02-29")
    expect(parseSearchQuery("after:2024-02-29 ping").text).toBe("ping")
  })

  it("maps the claude alias onto claude_code", () => {
    expect(parseSearchQuery("agent:claude hello")).toEqual({
      text: "hello",
      agent: "claude_code",
      scope: "folder",
      after: null,
    })
  })

  it("collapses whitespace and treats a blank query as empty", () => {
    expect(parseSearchQuery("  foo   bar  ")).toEqual({
      text: "foo bar",
      agent: null,
      scope: "folder",
      after: null,
    })
    expect(parseSearchQuery("   ")).toEqual({
      text: "",
      agent: null,
      scope: "folder",
      after: null,
    })
    expect(parseSearchQuery("")).toEqual({
      text: "",
      agent: null,
      scope: "folder",
      after: null,
    })
  })

  it("uses a caller-supplied agent set and keeps unknown tokens", () => {
    expect(
      parseSearchQuery("agent:custom agent:cursor hi", new Set(["custom"]))
    ).toEqual({
      text: "agent:cursor hi",
      agent: "custom",
      scope: "folder",
      after: null,
    })
  })

  it("accepts every builtin agent token and no extras", () => {
    for (const agent of ALL_AGENT_TYPES) {
      expect(parseSearchQuery(`agent:${agent} x`)).toMatchObject({
        text: "x",
        agent,
        scope: "folder",
        after: null,
      })
    }
    expect([...DEFAULT_AGENT_TOKENS].sort()).toEqual(
      [...ALL_AGENT_TYPES].sort()
    )
  })
})

describe("queryHasHan", () => {
  it("detects Han", () => {
    expect(queryHasHan("hello 世界")).toBe(true)
    expect(queryHasHan("ECONNRESET")).toBe(false)
    expect(queryHasHan("")).toBe(false)
    expect(queryHasHan("カタカナ")).toBe(false)
  })
})
