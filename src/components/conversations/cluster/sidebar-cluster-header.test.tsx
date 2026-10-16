import { act, fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import { SidebarClusterHeader } from "./sidebar-cluster-header"

vi.mock("@/components/agent-icon", () => ({
  AgentIcon: ({ agentType }: { agentType: string }) => (
    <span data-agent={agentType} />
  ),
}))

const messages = {
  Folder: {
    cluster: {
      rename: "Rename",
      editTitle: "Rename theme",
      renameTitle: "Rename cluster",
      dissolve: "Dissolve",
      dissolveTitle: "Dissolve?",
      dissolveDescription: "Dissolve {title}",
      untitled: "Theme",
      memberCount: "{count}",
      expand: "Expand",
      collapse: "Collapse",
      cancel: "Cancel",
      save: "Save",
    },
  },
}

function renderHeader(
  overrides: Partial<Parameters<typeof SidebarClusterHeader>[0]> = {}
) {
  const props = {
    clusterId: 7,
    title: "货架新建",
    memberCount: 2,
    agentTypes: ["cursor", "grok"],
    expanded: true,
    depth: 0,
    onToggle: vi.fn(),
    onRename: vi.fn(async () => {}),
    onDissolve: vi.fn(),
    ...overrides,
  }
  return {
    ...render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SidebarClusterHeader {...props} />
      </NextIntlClientProvider>
    ),
    props,
  }
}

describe("SidebarClusterHeader", () => {
  it("exposes data attributes and member count", () => {
    renderHeader()
    const el = document.querySelector("[data-conversation-cluster]")
    expect(el).toBeTruthy()
    expect(el?.getAttribute("data-cluster-id")).toBe("7")
    expect(el?.textContent).toContain("货架新建")
    expect(el?.textContent).toContain("2")
  })

  it("click title does not toggle and commits rename", async () => {
    const onToggle = vi.fn()
    const onRename = vi.fn(async () => {})
    renderHeader({ onToggle, onRename })
    fireEvent.click(screen.getByTestId("cluster-header-title"))
    expect(onToggle).not.toHaveBeenCalled()
    const input = screen.getByTestId("inline-title-editor-input")
    fireEvent.change(input, { target: { value: "新主题" } })
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" })
    })
    expect(onRename).toHaveBeenCalledWith(7, "新主题")
  })

  it("click chevron still toggles", () => {
    const onToggle = vi.fn()
    renderHeader({ onToggle })
    fireEvent.click(screen.getByLabelText("Collapse"))
    expect(onToggle).toHaveBeenCalledWith(7)
  })

  it("paste 80 scalars commits 64", async () => {
    const onRename = vi.fn(async () => {})
    renderHeader({ onRename })
    fireEvent.click(screen.getByTestId("cluster-header-title"))
    fireEvent.change(screen.getByTestId("inline-title-editor-input"), {
      target: { value: "题".repeat(80) },
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("inline-title-editor-input"), {
        key: "Enter",
      })
    })
    const sent = onRename.mock.calls[0][1] as string
    expect([...sent].length).toBe(64)
  })

  it("empty does not onRename", async () => {
    const onRename = vi.fn(async () => {})
    renderHeader({ onRename })
    fireEvent.click(screen.getByTestId("cluster-header-title"))
    fireEvent.change(screen.getByTestId("inline-title-editor-input"), {
      target: { value: "  " },
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("inline-title-editor-input"), {
        key: "Enter",
      })
    })
    expect(onRename).not.toHaveBeenCalled()
  })

  it("dialog save slices to 64", async () => {
    const user = (await import("@testing-library/user-event")).default.setup({
      pointerEventsCheck: 0,
    })
    const onRename = vi.fn(async () => {})
    renderHeader({ onRename })
    fireEvent.contextMenu(document.querySelector("[data-conversation-cluster]")!)
    await user.click(screen.getByRole("menuitem", { name: "Rename" }))
    const input = screen.getByRole("textbox")
    await user.clear(input)
    await user.type(input, "题".repeat(80))
    await user.click(screen.getByRole("button", { name: "Save" }))
    expect([...onRename.mock.calls[0][1]].length).toBe(64)
  })

  it("keeps outer data-conversation-cluster while editing", () => {
    renderHeader()
    fireEvent.click(screen.getByTestId("cluster-header-title"))
    const outer = document.querySelector("[data-conversation-cluster]")
    expect(outer?.getAttribute("data-cluster-id")).toBe("7")
    expect(outer?.tagName).toBe("DIV")
  })

  it("reject keeps editing", async () => {
    const onRename = vi.fn(async () => {
      throw new Error("nope")
    })
    renderHeader({ onRename })
    fireEvent.click(screen.getByTestId("cluster-header-title"))
    fireEvent.change(screen.getByTestId("inline-title-editor-input"), {
      target: { value: "x" },
    })
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("inline-title-editor-input"), {
        key: "Enter",
      })
    })
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
  })
})
