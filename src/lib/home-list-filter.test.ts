import { describe, expect, it } from "vitest"

import { filterHomeListConversations } from "./home-list-filter"

const untitled = "Untitled conversation"

describe("filterHomeListConversations", () => {
  const convs = [
    { id: 1, title: "Fix the Login bug" },
    { id: 2, title: "[README.md](file:///tmp/README.md)" },
    { id: 3, title: null },
    { id: 4, title: "" },
  ]

  it("returns the same array when the query is blank or whitespace", () => {
    expect(filterHomeListConversations(convs, "", untitled)).toBe(convs)
    expect(filterHomeListConversations(convs, "   ", untitled)).toBe(convs)
    expect(filterHomeListConversations(convs, "\n\t", untitled)).toBe(convs)
  })

  it("matches the formatted title, case-insensitive", () => {
    expect(
      filterHomeListConversations(convs, "login", untitled).map((c) => c.id)
    ).toEqual([1])
    expect(
      filterHomeListConversations(convs, "  README.md  ", untitled).map(
        (c) => c.id
      )
    ).toEqual([2])
  })

  it("does not match a reference uri that the display title folds away", () => {
    expect(filterHomeListConversations(convs, "file://", untitled)).toEqual([])
  })

  it("matches an empty title against the untitled label", () => {
    expect(
      filterHomeListConversations(convs, "untitled", untitled).map((c) => c.id)
    ).toEqual([3, 4])
  })

  it("returns an empty array when nothing matches", () => {
    expect(filterHomeListConversations(convs, "nope", untitled)).toEqual([])
  })
})
