import { useRef, useState, type ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import enMessages from "@/i18n/messages/en.json"
import { sameHitList, ThreadFindRoot } from "./message-list-view"
import { ThreadFindBar } from "./thread-find-bar"

function Harness({
  hidden = false,
  inert = false,
  onBubble,
  children,
}: {
  hidden?: boolean
  inert?: boolean
  onBubble?: () => void
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  return (
    <div
      className={hidden ? "conversation-tab-hidden" : undefined}
      inert={inert ? true : undefined}
      onKeyDown={onBubble}
    >
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ThreadFindRoot
          isActive
          open={open}
          onModF={() => setOpen(true)}
          onEscape={() => setOpen(false)}
          boxRef={boxRef}
          bar={
            <ThreadFindBar
              query=""
              current={0}
              count={0}
              onQuery={() => {}}
              onNext={() => {}}
              onPrev={() => {}}
              onClose={() => setOpen(false)}
            />
          }
        >
          {children ?? <p>transcript</p>}
        </ThreadFindRoot>
      </NextIntlClientProvider>
    </div>
  )
}

function dispatchModF(target: HTMLElement) {
  const event = new KeyboardEvent("keydown", {
    key: "f",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  const stopPropagation = vi.spyOn(event, "stopPropagation")
  act(() => {
    target.dispatchEvent(event)
  })
  return { event, stopPropagation }
}

describe("MessageListView thread find", () => {
  it("Mod+F on a live list root prevents default, stops propagation, and shows the bar", () => {
    const onBubble = vi.fn()
    render(<Harness onBubble={onBubble} />)
    const root = screen.getByTestId("thread-find-root")
    const { event, stopPropagation } = dispatchModF(root)
    expect(event.defaultPrevented).toBe(true)
    expect(stopPropagation).toHaveBeenCalled()
    expect(onBubble).not.toHaveBeenCalled()
    expect(screen.getByTestId("thread-find-bar")).toBeTruthy()
  })

  it("Mod+F inside a hidden keep-alive does not show the bar or stop propagation", () => {
    const onBubble = vi.fn()
    render(<Harness hidden onBubble={onBubble} />)
    const root = screen.getByTestId("thread-find-root")
    const { event, stopPropagation } = dispatchModF(root)
    expect(event.defaultPrevented).toBe(false)
    expect(stopPropagation).not.toHaveBeenCalled()
    expect(onBubble).toHaveBeenCalled()
    expect(screen.queryByTestId("thread-find-bar")).toBeNull()
  })

  it("Mod+F inside an inert keep-alive does not show the bar or stop propagation", () => {
    const onBubble = vi.fn()
    render(<Harness inert onBubble={onBubble} />)
    const root = screen.getByTestId("thread-find-root")
    const { event, stopPropagation } = dispatchModF(root)
    expect(event.defaultPrevented).toBe(false)
    expect(stopPropagation).not.toHaveBeenCalled()
    expect(onBubble).toHaveBeenCalled()
    expect(screen.queryByTestId("thread-find-bar")).toBeNull()
  })

  it("mousedown inside the scrollport leaves focus on that port", () => {
    render(
      <Harness>
        <div className="chat-scroll-port" tabIndex={0} data-testid="scrollport">
          transcript
        </div>
      </Harness>
    )
    const port = screen.getByTestId("scrollport")
    port.focus()
    fireEvent.mouseDown(port)
    expect(document.activeElement).toBe(port)
  })

  it("mousedown on a button or link does not focus the list root", () => {
    render(
      <Harness>
        <button type="button" data-testid="action">
          Action
        </button>
        <a href="#jump" data-testid="link">
          Jump
        </a>
      </Harness>
    )
    const action = screen.getByTestId("action")
    action.focus()
    fireEvent.mouseDown(action)
    expect(document.activeElement).toBe(action)

    const link = screen.getByTestId("link")
    link.focus()
    fireEvent.mouseDown(link)
    expect(document.activeElement).toBe(link)
  })
})

describe("sameHitList", () => {
  it("treats a longer haystack at the same indexes as the same list", () => {
    const prev = [
      { index: 0, haystack: "proxy" },
      { index: 2, haystack: "proxy died" },
    ]
    const grown = [
      { index: 0, haystack: "proxy still streaming" },
      { index: 2, haystack: "proxy died" },
    ]
    expect(sameHitList(prev, grown)).toBe(true)
    expect(sameHitList(prev, prev)).toBe(true)
  })

  it("is false when the index sequence changes", () => {
    const prev = [{ index: 0, haystack: "proxy" }]
    expect(
      sameHitList(prev, [
        { index: 0, haystack: "proxy" },
        { index: 4, haystack: "proxy" },
      ])
    ).toBe(false)
    expect(sameHitList(prev, [{ index: 3, haystack: "proxy" }])).toBe(false)
    expect(sameHitList(prev, [])).toBe(false)
  })
})
