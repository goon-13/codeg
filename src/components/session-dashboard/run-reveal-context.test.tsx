import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import {
  RunRevealProvider,
  RunRevealSurface,
  useRunReveal,
} from "./run-reveal-context"

function Probe() {
  const reveal = useRunReveal()
  return (
    <span data-testid="probe">
      {reveal.toolsExpanded ? "tools-on" : "tools-off"}/
      {reveal.thinkingHidden ? "think-hid" : "think-show"}
    </span>
  )
}

describe("RunRevealSurface shortcuts", () => {
  it("toggles on window Alt+O / Alt+T when focus is inside the surface", async () => {
    const user = userEvent.setup()
    render(
      <RunRevealProvider>
        <RunRevealSurface>
          <button type="button">inside</button>
          <Probe />
        </RunRevealSurface>
      </RunRevealProvider>
    )
    await user.click(screen.getByRole("button", { name: "inside" }))
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "o",
          altKey: true,
          bubbles: true,
        })
      )
    })
    expect(screen.getByTestId("probe").textContent).toContain("tools-on")
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "t",
          altKey: true,
          bubbles: true,
        })
      )
    })
    expect(screen.getByTestId("probe").textContent).toContain("think-hid")
  })
})
