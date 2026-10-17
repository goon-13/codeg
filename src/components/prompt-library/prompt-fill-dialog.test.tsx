import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { PromptFillDialog } from "./prompt-fill-dialog"

const vars = [
  { name: "日期", enumOptions: null, defaultValue: "今天" },
  { name: "色", enumOptions: ["红", "蓝"], defaultValue: null },
  { name: "对象", enumOptions: null, defaultValue: null },
]

describe("PromptFillDialog", () => {
  it("renders one control per var and confirms values", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <PromptFillDialog
        open
        title="开会纪要"
        vars={vars}
        labels={{ dialogTitle: "Fill", insert: "Insert", cancel: "Cancel" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByLabelText("日期")).toHaveValue("今天")
    await user.clear(screen.getByLabelText("日期"))
    await user.type(screen.getByLabelText("日期"), "周一")
    await user.click(screen.getByRole("button", { name: "Insert" }))
    expect(onConfirm).toHaveBeenCalledWith({
      日期: "周一",
      色: "红",
      对象: "",
    })
  })

  it("cancel does not confirm", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <PromptFillDialog
        open
        title="开会纪要"
        vars={vars}
        labels={{ dialogTitle: "Fill", insert: "Insert", cancel: "Cancel" }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })
})
