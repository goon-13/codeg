import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import {
  ConversationMessageNav,
  type MessageNavEntry,
  type PromptTickItem,
} from "./conversation-message-nav"

// Stable `t` (per next-intl mock guidance) — returns the key verbatim, plus the
// `count` it was given (`collapsedSummary:3`), so a label that shows a count is
// checked for the right one.
const { stableT, mockOpenDiff } = vi.hoisted(() => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values && "count" in values ? `${key}:${String(values.count)}` : key
  return { stableT: t, mockOpenDiff: vi.fn() }
})

vi.mock("next-intl", () => ({ useTranslations: () => stableT }))
vi.mock("@/contexts/workspace-context", () => ({
  useWorkspaceActions: () => ({ openSessionFileDiff: mockOpenDiff }),
}))
vi.mock("@/contexts/active-folder-context", () => ({
  useActiveFolder: () => ({ activeFolder: { path: "/repo" } }),
}))

const DELETION_DIFF = "*** Delete File: old.ts\n-a\n-b\n-c\n-d"

const entries: MessageNavEntry[] = [
  {
    threadIndex: 0,
    turnIndex: null,
    turnId: "u1",
    ordinal: 1,
    label: "first message",
    additions: 0,
    deletions: 0,
    files: [],
    hasChanges: false,
  },
  {
    // One-sided change: additions only — the -0 must still render.
    threadIndex: 3,
    turnIndex: null,
    turnId: "u2",
    ordinal: 2,
    label: "edit something",
    additions: 5,
    deletions: 0,
    files: [
      {
        id: "f1",
        path: "/repo/src/a.ts",
        additions: 5,
        deletions: 0,
        diff: "diff --git a/src/a.ts b/src/a.ts\n@@ -0,0 +1 @@\n+new",
      },
    ],
    hasChanges: true,
  },
  {
    // Deleted file — must remain clickable to open its deletion diff.
    threadIndex: 6,
    turnIndex: null,
    turnId: "u3",
    ordinal: 3,
    label: "delete a file",
    additions: 0,
    deletions: 4,
    files: [
      {
        id: "f2",
        path: "/repo/old.ts",
        additions: 0,
        deletions: 4,
        diff: DELETION_DIFF,
      },
    ],
    hasChanges: true,
  },
]

const prompts: PromptTickItem[] = entries.map((e) => ({
  turnId: e.turnId,
  ordinal: e.ordinal,
  threadIndex: e.threadIndex,
  turnIndex: e.turnIndex,
  label: e.label,
}))

/** A message above the loaded window: listed, but not rendered yet. */
const earlierEntry: MessageNavEntry = {
  threadIndex: null,
  turnIndex: 12,
  turnId: "turn-12",
  ordinal: 1,
  label: "an early message",
  additions: 0,
  deletions: 0,
  files: [],
  hasChanges: false,
}

describe("ConversationMessageNav", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders nothing when there are no user messages", () => {
    const { container } = render(
      <ConversationMessageNav
        count={0}
        expanded={false}
        onToggle={vi.fn()}
        entries={[]}
        onSelect={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when there is only one user message", () => {
    const { container } = render(
      <ConversationMessageNav
        count={1}
        expanded={false}
        onToggle={vi.fn()}
        entries={[]}
        prompts={[
          {
            turnId: "u1",
            ordinal: 1,
            threadIndex: 0,
            turnIndex: null,
            label: "only",
          },
        ]}
        onSelect={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("collapsed: shows one tick per prompt and jumps on click", () => {
    const onSelect = vi.fn()
    render(
      <ConversationMessageNav
        count={3}
        expanded={false}
        onToggle={vi.fn()}
        entries={[]}
        prompts={prompts}
        trackHeightPx={720}
        onSelect={onSelect}
      />
    )
    expect(screen.queryByText("title")).not.toBeInTheDocument()
    expect(screen.getByTestId("prompt-tick-rail")).toBeInTheDocument()
    expect(screen.getAllByTestId("prompt-tick")).toHaveLength(3)
    fireEvent.click(
      screen.getByTestId("prompt-tick-rail").querySelector('[data-ordinal="2"]')!
    )
    expect(onSelect).toHaveBeenCalled()
  })

  it("expanded: keeps the tick rail and shows the flyout beside it", () => {
    render(
      <ConversationMessageNav
        count={entries.length}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        prompts={prompts}
        trackHeightPx={720}
        onSelect={vi.fn()}
      />
    )
    expect(screen.getByTestId("prompt-tick-rail")).toBeInTheDocument()
    expect(screen.getByTestId("prompt-nav-flyout")).toBeInTheDocument()
    expect(screen.getByText("title")).toBeInTheDocument()
  })

  it("hovering a tick shows only that prompt, not the flyout", () => {
    render(
      <ConversationMessageNav
        count={3}
        expanded={false}
        onToggle={vi.fn()}
        entries={[]}
        prompts={prompts}
        trackHeightPx={720}
        onSelect={vi.fn()}
      />
    )
    fireEvent.mouseEnter(screen.getAllByTestId("prompt-tick")[1])
    expect(screen.getByTestId("prompt-tick-peek")).toHaveTextContent(
      "edit something"
    )
    expect(screen.queryByTestId("prompt-nav-flyout")).not.toBeInTheDocument()
  })

  it("filters flyout rows by label", () => {
    render(
      <ConversationMessageNav
        count={entries.length}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        prompts={prompts}
        trackHeightPx={720}
        onSelect={vi.fn()}
      />
    )
    fireEvent.change(screen.getByTestId("prompt-nav-filter"), {
      target: { value: "delete" },
    })
    expect(screen.getByText("delete a file")).toBeInTheDocument()
    expect(screen.queryByText("first message")).not.toBeInTheDocument()
  })

  function manyPrompts(n: number): PromptTickItem[] {
    return Array.from({ length: n }, (_, i) => ({
      turnId: `u${i + 1}`,
      ordinal: i + 1,
      threadIndex: i,
      turnIndex: null,
      label: `prompt ${i + 1}`,
    }))
  }

  it("dense: consecutive window and the count opens the flyout", () => {
    const onToggle = vi.fn()
    render(
      <ConversationMessageNav
        count={40}
        expanded={false}
        onToggle={onToggle}
        entries={[]}
        prompts={manyPrompts(40)}
        trackHeightPx={100}
        onSelect={vi.fn()}
      />
    )
    const ticks = screen.getAllByTestId("prompt-tick")
    const ordinals = ticks.map((el) => Number(el.getAttribute("data-ordinal")))
    expect(ordinals).toHaveLength(8)
    expect(ordinals[ordinals.length - 1] - ordinals[0]).toBe(7)
    expect(screen.getByTestId("prompt-tick-count")).toHaveTextContent("40")
    fireEvent.click(screen.getByTestId("prompt-tick-count"))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it("count click closes the flyout when it is already open", () => {
    const onToggle = vi.fn()
    render(
      <ConversationMessageNav
        count={40}
        expanded
        onToggle={onToggle}
        entries={[]}
        prompts={manyPrompts(40)}
        trackHeightPx={100}
        onSelect={vi.fn()}
      />
    )
    fireEvent.click(screen.getByTestId("prompt-tick-count"))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it("centers the active prompt in the window", () => {
    render(
      <ConversationMessageNav
        count={40}
        expanded={false}
        onToggle={vi.fn()}
        entries={[]}
        prompts={manyPrompts(40)}
        trackHeightPx={100}
        activeOrdinal={20}
        onSelect={vi.fn()}
      />
    )
    const ordinals = screen
      .getAllByTestId("prompt-tick")
      .map((el) => Number(el.getAttribute("data-ordinal")))
    expect(ordinals).toContain(20)
    expect(ordinals.includes(1) && ordinals.includes(40)).toBe(false)
    const i = ordinals.indexOf(20)
    expect(i).toBeGreaterThan(1)
    expect(i).toBeLessThan(ordinals.length - 2)
  })

  it("wheel pans the window without opening the flyout", () => {
    render(
      <ConversationMessageNav
        count={40}
        expanded={false}
        onToggle={vi.fn()}
        entries={[]}
        prompts={manyPrompts(40)}
        trackHeightPx={100}
        activeOrdinal={20}
        onSelect={vi.fn()}
      />
    )
    const before = screen
      .getAllByTestId("prompt-tick")
      .map((el) => Number(el.getAttribute("data-ordinal")))
    fireEvent.wheel(screen.getByTestId("prompt-tick-rail"), { deltaY: -120 })
    const after = screen
      .getAllByTestId("prompt-tick")
      .map((el) => Number(el.getAttribute("data-ordinal")))
    expect(after[0]).toBeLessThan(before[0])
    expect(screen.queryByTestId("prompt-nav-flyout")).not.toBeInTheDocument()
  })

  it("binds a non-passive native wheel listener so preventDefault sticks", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/message/conversation-message-nav.tsx"),
      "utf8"
    )
    expect(src).toMatch(/addEventListener\(\s*"wheel"/)
    expect(src).toMatch(/passive:\s*false/)
  })

  it("expanded: clicking a message selects its entry", () => {
    const onSelect = vi.fn()
    render(
      <ConversationMessageNav
        count={entries.length}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByText("edit something"))
    expect(onSelect).toHaveBeenCalledWith(entries[1])
  })

  it("selects a message above the loaded window like any other", () => {
    const onSelect = vi.fn()
    render(
      <ConversationMessageNav
        count={4}
        expanded
        onToggle={vi.fn()}
        entries={[earlierEntry, ...entries]}
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByText("an early message"))
    expect(onSelect).toHaveBeenCalledWith(earlierEntry)
  })

  it("marks the message being paged in as busy", () => {
    render(
      <ConversationMessageNav
        count={4}
        expanded
        onToggle={vi.fn()}
        entries={[earlierEntry, ...entries]}
        onSelect={vi.fn()}
        revealingTurnId="turn-12"
      />
    )
    const revealing = screen.getByText("an early message").closest("button")
    expect(revealing).toHaveAttribute("aria-busy", "true")
    const other = screen.getByText("first message").closest("button")
    expect(other).not.toHaveAttribute("aria-busy")
  })

  it("says so while the messages above the window are loading", () => {
    render(
      <ConversationMessageNav
        count={5}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        onSelect={vi.fn()}
        earlier="loading"
      />
    )
    expect(screen.getByText("loadingEarlier")).toBeInTheDocument()
    expect(screen.queryByText("loadEarlier")).not.toBeInTheDocument()
  })

  it("offers a retry when the messages above the window failed to load", () => {
    const onRetryEarlier = vi.fn()
    render(
      <ConversationMessageNav
        count={5}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        onSelect={vi.fn()}
        earlier="error"
        onRetryEarlier={onRetryEarlier}
      />
    )
    expect(screen.queryByText("loadingEarlier")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "loadEarlier" }))
    expect(onRetryEarlier).toHaveBeenCalledTimes(1)
  })

  it("expanded: the header collapse button collapses the panel", () => {
    const onToggle = vi.fn()
    render(
      <ConversationMessageNav
        count={entries.length}
        expanded
        onToggle={onToggle}
        entries={entries}
        onSelect={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "collapse" }))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it("always shows both +N and -N, including a zero side", () => {
    render(
      <ConversationMessageNav
        count={entries.length}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        onSelect={vi.fn()}
      />
    )
    // u2 added 5, deleted 0 — both rendered.
    expect(screen.getByText("+5")).toBeInTheDocument()
    expect(screen.getByText("-0")).toBeInTheDocument()
    // u3 added 0, deleted 4 — both rendered.
    expect(screen.getByText("+0")).toBeInTheDocument()
    expect(screen.getByText("-4")).toBeInTheDocument()
    // Placeholder message still renders its label.
    expect(screen.getByText("first message")).toBeInTheDocument()
  })

  it("opens a file diff when a changed file is clicked", () => {
    render(
      <ConversationMessageNav
        count={entries.length}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        onSelect={vi.fn()}
      />
    )
    // Expand u2's file list (first changed group).
    fireEvent.click(screen.getAllByRole("button", { name: /^fileCount:/ })[0])
    fireEvent.click(screen.getByTitle("src/a.ts"))
    expect(mockOpenDiff).toHaveBeenCalledWith(
      "/repo/src/a.ts",
      "diff --git a/src/a.ts b/src/a.ts\n@@ -0,0 +1 @@\n+new",
      "msg-2-chg-1"
    )
  })

  it("opens the deletion diff when a deleted file is clicked", () => {
    render(
      <ConversationMessageNav
        count={entries.length}
        expanded
        onToggle={vi.fn()}
        entries={entries}
        onSelect={vi.fn()}
      />
    )
    // Expand u3's file list (second changed group).
    fireEvent.click(screen.getAllByRole("button", { name: /^fileCount:/ })[1])
    fireEvent.click(screen.getByTitle("old.ts"))
    expect(mockOpenDiff).toHaveBeenCalledWith(
      "/repo/old.ts",
      DELETION_DIFF,
      "msg-3-chg-1"
    )
  })
})
