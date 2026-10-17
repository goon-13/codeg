import { describe, expect, it } from "vitest"
import { parseMdItems, serializeMdFile } from "./md"

describe("parseMdItems", () => {
  it("round-trips a checkbox with session uri", () => {
    const { items, dirty } = parseMdItems(
      "# Waiting\n\n- [ ] Write spec `p_deadbeef` codeg://conversation/88\n",
      "waiting"
    )
    expect(dirty).toBe(false)
    expect(items[0]).toMatchObject({
      id: "p_deadbeef",
      title: "Write spec",
      conversationIds: [88],
      list: "waiting",
      done: false,
    })
  })

  it("keeps every work-task uri in order", () => {
    const { items } = parseMdItems(
      "- [ ] Spec `p_deadbeef` codeg://conversation/88 codeg://work-task/3 codeg://work-task/9\n",
      "waiting"
    )
    expect(items[0].workTaskIds).toEqual([3, 9])
    expect(items[0].conversationIds).toEqual([88])
  })

  it("assigns an id when missing", () => {
    const { items, dirty, text } = parseMdItems("- [ ] Naked title\n", "inbox")
    expect(dirty).toBe(true)
    expect(items[0].id).toMatch(/^p_[0-9a-f]{8}$/)
    expect(text).toContain(`\`${items[0].id}\``)
  })

  it("parses nested children, percent, progress, next, and theme", () => {
    const { items, dirty } = parseMdItems(
      [
        "# Next actions",
        "",
        "- [ ] Land GTD @2026-10-23 ~120m theme:gtd-compose `p_deadbeef`",
        "  - [x] Research",
        "  - [ ] Year pan",
        "  progress: 2026-10-16 design out",
        "  next: pass GC1",
        "",
      ].join("\n"),
      "next"
    )
    expect(dirty).toBe(false)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: "p_deadbeef",
      title: "Land GTD",
      date: "2026-10-23",
      estimateMinutes: 120,
      theme: "gtd-compose",
      percent: 50,
      next: "pass GC1",
      progress: ["2026-10-16 design out"],
    })
    expect(items[0].children).toEqual([
      { title: "Research", done: true },
      { title: "Year pan", done: false },
    ])
  })

  it("leaves percent null when there are no children", () => {
    const { items } = parseMdItems(
      "- [ ] No kids `p_deadbeef`\n",
      "next"
    )
    expect(items[0].percent).toBeNull()
    expect(items[0].children).toEqual([])
  })

  it("does not promote indented children to top-level items", () => {
    const { items } = parseMdItems(
      "- [ ] Parent `p_deadbeef`\n  - [ ] Nested\n",
      "next"
    )
    expect(items.map((item) => item.title)).toEqual(["Parent"])
  })
})

describe("serializeMdFile", () => {
  it("writes heading and done mark", () => {
    const text = serializeMdFile("Done", [
      {
        id: "p_aabbccdd",
        title: "Finished",
        list: "done",
        done: true,
        conversationIds: [],
        workTaskIds: [],
      },
    ])
    expect(text).toContain("# Done")
    expect(text).toContain("- [x] Finished `p_aabbccdd`")
  })

  it("writes children, progress, next, theme, date, and estimate", () => {
    const text = serializeMdFile("Next actions", [
      {
        id: "p_deadbeef",
        title: "Land GTD",
        list: "next",
        done: false,
        conversationIds: [],
        workTaskIds: [],
        date: "2026-10-23",
        estimateMinutes: 120,
        theme: "gtd-compose",
        children: [
          { title: "Research", done: true },
          { title: "Year pan", done: false },
        ],
        progress: ["2026-10-16 design out"],
        next: "pass GC1",
        percent: 50,
      },
    ])
    expect(text).toContain(
      "- [ ] Land GTD @2026-10-23 ~120m theme:gtd-compose `p_deadbeef`"
    )
    expect(text).toContain("  - [x] Research")
    expect(text).toContain("  - [ ] Year pan")
    expect(text).toContain("  progress: 2026-10-16 design out")
    expect(text).toContain("  next: pass GC1")
    expect(text).not.toContain("percent")
  })
})
