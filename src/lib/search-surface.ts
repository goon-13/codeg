export type ModFTarget = "thread" | "shelf-film" | "home-list" | "none"

const FIND_FIELD_SELECTOR =
  '[data-find-input], [data-testid="shelf-film-filter"], [data-testid="home-list-filter"]'

function isContentEditableField(el: HTMLElement): boolean {
  // jsdom leaves `isContentEditable` undefined and does not reflect the attribute.
  if (el.isContentEditable === true) return true
  const declared = el.contentEditable
  if (declared === "true" || declared === "plaintext-only") return true
  const attr = el.getAttribute("contenteditable")
  if (attr == null) return false
  return attr.toLowerCase() !== "false"
}

function isTypingField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA") return true
  return isContentEditableField(el)
}

export function isElementLive(el: Element | null): boolean {
  if (el == null) return false
  if (el.closest("[inert]") != null) return false
  if (el.closest(".conversation-tab-hidden") != null) return false
  return true
}

export function isOurFindField(el: EventTarget | null): boolean {
  if (!isTypingField(el)) return false
  return el.matches(FIND_FIELD_SELECTOR)
}

export function resolveModFTarget(input: {
  eventTarget: EventTarget | null
  threadOwnsFind: boolean
  shelfLive: boolean
  homeListLive: boolean
}): ModFTarget {
  if (isTypingField(input.eventTarget) && !isOurFindField(input.eventTarget)) {
    return "none"
  }
  if (input.threadOwnsFind) return "thread"
  if (input.shelfLive) return "shelf-film"
  if (input.homeListLive) return "home-list"
  return "none"
}
