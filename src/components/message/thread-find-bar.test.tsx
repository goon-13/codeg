import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import { ThreadFindBar } from "./thread-find-bar"
import enMessages from "@/i18n/messages/en.json"

function renderBar(
  extra: {
    query?: string
    current?: number
    count?: number
  } = {}
) {
  const onQuery = vi.fn()
  const onNext = vi.fn()
  const onPrev = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ThreadFindBar
        query={extra.query ?? "proxy"}
        current={extra.current ?? 0}
        count={extra.count ?? 2}
        onQuery={onQuery}
        onNext={onNext}
        onPrev={onPrev}
        onClose={onClose}
      />
    </NextIntlClientProvider>
  )
  return { ...view, onQuery, onNext, onPrev, onClose }
}

describe("ThreadFindBar", () => {
  it("shows n / N", () => {
    renderBar()
    expect(screen.getByText("1 / 2")).toBeTruthy()
  })

  it("Enter goes next; Shift+Enter goes prev", async () => {
    const user = userEvent.setup()
    const { onNext, onPrev } = renderBar()
    const input = screen.getByTestId("thread-find-input")
    await user.type(input, "{Enter}")
    expect(onNext).toHaveBeenCalled()
    await user.type(input, "{Shift>}{Enter}{/Shift}")
    expect(onPrev).toHaveBeenCalled()
  })

  it("Escape closes", async () => {
    const user = userEvent.setup()
    const { onClose } = renderBar()
    await user.type(screen.getByTestId("thread-find-input"), "{Escape}")
    expect(onClose).toHaveBeenCalled()
  })
})
