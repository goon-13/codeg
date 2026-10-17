import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import zhCN from "@/i18n/messages/zh-CN.json"
import { emptyRun, validateGate } from "./protocol"
import { ThemeSeatShell } from "./theme-seat-shell"

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="zh-CN" messages={zhCN}>
      {ui}
    </NextIntlClientProvider>
  )
}

describe("ThemeSeatShell", () => {
  it("does not start when the theme is empty", () => {
    const state = emptyRun({
      conversationId: 1,
      folderId: 1,
      gate: {
        theme: "",
        protocol: "council",
        seats: [],
        maxRound: 3,
        budgetUsd: 2.4,
      },
    })
    const onPlay = vi.fn()
    wrap(
      <ThemeSeatShell
        state={state}
        onChange={vi.fn()}
        onPlay={onPlay}
        onHalt={vi.fn()}
        estimateLabel="约 ?"
        disabledPlayReason={validateGate(state.gate)}
      />
    )
    expect(screen.getByText("主题空。闸门挡住了这场。")).toBeTruthy()
    expect(screen.getByTestId("theme-seat-play")).toBeDisabled()
  })

  it("renders a rail tick per turn", () => {
    const state = emptyRun({
      conversationId: 1,
      folderId: 1,
      gate: {
        theme: "主题",
        protocol: "council",
        seats: [
          {
            id: "a",
            agentType: "grok",
            label: "A",
            rolePrompt: "一",
            stance: "none",
            chair: false,
          },
          {
            id: "b",
            agentType: "grok",
            label: "B",
            rolePrompt: "二",
            stance: "none",
            chair: false,
          },
          {
            id: "c",
            agentType: "grok",
            label: "主席",
            rolePrompt: "合",
            stance: "chair",
            chair: true,
          },
        ],
        maxRound: 3,
        budgetUsd: 2.4,
      },
    })
    state.turns.push({
      id: "t1",
      round: 1,
      seatId: "a",
      text: "正文",
      costUsd: 0.1,
      edges: [],
    })
    wrap(
      <ThemeSeatShell
        state={state}
        onChange={vi.fn()}
        onPlay={vi.fn()}
        onHalt={vi.fn()}
        estimateLabel="$1"
        disabledPlayReason={null}
      />
    )
    expect(screen.getByTestId("theme-seat-turn-t1")).toBeTruthy()
    expect(screen.getByText("正文")).toBeTruthy()
  })
})
