import { describe, expect, it } from "vitest"

import {
  isConversationWorkspaceLive,
  isLiveElement,
  isSessionForeground,
  isShelfViewLive,
  readForegroundSession,
  resolveForegroundSession,
} from "./session-foreground"

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe("isLiveElement", () => {
  it("dead inside inert or conversation-tab-hidden", () => {
    const hidden = mount(
      `<div class="conversation-tab-hidden"><div id="c"></div></div>`
    )
    expect(isLiveElement(hidden.querySelector("#c"))).toBe(false)
    const inertWrap = mount(`<div inert><div id="c"></div></div>`)
    expect(isLiveElement(inertWrap.querySelector("#c"))).toBe(false)
    expect(isLiveElement(mount(`<div id="c"></div>`))).toBe(true)
    expect(isLiveElement(null)).toBe(false)
  })
})

describe("resolveForegroundSession", () => {
  it("expanded live shelf card wins", () => {
    expect(
      resolveForegroundSession({
        shelfViewLive: true,
        liveExpandedShelfConversationId: 42,
        liveTabConversationId: 7,
        liveTabId: "tab-7",
      })
    ).toEqual({ conversationId: 42, contextKey: "shelf:42" })
  })

  it("live shelf with no expanded card means no foreground session", () => {
    expect(
      resolveForegroundSession({
        shelfViewLive: true,
        liveExpandedShelfConversationId: null,
        liveTabConversationId: 7,
        liveTabId: "tab-7",
      })
    ).toEqual({ conversationId: null, contextKey: null })
  })

  it("falls back to live tab when shelf is not live", () => {
    expect(
      resolveForegroundSession({
        shelfViewLive: false,
        liveExpandedShelfConversationId: null,
        liveTabConversationId: 7,
        liveTabId: "tab-7",
      })
    ).toEqual({ conversationId: 7, contextKey: "tab-7" })
  })
})

describe("isSessionForeground", () => {
  it("mutes matching conversation or contextKey", () => {
    const fg = { conversationId: 42, contextKey: "shelf:42" }
    expect(
      isSessionForeground({ conversationId: 42, contextKey: "tab-x" }, fg)
    ).toBe(true)
    expect(
      isSessionForeground({ conversationId: null, contextKey: "shelf:42" }, fg)
    ).toBe(true)
    expect(
      isSessionForeground({ conversationId: 7, contextKey: "tab-7" }, fg)
    ).toBe(false)
  })
})

describe("readForegroundSession", () => {
  it("sees live expanded shelf card only", () => {
    mount(`
      <div data-testid="shelf-view">
        <div data-shelf-card="42" data-shelf-expanded></div>
      </div>`)
    expect(readForegroundSession(document)).toEqual({
      conversationId: 42,
      contextKey: "shelf:42",
    })
  })

  it("ignores hidden keep-alive shelf", () => {
    mount(`
      <div class="conversation-tab-hidden">
        <div data-testid="shelf-view">
          <div data-shelf-card="42" data-shelf-expanded></div>
        </div>
      </div>`)
    expect(readForegroundSession(document)).toEqual({
      conversationId: null,
      contextKey: null,
    })
  })
})

describe("isShelfViewLive", () => {
  it("true only when shelf-view is on screen", () => {
    mount(`<div data-testid="shelf-view"></div>`)
    expect(isShelfViewLive(document)).toBe(true)
    mount(`<div class="conversation-tab-hidden"><div data-testid="shelf-view"></div></div>`)
    expect(isShelfViewLive(document)).toBe(false)
  })
})

describe("isConversationWorkspaceLive", () => {
  it("true only when the conversation workspace is on screen", () => {
    mount(`<section data-testid="conversation-workspace"></section>`)
    expect(isConversationWorkspaceLive(document)).toBe(true)
    mount(
      `<div class="conversation-tab-hidden"><section data-testid="conversation-workspace"></section></div>`
    )
    expect(isConversationWorkspaceLive(document)).toBe(false)
  })
})
