import { describe, expect, it } from "vitest"
import {
  CLUSTER_TITLE_MAX_CHARS,
  SESSION_TITLE_MAX_CHARS,
  normalizeTitle,
} from "./normalize-title"

describe("normalizeTitle", () => {
  it("trims and keeps short text", () => {
    expect(normalizeTitle("  hello  ", 80)).toBe("hello")
  })

  it("returns null for empty or whitespace", () => {
    expect(normalizeTitle("", 80)).toBeNull()
    expect(normalizeTitle("   ", 80)).toBeNull()
  })

  it("slices by Unicode scalars at 80", () => {
    const raw = "a".repeat(81)
    expect(normalizeTitle(raw, SESSION_TITLE_MAX_CHARS)).toBe("a".repeat(80))
  })

  it("counts CJK as one scalar each", () => {
    const raw = "字".repeat(81)
    expect(normalizeTitle(raw, 80)).toBe("字".repeat(80))
    expect([...(normalizeTitle(raw, 80) as string)].length).toBe(80)
  })

  it("slices cluster titles at 64", () => {
    const raw = "题".repeat(80)
    const next = normalizeTitle(raw, CLUSTER_TITLE_MAX_CHARS)
    expect([...(next as string)].length).toBe(64)
  })

  it("does not use UTF-16 length for emoji", () => {
    const raw = "😀".repeat(81)
    expect([...(normalizeTitle(raw, 80) as string)].length).toBe(80)
  })
})
