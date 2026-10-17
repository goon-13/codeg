import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ThemeSeatRecipeChip } from "./recipe-chip"

const labels = {
  name: "这场",
  group: "主题席",
  code: "编码",
  council: "议会",
  debate: "辩论",
  relay: "接力",
}

describe("ThemeSeatRecipeChip", () => {
  it("shows the current recipe on the trigger", () => {
    render(
      <ThemeSeatRecipeChip value="code" onChange={vi.fn()} labels={labels} />
    )
    const trigger = screen.getByRole("button", { name: "这场: 编码" })
    expect(trigger.getAttribute("data-theme-recipe")).toBe("code")
  })

  it("emits debate from the menu", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ThemeSeatRecipeChip value="code" onChange={onChange} labels={labels} />
    )
    await user.click(screen.getByRole("button", { name: "这场: 编码" }))
    await user.click(screen.getByText("辩论"))
    expect(onChange).toHaveBeenCalledWith("debate")
  })
})
