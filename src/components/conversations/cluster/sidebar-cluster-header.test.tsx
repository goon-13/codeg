import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
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

describe("SidebarClusterHeader", () => {
  it("exposes data attributes and member count", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SidebarClusterHeader
          clusterId={7}
          title="货架新建"
          memberCount={2}
          agentTypes={["cursor", "grok"]}
          expanded
          depth={0}
          onToggle={vi.fn()}
          onRename={vi.fn()}
          onDissolve={vi.fn()}
        />
      </NextIntlClientProvider>
    )
    const el = document.querySelector("[data-conversation-cluster]")
    expect(el).toBeTruthy()
    expect(el?.getAttribute("data-cluster-id")).toBe("7")
    expect(el?.textContent).toContain("货架新建")
    expect(el?.textContent).toContain("2")
  })
})
