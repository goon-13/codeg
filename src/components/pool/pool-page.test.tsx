import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import { PoolColumns, TrackingBlock } from "./pool-page"
import type { PlanItem } from "@/lib/plan/types"
import type { TrackRow } from "./track-model"

const copy = {
  Plan: {
    inbox: "Inbox",
    next: "Next",
    waiting: "Waiting",
    done: "Done",
    complete: "Complete",
    attachSession: "Attach",
    waitingYou: "Needs you",
    running: "Running",
    tracking: "Still open",
    openTasks: "Open tasks",
    pickSession: "Pick a session",
    newAttempt: "New attempt",
    newAttemptHint: "Attach a session first",
    attachTask: "Attach task",
    pickTask: "Pick a task",
    taskChip: "Task {id}",
    percent: "{n}%",
    progress: "Progress",
    nextStep: "Next step",
    themeGather: "Theme",
  },
}

const items: PlanItem[] = [
  {
    id: "p_deadbeef",
    title: "还没完的事",
    list: "waiting",
    done: false,
    conversationIds: [88],
    workTaskIds: [],
  },
]

const trackRows: TrackRow[] = [
  {
    key: "pool:p_deadbeef",
    title: "还没完的事",
    kind: "pool",
    poolId: "p_deadbeef",
    sessions: [{ id: 88, folderId: 1, agentType: "grok", status: "pending_review" }],
    attempts: [
      {
        key: "session:88",
        kind: "session",
        conversationId: 88,
        folderId: 1,
        agentType: "grok",
        status: "pending_review",
        lamp: "waitingYou",
      },
      {
        key: "worktask:3",
        kind: "worktask",
        workTaskId: 3,
        folderId: 1,
        lamp: "waitingYou",
      },
    ],
    lamp: "waitingYou",
  },
  {
    key: "wt:3",
    title: "官方卡",
    kind: "worktask",
    workTaskId: 3,
    sessions: [{ id: 9, folderId: 1, agentType: "grok" }],
    attempts: [
      {
        key: "worktask:3",
        kind: "worktask",
        workTaskId: 3,
        conversationId: 9,
        folderId: 1,
        agentType: "grok",
        lamp: "running",
      },
    ],
    lamp: "running",
  },
]

describe("TrackingBlock", () => {
  it("opens a session chip and does not complete worktask rows", async () => {
    const onComplete = vi.fn()
    const onOpenSession = vi.fn()
    const onOpenTasks = vi.fn()
    const onNewAttempt = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={copy}>
        <TrackingBlock
          rows={trackRows}
          onComplete={onComplete}
          onOpenSession={onOpenSession}
          onOpenTasks={onOpenTasks}
          onNewAttempt={onNewAttempt}
        />
      </NextIntlClientProvider>
    )
    expect(screen.getByTestId("track-block")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "#88" }))
    expect(onOpenSession).toHaveBeenCalledWith(trackRows[0].sessions[0])
    expect(screen.queryAllByText("Complete")).toHaveLength(1)
    await userEvent.click(screen.getAllByRole("button", { name: "Task 3" })[0])
    expect(onOpenTasks).toHaveBeenCalled()
    await userEvent.click(screen.getByText("New attempt"))
    expect(onNewAttempt).toHaveBeenCalledWith("p_deadbeef")
    expect(screen.getAllByText("New attempt")).toHaveLength(1)
    await userEvent.click(screen.getByText("Open tasks"))
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe("PoolColumns", () => {
  it("counts waiting and completes by id", async () => {
    const onComplete = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={copy}>
        <PoolColumns items={items} onComplete={onComplete} />
      </NextIntlClientProvider>
    )
    expect(screen.getByText("1")).toBeInTheDocument()
    await userEvent.click(screen.getByText("Complete"))
    expect(onComplete).toHaveBeenCalledWith("p_deadbeef")
  })

  it("opens a column session chip", async () => {
    const onOpenSession = vi.fn()
    render(
      <NextIntlClientProvider locale="en" messages={copy}>
        <PoolColumns
          items={items}
          onComplete={vi.fn()}
          onOpenSession={onOpenSession}
          convs={
            new Map([
              [88, { id: 88, folderId: 1, agentType: "grok", status: "pending_review" }],
            ])
          }
        />
      </NextIntlClientProvider>
    )
    await userEvent.click(screen.getByRole("button", { name: "#88" }))
    expect(onOpenSession).toHaveBeenCalledWith({
      id: 88,
      folderId: 1,
      agentType: "grok",
      status: "pending_review",
    })
  })

  it("shows honest percent and children, not a fake 50%", () => {
    const withKids: PlanItem = {
      ...items[0],
      children: [
        { title: "Research", done: true },
        { title: "Year pan", done: false },
      ],
      percent: 50,
      progress: ["design out"],
      next: "pass GC1",
    }
    const bare: PlanItem = {
      id: "p_aabbccdd",
      title: "Bare row",
      list: "next",
      done: false,
      conversationIds: [],
      workTaskIds: [],
      percent: null,
    }
    render(
      <NextIntlClientProvider locale="en" messages={copy}>
        <PoolColumns items={[withKids, bare]} onComplete={vi.fn()} onToggleChild={vi.fn()} />
      </NextIntlClientProvider>
    )
    expect(screen.getByTestId("percent-p_deadbeef")).toHaveTextContent("50%")
    expect(screen.queryByTestId("percent-p_aabbccdd")).not.toBeInTheDocument()
    expect(screen.getByText("Research")).toBeInTheDocument()
    expect(screen.getByText("design out")).toBeInTheDocument()
    expect(screen.getByText("pass GC1")).toBeInTheDocument()
  })
})
