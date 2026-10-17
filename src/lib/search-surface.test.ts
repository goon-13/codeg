import { afterEach, describe, expect, it } from "vitest"

import {
  isElementLive,
  isOurFindField,
  resolveModFTarget,
} from "./search-surface"

const mounted: HTMLElement[] = []

function mount(html: string): HTMLElement {
  const wrap = document.createElement("div")
  wrap.innerHTML = html
  document.body.appendChild(wrap)
  mounted.push(wrap)
  return wrap
}

afterEach(() => {
  for (const node of mounted) node.remove()
  mounted.length = 0
})

describe("isElementLive", () => {
  it("is false for null, inert, and conversation-tab-hidden", () => {
    expect(isElementLive(null)).toBe(false)

    const hidden = mount(
      `<div class="conversation-tab-hidden"><div id="c"></div></div>`
    )
    expect(isElementLive(hidden.querySelector("#c"))).toBe(false)

    const inertWrap = mount(`<div inert><div id="c"></div></div>`)
    expect(isElementLive(inertWrap.querySelector("#c"))).toBe(false)

    const live = mount(`<div id="c"></div>`)
    expect(isElementLive(live.querySelector("#c"))).toBe(true)
  })
})

describe("resolveModFTarget", () => {
  it("composer typing does not steal Mod+F", () => {
    const box = document.createElement("textarea")
    expect(isOurFindField(box)).toBe(false)
    expect(
      resolveModFTarget({
        eventTarget: box,
        threadOwnsFind: false,
        shelfLive: true,
        homeListLive: true,
      })
    ).toBe("none")

    const editable = document.createElement("div")
    editable.contentEditable = "true"
    expect(
      resolveModFTarget({
        eventTarget: editable,
        threadOwnsFind: true,
        shelfLive: true,
        homeListLive: true,
      })
    ).toBe("none")
  })

  it("our filter input still routes to shelf", () => {
    const box = document.createElement("input")
    box.setAttribute("data-testid", "shelf-film-filter")
    expect(isOurFindField(box)).toBe(true)
    expect(
      resolveModFTarget({
        eventTarget: box,
        threadOwnsFind: false,
        shelfLive: true,
        homeListLive: false,
      })
    ).toBe("shelf-film")

    const find = document.createElement("input")
    find.setAttribute("data-find-input", "")
    expect(isOurFindField(find)).toBe(true)

    const home = document.createElement("input")
    home.setAttribute("data-testid", "home-list-filter")
    expect(isOurFindField(home)).toBe(true)

    const decoy = document.createElement("div")
    decoy.setAttribute("data-testid", "shelf-film-filter")
    expect(isOurFindField(decoy)).toBe(false)
  })

  it("thread wins over shelf", () => {
    expect(
      resolveModFTarget({
        eventTarget: null,
        threadOwnsFind: true,
        shelfLive: true,
        homeListLive: true,
      })
    ).toBe("thread")
  })

  it("home list wins only when the shelf is not live", () => {
    expect(
      resolveModFTarget({
        eventTarget: null,
        threadOwnsFind: false,
        shelfLive: false,
        homeListLive: true,
      })
    ).toBe("home-list")
    expect(
      resolveModFTarget({
        eventTarget: null,
        threadOwnsFind: false,
        shelfLive: false,
        homeListLive: false,
      })
    ).toBe("none")
  })
})
