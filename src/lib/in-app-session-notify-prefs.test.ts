import { beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_IN_APP_SESSION_NOTIFY_PREFS,
  loadInAppSessionNotifyPrefs,
  parseInAppSessionNotifyPrefs,
  resetInAppSessionNotifyPrefsCacheForTests,
  saveInAppSessionNotifyPrefs,
  SESSION_NOTIFY_EVENT_IDS,
} from "./in-app-session-notify-prefs"

const STORAGE_KEY = "settings:in-app-session-notify:v1"

beforeEach(() => {
  localStorage.clear()
  resetInAppSessionNotifyPrefsCacheForTests()
})

describe("defaults", () => {
  it("defaults enabled with every event on", () => {
    expect(DEFAULT_IN_APP_SESSION_NOTIFY_PREFS.enabled).toBe(true)
    expect(DEFAULT_IN_APP_SESSION_NOTIFY_PREFS.hideBody).toBe(false)
    for (const id of SESSION_NOTIFY_EVENT_IDS) {
      expect(DEFAULT_IN_APP_SESSION_NOTIFY_PREFS.events[id]).toBe(true)
    }
    expect(SESSION_NOTIFY_EVENT_IDS).toContain("plan_approval_request")
  })
})

describe("parseInAppSessionNotifyPrefs", () => {
  it("upgrades a blob missing plan_approval_request to true", () => {
    const parsed = parseInAppSessionNotifyPrefs({
      enabled: true,
      hideBody: false,
      events: { turn_complete: false },
    })
    expect(parsed.events.turn_complete).toBe(false)
    expect(parsed.events.plan_approval_request).toBe(true)
  })

  it("does not alias the default events object", () => {
    const parsed = parseInAppSessionNotifyPrefs(undefined)
    parsed.events.error = false
    expect(DEFAULT_IN_APP_SESSION_NOTIFY_PREFS.events.error).toBe(true)
  })

  it("falls back to the defaults for a non-object", () => {
    expect(parseInAppSessionNotifyPrefs(null)).toEqual(
      DEFAULT_IN_APP_SESSION_NOTIFY_PREFS
    )
  })
})

describe("storage", () => {
  it("round-trips through localStorage", () => {
    saveInAppSessionNotifyPrefs({
      ...DEFAULT_IN_APP_SESSION_NOTIFY_PREFS,
      enabled: false,
    })
    resetInAppSessionNotifyPrefsCacheForTests()
    expect(loadInAppSessionNotifyPrefs().enabled).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"enabled":false')
  })
})
