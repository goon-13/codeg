import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

const notifySession = vi.hoisted(() => vi.fn())

vi.mock("@/lib/in-app-session-notify", () => ({
  notifySession,
}))

import { InAppSessionNotifySettingsSection } from "./in-app-session-notify-settings"
import enMessages from "@/i18n/messages/en.json"
import {
  DEFAULT_IN_APP_SESSION_NOTIFY_PREFS,
  loadInAppSessionNotifyPrefs,
  resetInAppSessionNotifyPrefsCacheForTests,
} from "@/lib/in-app-session-notify-prefs"

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <InAppSessionNotifySettingsSection />
    </NextIntlClientProvider>
  )
}

function expandSection() {
  fireEvent.click(screen.getByRole("button", { name: "In-app session alerts" }))
}

beforeEach(() => {
  localStorage.clear()
  resetInAppSessionNotifyPrefsCacheForTests()
  notifySession.mockClear()
})

describe("InAppSessionNotifySettingsSection", () => {
  it("starts enabled", () => {
    renderSection()
    expect(
      screen.getByRole("switch", { name: /in-app session alerts/i })
    ).toBeChecked()
  })

  it("arrives folded", () => {
    renderSection()
    expect(screen.getAllByRole("switch")).toHaveLength(1)
    expect(screen.queryByText("Turn Complete")).not.toBeInTheDocument()
  })

  it("reveals every event once unfolded including plan approval", () => {
    renderSection()
    expandSection()
    for (const label of [
      "Turn Complete",
      "Permission Request",
      "Agent Question",
      "Agent Error",
      "Background task",
      "Work task",
      "Plan approval",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it("send a test raises notifySession", () => {
    renderSection()
    expandSection()
    fireEvent.click(screen.getByRole("button", { name: /send a test/i }))
    expect(notifySession).toHaveBeenCalled()
  })

  it("turning the master switch off writes storage", () => {
    renderSection()
    fireEvent.click(
      screen.getByRole("switch", { name: /in-app session alerts/i })
    )
    expect(loadInAppSessionNotifyPrefs().enabled).toBe(false)
    expect(DEFAULT_IN_APP_SESSION_NOTIFY_PREFS.enabled).toBe(true)
  })
})
