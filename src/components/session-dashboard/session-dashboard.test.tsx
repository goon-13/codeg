import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import { SessionDashboard } from "./session-dashboard"
import { RunRevealProvider } from "./run-reveal-context"
import type { DashboardSeg } from "./dashboard-model"

const copy = {
  Folder: {
    chat: {
      sessionDashboard: {
        stripAria: "Activity timeline",
        barAria: "Context window",
        legendRead: "Read",
        legendWrite: "Write",
        legendSearch: "Search",
        legendCommand: "Command",
        legendFetch: "Fetch",
        legendThink: "Think",
        legendTodo: "Todo",
        legendTask: "Task",
        legendError: "Error",
        legendText: "Text",
        legendOther: "Other",
        peekJumpUser: "Go to your prompt",
        peekJumpReply: "See reply",
        stickyAria: "Current round",
        toolsToggle: "Tool output",
        thinkingToggle: "Thinking",
      },
    },
  },
}

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={copy}>
      {ui}
    </NextIntlClientProvider>
  )
}

const segs: DashboardSeg[] = [
  { cat: "read", label: "读取", count: 2, size: 10, first: 2 },
  { cat: "text", label: "文本", count: 1, size: 4, first: 3 },
]

describe("SessionDashboard", () => {
  it("draws one square per count and jumps the first index", async () => {
    const onJump = vi.fn()
    const { container } = render(
      wrap(
        <SessionDashboard
          segs={segs}
          activeFirst={2}
          bar={{ used: 12400, max: 128000, percent: 9.7, warn: false }}
          onJump={onJump}
        />
      )
    )
    expect(container.querySelectorAll("[data-block-square]")).toHaveLength(3)
    expect(container.querySelector("[data-block-active]")).toBeTruthy()
    expect(container.querySelector("[data-context-bar]")).toBeTruthy()
    expect(screen.getAllByRole("button")[0]).toHaveAttribute(
      "title",
      "Read · 读取 ×2"
    )
    await userEvent.click(screen.getAllByRole("button")[0])
    expect(onJump).toHaveBeenCalledWith(2)
  })

  it("renders one data-round-seg per round when rounds are passed", () => {
    const { container } = render(
      wrap(
        <SessionDashboard
          segs={segs}
          rounds={[
            {
              id: "r-0-2",
              ordinal: 1,
              userThreadIndex: 0,
              assistantThreadIndex: 2,
              userLabel: "核验盘",
              segs: [segs[0]!],
            },
            {
              id: "r-4-5",
              ordinal: 2,
              userThreadIndex: 4,
              assistantThreadIndex: 5,
              userLabel: "加上顶栏",
              segs: [segs[1]!],
            },
          ]}
          bar={{ used: null, max: null, percent: null, warn: false }}
        />
      )
    )
    expect(container.querySelectorAll("[data-round-seg]")).toHaveLength(2)
  })

  it("hides the strip when there are no segs and no bar", () => {
    const { container } = render(
      wrap(
        <SessionDashboard
          segs={[]}
          bar={{ used: null, max: null, percent: null, warn: false }}
        />
      )
    )
    expect(container.querySelector("[data-session-dashboard]")).toBeNull()
  })

  it("exposes tool/thinking chips and reveals toolCallId on mosaic click", async () => {
    const onRevealTool = vi.fn()
    const toolSegs: DashboardSeg[] = [
      {
        cat: "read",
        label: "read",
        count: 1,
        size: 4,
        first: 2,
        toolCallId: "t1",
      },
    ]
    const { container } = render(
      wrap(
        <SessionDashboard
          segs={toolSegs}
          bar={{ used: null, max: null, percent: null, warn: false }}
          onRevealTool={onRevealTool}
        />
      )
    )
    expect(container.querySelector("[data-run-reveal-tools]")).toBeTruthy()
    expect(container.querySelector("[data-run-reveal-thinking]")).toBeTruthy()
    expect(container.querySelector("button[data-kind=read]")).toBeTruthy()
    await userEvent.click(
      container.querySelector("[data-block-square]")!.closest("button")!
    )
    expect(onRevealTool).toHaveBeenCalledWith("t1")
  })

  it("jumps to the first tool row when tools expand", async () => {
    const onJump = vi.fn()
    render(
      wrap(
        <RunRevealProvider>
          <SessionDashboard
            segs={[
              { cat: "text", label: "text", count: 1, size: 4, first: 0 },
              {
                cat: "read",
                label: "read",
                count: 1,
                size: 4,
                first: 4,
                toolCallId: "t1",
              },
            ]}
            bar={{ used: null, max: null, percent: null, warn: false }}
            onJump={onJump}
          />
        </RunRevealProvider>
      )
    )
    expect(onJump).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Tool output" }))
    expect(onJump).toHaveBeenCalledWith(4)
  })
})

describe("SessionDashboard source", () => {
  it("does not introduce vscode theme variables", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "session-dashboard.tsx"),
      "utf8"
    )
    expect(src).not.toContain(["--", "vscode-"].join(""))
  })
})

describe("MessageListView mount", () => {
  it("mounts SessionDashboard above MessageThread", () => {
    const src = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../message/message-list-view.tsx"
      ),
      "utf8"
    )
    expect(src).toContain("SessionDashboardHost")
    expect(src.indexOf("SessionDashboardHost")).toBeLessThan(
      src.indexOf("<MessageThread")
    )
    expect(src).toContain("roundsFromThread")
    expect(src).toContain("SessionRoundSticky")
    expect(src).toContain("onJumpAssistant")
    expect(src).toContain("RunRevealProvider")
  })
})
