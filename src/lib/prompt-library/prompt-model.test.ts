import { describe, expect, it } from "vitest"
import {
  RESERVED_PROMPT_SLUGS,
  applyPromptValues,
  explicitSlug,
  isPromptListable,
  isReservedPromptSlug,
  latinSlug,
  parsePromptVars,
  planPromptFill,
  promptDisplayTitle,
  promptSearchText,
  promptSlug,
} from "./prompt-model"

describe("slug", () => {
  it("reads a trailing /slug and keeps the human title", () => {
    expect(explicitSlug("开会纪要 /meet")).toBe("meet")
    expect(promptDisplayTitle("开会纪要 /meet")).toBe("开会纪要")
    expect(promptSlug("开会纪要 /meet")).toBe("meet")
  })

  it("slugifies latin titles and leaves CJK without a slug", () => {
    expect(latinSlug("Fix the File!")).toBe("fix-the-file")
    expect(promptSlug("开会纪要")).toBeNull()
    expect(promptDisplayTitle("开会纪要")).toBe("开会纪要")
    expect(promptDisplayTitle("")).toBe("")
  })

  it("warns on reserved names", () => {
    expect([...RESERVED_PROMPT_SLUGS]).toEqual([
      "compact",
      "status",
      "fork",
      "model",
    ])
    expect(isReservedPromptSlug("compact")).toBe(true)
    expect(isReservedPromptSlug("meet")).toBe(false)
    expect(isReservedPromptSlug(null)).toBe(false)
  })
})

describe("vars", () => {
  it("parses text, enum, default, and de-duplicates by name", () => {
    expect(parsePromptVars("请改 {{文件}}")).toEqual([
      { name: "文件", enumOptions: null, defaultValue: null },
    ])
    expect(parsePromptVars("色 {{色|红,蓝}} 默认 {{名:Ada}} {{色}}")).toEqual([
      { name: "色", enumOptions: ["红", "蓝"], defaultValue: null },
      { name: "名", enumOptions: null, defaultValue: "Ada" },
    ])
  })

  it("picks fill mode by unique var count", () => {
    expect(planPromptFill("你好")).toEqual({ mode: "plain", text: "你好" })
    expect(planPromptFill("改 {{文件}}").mode).toBe("tab")
    expect(planPromptFill("{{a}} {{b}}").mode).toBe("tab")
    const form = planPromptFill("{{a}} {{b}} {{c}}")
    expect(form.mode).toBe("form")
    if (form.mode === "form") expect(form.vars).toHaveLength(3)
  })

  it("applies values to every occurrence", () => {
    expect(applyPromptValues("{{色|红,蓝}} 和 {{色}}", { 色: "红" })).toBe(
      "红 和 红"
    )
  })

  it("hides empty bodies from /", () => {
    expect(isPromptListable("")).toBe(false)
    expect(isPromptListable("  \n")).toBe(false)
    expect(isPromptListable("hi")).toBe(true)
    expect(promptSearchText("开会纪要 /meet", "把纪要发给{{对象}}")).toContain(
      "meet"
    )
  })
})
