import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"
import enMessages from "@/i18n/messages/en.json"
import { CanvasPage, CanvasPageTitle } from "./canvas-page"

/**
 * Breaks if the canvas route stops defaulting to the shelf, if the title
 * toggle fails to move both the page body and the breadcrumb, or if an open
 * board still draws its breadcrumb while the shelf is showing.
 */
const h = vi.hoisted(() => ({
  state: {
    activeBoardId: null as number | null,
    boards: [] as { board: { id: number; name?: string } }[],
    closedNotice: null as number | null,
    closeMissingBoard: vi.fn(),
    acknowledgeClosedNotice: vi.fn(),
    closeBoard: vi.fn(),
    handleBoardChanged: vi.fn(),
    refetch: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("@/lib/api", () => ({
  canvasListBoards: vi.fn(),
  canvasCreateBoard: vi.fn(),
  canvasUpdateBoard: vi.fn(),
  canvasDeleteBoard: vi.fn(),
  canvasListNodes: vi.fn(),
}))
vi.mock("@/lib/platform", () => ({
  subscribe: vi.fn().mockResolvedValue(() => {}),
  onTransportReconnect: vi.fn(() => () => {}),
}))
vi.mock("@/contexts/workbench-route-context", () => ({
  useWorkbenchRoute: () => ({ openConversations: vi.fn() }),
}))
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}))
vi.mock("./canvas-view", () => ({
  default: () => <div data-testid="board-view" />,
}))
vi.mock("./canvas-board-list", () => ({
  CanvasBoardList: () => <div data-testid="board-list" />,
}))
vi.mock("./shelf/shelf-view", () => ({
  ShelfView: () => <div data-testid="shelf-view" />,
}))
vi.mock("@/stores/canvas-boards-store", () => ({
  useCanvasBoardsStore: Object.assign(
    (selector: (s: typeof h.state) => unknown) => selector(h.state),
    { getState: () => h.state }
  ),
}))

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <CanvasPageTitle />
      <CanvasPage />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  h.state.activeBoardId = null
  h.state.boards = []
  h.state.closedNotice = null
})

describe("CanvasPage shelf layout", () => {
  it("defaults to the shelf and switches to the board list and back", async () => {
    renderPage()

    expect(await screen.findByTestId("shelf-view")).toBeTruthy()
    expect(screen.queryByTestId("board-list")).toBeNull()
    expect(screen.queryByTestId("board-view")).toBeNull()

    const shelf = screen.getByRole("button", { name: "Fixed" })
    const board = screen.getByRole("button", { name: "Infinite Canvas" })
    expect(shelf).toHaveAttribute("aria-pressed", "true")
    expect(board).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByText("Shelf")).toBeTruthy()
    expect(shelf).toHaveAttribute("data-variant", "ghost")
    expect(shelf).toHaveAttribute("data-size", "xs")
    expect(board).toHaveAttribute("data-variant", "ghost")
    expect(board).toHaveAttribute("data-size", "xs")

    await userEvent.click(board)

    expect(await screen.findByTestId("board-list")).toBeTruthy()
    expect(screen.queryByTestId("shelf-view")).toBeNull()
    expect(board).toHaveAttribute("aria-pressed", "true")
    expect(shelf).toHaveAttribute("aria-pressed", "false")
    expect(localStorage.getItem("workspace:canvas-layout")).toBe(
      JSON.stringify("board")
    )

    await userEvent.click(shelf)

    expect(await screen.findByTestId("shelf-view")).toBeTruthy()
    expect(screen.queryByTestId("board-list")).toBeNull()
    expect(shelf).toHaveAttribute("aria-pressed", "true")
    expect(localStorage.getItem("workspace:canvas-layout")).toBe(
      JSON.stringify("shelf")
    )
  })

  it("hides the board breadcrumb on the shelf and shows it with the open board", async () => {
    h.state.activeBoardId = 4
    renderPage()

    expect(await screen.findByTestId("shelf-view")).toBeTruthy()
    expect(
      screen.getByRole("heading", { name: "Session view" })
    ).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Back to all canvases" })
    ).toBeNull()
    expect(screen.queryByRole("button", { name: "Canvas options" })).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Infinite Canvas" }))

    expect(await screen.findByTestId("board-view")).toBeTruthy()
    expect(screen.queryByTestId("board-list")).toBeNull()
    expect(screen.queryByTestId("shelf-view")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Back to all canvases" })
    ).toBeTruthy()
    expect(
      screen.queryByRole("heading", { name: "Session view" })
    ).toBeNull()
  })
})
