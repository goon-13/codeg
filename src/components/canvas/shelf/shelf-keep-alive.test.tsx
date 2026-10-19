import { useRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const mounts = vi.hoisted(() => ({ n: 0 }))

vi.mock("@/components/canvas/canvas-page", () => ({
  CanvasPage: function CanvasPageStub() {
    const counted = useRef(false)
    if (!counted.current) {
      counted.current = true
      mounts.n += 1
    }
    return <div data-testid="canvas-page-stub">canvas</div>
  },
  CanvasPageTitle: function CanvasPageTitleStub() {
    return <span>Session</span>
  },
}))

import {
  useWorkbenchRoute,
  WorkbenchRouteProvider,
} from "@/contexts/workbench-route-context"
import { ShelfKeepAlive } from "./shelf-keep-alive"

function Driver() {
  const { setRoute } = useWorkbenchRoute()
  return (
    <>
      <button type="button" onClick={() => setRoute("canvas")}>
        open-canvas
      </button>
      <button type="button" onClick={() => setRoute("conversations")}>
        open-chats
      </button>
      <ShelfKeepAlive />
    </>
  )
}

describe("ShelfKeepAlive", () => {
  it("keeps CanvasPage mounted after leaving session view", () => {
    mounts.n = 0
    render(
      <WorkbenchRouteProvider>
        <Driver />
      </WorkbenchRouteProvider>
    )
    expect(screen.queryByTestId("shelf-keep-alive")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "open-canvas" }))
    expect(screen.getByTestId("shelf-keep-alive")).toBeTruthy()
    expect(screen.getByTestId("canvas-page-stub")).toBeTruthy()
    expect(mounts.n).toBe(1)

    fireEvent.click(screen.getByRole("button", { name: "open-chats" }))
    expect(screen.getByTestId("shelf-keep-alive")).toBeTruthy()
    expect(screen.getByTestId("canvas-page-stub")).toBeTruthy()
    expect(mounts.n).toBe(1)
  })
})
