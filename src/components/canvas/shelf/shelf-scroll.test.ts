import { describe, expect, it } from "vitest"
import { horizontalWheelDelta, jumpButtonsFromMetrics } from "./shelf-scroll"

describe("jumpButtonsFromMetrics", () => {
  it("hides both buttons when the shelf fits in one screen", () => {
    expect(
      jumpButtonsFromMetrics({
        scrollTop: 0,
        clientHeight: 800,
        scrollHeight: 800,
      })
    ).toEqual({ showTop: false, showBottom: false })
  })

  it("shows only jump-to-bottom at the top of a long shelf", () => {
    expect(
      jumpButtonsFromMetrics({
        scrollTop: 0,
        clientHeight: 800,
        scrollHeight: 2400,
      })
    ).toEqual({ showTop: false, showBottom: true })
  })

  it("shows both buttons in the middle, so top and bottom stay independently reachable", () => {
    expect(
      jumpButtonsFromMetrics({
        scrollTop: 800,
        clientHeight: 800,
        scrollHeight: 2400,
      })
    ).toEqual({ showTop: true, showBottom: true })
  })

  it("shows only jump-to-top at the bottom of a long shelf", () => {
    expect(
      jumpButtonsFromMetrics({
        scrollTop: 1600,
        clientHeight: 800,
        scrollHeight: 2400,
      })
    ).toEqual({ showTop: true, showBottom: false })
  })
})

describe("horizontalWheelDelta", () => {
  const room = {
    scrollLeft: 40,
    scrollWidth: 2000,
    clientWidth: 400,
    nestedVerticalScrollable: false,
  }

  it("turns a vertical mouse wheel into a horizontal delta", () => {
    expect(horizontalWheelDelta({ ...room, deltaX: 0, deltaY: 80 })).toBe(80)
    expect(horizontalWheelDelta({ ...room, deltaX: 0, deltaY: -50 })).toBe(-50)
  })

  it("leaves trackpad horizontal swipes to native overflow-x", () => {
    expect(horizontalWheelDelta({ ...room, deltaX: 60, deltaY: 10 })).toBeNull()
  })

  it("does not steal the wheel from an expanded conversation transcript", () => {
    expect(
      horizontalWheelDelta({
        ...room,
        deltaX: 0,
        deltaY: 80,
        nestedVerticalScrollable: true,
      })
    ).toBeNull()
  })

  it("does not hijack the page when the row cannot scroll sideways", () => {
    expect(
      horizontalWheelDelta({
        ...room,
        scrollWidth: 400,
        clientWidth: 400,
        deltaX: 0,
        deltaY: 80,
      })
    ).toBeNull()
  })

  it("lets the page take over once the row is already at a horizontal edge", () => {
    expect(
      horizontalWheelDelta({
        ...room,
        scrollLeft: 0,
        deltaX: 0,
        deltaY: -40,
      })
    ).toBeNull()
    expect(
      horizontalWheelDelta({
        ...room,
        scrollLeft: 1600,
        deltaX: 0,
        deltaY: 40,
      })
    ).toBeNull()
  })
})
