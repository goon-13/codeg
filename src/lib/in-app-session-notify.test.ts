import { beforeEach, describe, expect, it, vi } from "vitest"

const { toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn()
  ;(toastFn as unknown as { dismiss: ReturnType<typeof vi.fn> }).dismiss = vi.fn()
  return { toastFn }
})

vi.mock("sonner", () => ({
  toast: toastFn,
}))

import {
  decideSessionNotify,
  dismissSessionNotify,
  notifySession,
  resetInAppSessionNotifyForTests,
  SESSION_NOTIFY_INFO_DURATION_MS,
  sessionNotifyKind,
  sessionNotifyToastId,
  setSessionNotifyTabForeground,
  type SessionNotifyItem,
} from "./in-app-session-notify"
import {
  DEFAULT_IN_APP_SESSION_NOTIFY_PREFS,
  resetInAppSessionNotifyPrefsCacheForTests,
  saveInAppSessionNotifyPrefs,
} from "./in-app-session-notify-prefs"

const prefs = DEFAULT_IN_APP_SESSION_NOTIFY_PREFS
const none = { conversationId: null, contextKey: null }

const item = (over: Partial<SessionNotifyItem> = {}): SessionNotifyItem => ({
  eventId: "turn_complete",
  contextKey: "tab-1",
  conversationId: 1,
  folderId: 9,
  agentType: "codex",
  title: "One",
  body: "done",
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  resetInAppSessionNotifyPrefsCacheForTests()
  resetInAppSessionNotifyForTests()
  toastFn.mockClear()
  ;(toastFn as unknown as { dismiss: ReturnType<typeof vi.fn> }).dismiss.mockClear()
})

describe("sessionNotifyKind", () => {
  it("waiting vs info", () => {
    expect(sessionNotifyKind("question_request")).toBe("waiting")
    expect(sessionNotifyKind("plan_approval_request")).toBe("waiting")
    expect(sessionNotifyKind("permission_request")).toBe("waiting")
    expect(sessionNotifyKind("work_task")).toBe("waiting")
    expect(sessionNotifyKind("turn_complete")).toBe("info")
    expect(sessionNotifyKind("error")).toBe("info")
    expect(sessionNotifyKind("background_task")).toBe("info")
  })
})

describe("decideSessionNotify", () => {
  it("drops foreground session", () => {
    const d = decideSessionNotify(item(), [], {
      prefs,
      foreground: { conversationId: 1, contextKey: "tab-1" },
      suppressed: false,
    })
    expect(d).toEqual({ action: "drop", reason: "foreground" })
  })

  it("drops suppressed, disabled, event-off", () => {
    expect(
      decideSessionNotify(item(), [], {
        prefs,
        foreground: none,
        suppressed: true,
      })
    ).toEqual({ action: "drop", reason: "suppressed" })
    expect(
      decideSessionNotify(item(), [], {
        prefs: { ...prefs, enabled: false },
        foreground: none,
        suppressed: false,
      }).action
    ).toBe("drop")
    expect(
      decideSessionNotify(item(), [], {
        prefs: { ...prefs, events: { ...prefs.events, turn_complete: false } },
        foreground: none,
        suppressed: false,
      })
    ).toEqual({ action: "drop", reason: "event-off" })
  })

  it("info lasts 8s, waiting is Infinity", () => {
    const info = decideSessionNotify(item(), [], {
      prefs,
      foreground: none,
      suppressed: false,
    })
    expect(info).toMatchObject({
      action: "show",
      duration: SESSION_NOTIFY_INFO_DURATION_MS,
    })
    const wait = decideSessionNotify(
      item({ eventId: "question_request" }),
      [],
      { prefs, foreground: none, suppressed: false }
    )
    expect(wait).toMatchObject({
      action: "show",
      duration: Number.POSITIVE_INFINITY,
    })
  })

  it("second waiting session merges", () => {
    const a = item({
      eventId: "question_request",
      contextKey: "a",
      conversationId: 1,
      title: "A",
    })
    const b = item({
      eventId: "question_request",
      contextKey: "b",
      conversationId: 2,
      title: "B",
    })
    const d = decideSessionNotify(b, [a], {
      prefs,
      foreground: none,
      suppressed: false,
    })
    expect(d.action).toBe("merge")
    if (d.action === "merge") {
      expect(d.items.map((i) => i.contextKey)).toEqual(["a", "b"])
    }
  })

  it("same session same event updates rather than merge", () => {
    const a = item({ eventId: "question_request" })
    const again = item({ eventId: "question_request", body: "still" })
    const d = decideSessionNotify(again, [a], {
      prefs,
      foreground: none,
      suppressed: false,
    })
    expect(d.action).toBe("show")
  })

  it("toast id is stable per context+event", () => {
    expect(sessionNotifyToastId(item())).toBe(
      "codeg-session-notify:tab-1:turn_complete"
    )
  })
})

describe("notifySession", () => {
  const payload = { title: "One", body: "done", redactedTitle: "Codeg", redactedBody: "hidden" }

  it("raises a sonner toast for another session", () => {
    notifySession(item(), payload, { foreground: none })
    expect(toastFn).toHaveBeenCalledTimes(1)
    expect(toastFn.mock.calls[0][0]).toBe("One")
    expect(toastFn.mock.calls[0][1]).toMatchObject({
      id: "codeg-session-notify:tab-1:turn_complete",
      description: "done",
      duration: SESSION_NOTIFY_INFO_DURATION_MS,
      className: "session-notify-toast",
    })
  })

  it("does not toast the session in the foreground", () => {
    notifySession(item(), payload, {
      foreground: { conversationId: 1, contextKey: "tab-1" },
    })
    expect(toastFn).not.toHaveBeenCalled()
  })

  it("honors hideBody", () => {
    saveInAppSessionNotifyPrefs({
      ...DEFAULT_IN_APP_SESSION_NOTIFY_PREFS,
      hideBody: true,
    })
    resetInAppSessionNotifyPrefsCacheForTests()
    notifySession(item(), payload, { foreground: none })
    expect(toastFn.mock.calls[0][0]).toBe("Codeg")
    expect(toastFn.mock.calls[0][1].description).toBe("hidden")
  })

  it("merges two waiting toasts into one", () => {
    notifySession(
      item({ eventId: "question_request", contextKey: "a", conversationId: 1, title: "A" }),
      { title: "A", body: "ask" },
      { foreground: none }
    )
    notifySession(
      item({ eventId: "question_request", contextKey: "b", conversationId: 2, title: "B" }),
      { title: "B", body: "ask" },
      { foreground: none }
    )
    expect(toastFn).toHaveBeenCalledTimes(2)
    expect(toastFn.mock.calls[1][0]).toMatch(/2/)
    expect(toastFn.mock.calls[1][1].id).toBe("codeg-session-notify:batch:waiting")
    expect(toastFn.mock.calls[1][1].duration).toBe(Number.POSITIVE_INFINITY)
  })

  it("does not treat a keep-alive tab as foreground", () => {
    setSessionNotifyTabForeground({
      liveTabId: "tab-1",
      liveTabConversationId: 1,
    })
    document.body.innerHTML =
      '<div class="conversation-tab-hidden"><section data-testid="conversation-workspace"></section></div>'
    notifySession(item(), payload)
    expect(toastFn).toHaveBeenCalledTimes(1)
  })

  it("mutes the live tab when the conversation workspace is on screen", () => {
    setSessionNotifyTabForeground({
      liveTabId: "tab-1",
      liveTabConversationId: 1,
    })
    document.body.innerHTML =
      '<section data-testid="conversation-workspace"></section>'
    notifySession(item(), payload)
    expect(toastFn).not.toHaveBeenCalled()
  })
})

describe("dismissSessionNotify", () => {
  it("dismisses the matching toast", () => {
    notifySession(
      item({ eventId: "question_request" }),
      { title: "One", body: "ask" },
      { foreground: none }
    )
    dismissSessionNotify("tab-1", "question_request")
    expect(
      (toastFn as unknown as { dismiss: ReturnType<typeof vi.fn> }).dismiss
    ).toHaveBeenCalledWith("codeg-session-notify:tab-1:question_request")
  })
})
