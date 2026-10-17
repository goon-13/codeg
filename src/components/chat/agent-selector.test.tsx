import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

// MUST mock the hook BEFORE importing the component under test.
vi.mock("@/hooks/use-acp-agents", () => ({
  useAcpAgents: vi.fn(),
}))

import { AgentSelector } from "./agent-selector"
import { useAcpAgents } from "@/hooks/use-acp-agents"
import enMessages from "@/i18n/messages/en.json"
import { getAgentLabel } from "@/lib/custom-agents"
import type { AcpAgentInfo, AgentType } from "@/lib/types"

const mockUseAcpAgents = vi.mocked(useAcpAgents)

function agent(
  agentType: AgentType,
  overrides: Partial<AcpAgentInfo> = {}
): AcpAgentInfo {
  return {
    agent_type: agentType,
    skills_capable: true,
    registry_id: `${agentType}-registry`,
    registry_version: null,
    supports_custom_version: false,
    name: agentType,
    description: "",
    available: true,
    distribution_type: "system",
    is_acp_adapter: false,
    custom_source: null,
    enabled: true,
    sort_order: 0,
    installed_version: null,
    host_tools_agent_mode: false,
    env: {},
    config_json: null,
    config_file_path: null,
    opencode_auth_json: null,
    codex_auth_json: null,
    codex_config_toml: null,
    codex_model_catalog: null,
    codex_sandbox_settings: null,
    grok_config_toml: null,
    grok_settings: null,
    cline_secrets_json: null,
    hermes_config_yaml: null,
    cursor_cli_config_json: null,
    cursor_settings: null,
    model_provider_id: null,
    icon_url: null,
    ...overrides,
  }
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  mockUseAcpAgents.mockReset()
  vi.restoreAllMocks()
})

describe("AgentSelector", () => {
  it("shows the empty state when no enabled agents are returned", () => {
    mockUseAcpAgents.mockReturnValue({
      agents: [],
      fresh: true,
      refresh: async () => {},
    })
    const onOpenSettings = vi.fn()
    renderWithIntl(
      <AgentSelector
        onSelect={() => {}}
        onOpenAgentsSettings={onOpenSettings}
      />
    )
    expect(screen.getByText("No enabled agents")).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", { name: "Open Agents settings" })
    )
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it("shows only the current agent until the menu opens", () => {
    mockUseAcpAgents.mockReturnValue({
      agents: [agent("claude_code"), agent("codex"), agent("grok")],
      fresh: true,
      refresh: async () => {},
    })
    const { container } = renderWithIntl(
      <AgentSelector defaultAgentType="claude_code" onSelect={() => {}} />
    )
    expect(container.querySelectorAll('[data-slot="agent-pill"]')).toHaveLength(
      0
    )
    expect(
      container.querySelectorAll('[data-slot="agent-selector-more"]')
    ).toHaveLength(0)
    const trigger = container.querySelector(
      '[data-slot="agent-selector-trigger"]'
    )
    expect(trigger).toBeTruthy()
    expect(trigger).toHaveTextContent(getAgentLabel("claude_code"))
    expect(
      container.querySelectorAll('[data-slot="agent-option"]')
    ).toHaveLength(0)
  })

  it("selects another agent from the listbox", async () => {
    mockUseAcpAgents.mockReturnValue({
      agents: [agent("claude_code"), agent("codex")],
      fresh: true,
      refresh: async () => {},
    })
    const onSelect = vi.fn()
    renderWithIntl(
      <AgentSelector
        defaultAgentType="claude_code"
        onSelect={onSelect}
        onFallback={vi.fn()}
      />
    )
    // The agent_type's display label comes from AGENT_LABELS; clicking the
    // codex button by role/title is the most stable selector.
    const buttons = screen.getAllByRole("button")
    // First button is the selected (claude_code), second is codex.
    fireEvent.click(buttons[1])
    fireEvent.click(
      container.querySelector('[data-slot="agent-selector-trigger"]')!
    )
    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-slot="agent-option"]').length
      ).toBe(2)
    })
    fireEvent.click(document.querySelector('[data-agent-type="codex"]')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith("codex")
  })

  it("does not select again when the current agent row is chosen", async () => {
    mockUseAcpAgents.mockReturnValue({
      agents: [agent("claude_code"), agent("codex")],
      fresh: true,
      refresh: async () => {},
    })
    const onSelect = vi.fn()
    const { container } = renderWithIntl(
      <AgentSelector
        defaultAgentType="claude_code"
        onSelect={onSelect}
        onFallback={vi.fn()}
      />
    )
    fireEvent.click(
      container.querySelector('[data-slot="agent-selector-trigger"]')!
    )
    await waitFor(() => {
      expect(
        document.querySelector('[data-agent-type="claude_code"]')
      ).toBeTruthy()
    })
    fireEvent.click(document.querySelector('[data-agent-type="claude_code"]')!)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("fires onFallback (not onSelect) when the preferred agent is unavailable", async () => {
    mockUseAcpAgents.mockReturnValue({
      agents: [
        agent("claude_code", { available: false }),
        agent("codex"),
        agent("gemini"),
      ],
      fresh: true,
      refresh: async () => {},
    })
    const onSelect = vi.fn()
    const onFallback = vi.fn()
    renderWithIntl(
      <AgentSelector
        defaultAgentType="claude_code"
        onSelect={onSelect}
        onFallback={onFallback}
      />
    )
    await waitFor(() => {
      expect(onFallback).toHaveBeenCalledTimes(1)
    })
    expect(onFallback).toHaveBeenCalledWith("codex")
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("falls back through onSelect when onFallback is not provided (legacy)", async () => {
    mockUseAcpAgents.mockReturnValue({
      agents: [agent("codex"), agent("gemini")],
      fresh: true,
      refresh: async () => {},
    })
    const onSelect = vi.fn()
    renderWithIntl(
      <AgentSelector defaultAgentType={undefined} onSelect={onSelect} />
    )
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
    expect(onSelect).toHaveBeenCalledWith("codex")
  })

  it("notifies onAgentsLoaded with the current agent list", async () => {
    const codex = agent("codex")
    mockUseAcpAgents.mockReturnValue({
      agents: [codex],
      fresh: true,
      refresh: async () => {},
    })
    const onAgentsLoaded = vi.fn()
    renderWithIntl(
      <AgentSelector
        defaultAgentType="codex"
        onSelect={() => {}}
        onAgentsLoaded={onAgentsLoaded}
      />
    )
    await waitFor(() => {
      expect(onAgentsLoaded).toHaveBeenCalled()
    })
    const calls = onAgentsLoaded.mock.calls
    const lastCall = calls[calls.length - 1]?.[0]
    expect(lastCall).toEqual([codex])
  })

  it("lists custom hermes roles next to built-in hermes even if the API listed them last", async () => {
    mockUseAcpAgents.mockReturnValue({
      agents: [
        agent("codex"),
        agent("cline"),
        agent("hermes"),
        agent("code_buddy"),
        agent("custom:goose"),
        agent("custom:hermes-homeops"),
        agent("custom:hermes-roleadmin"),
      ],
      fresh: true,
      refresh: async () => {},
    })
    const { container } = renderWithIntl(
      <AgentSelector defaultAgentType="hermes" onSelect={() => {}} />
    )
    fireEvent.click(
      container.querySelector('[data-slot="agent-selector-trigger"]')!
    )
    await waitFor(() => {
      expect(
        document.querySelectorAll('[data-slot="agent-option"]').length
      ).toBe(7)
    })
    const types = Array.from(
      document.querySelectorAll("[data-agent-type]")
    ).map((el) => el.getAttribute("data-agent-type"))
    expect(types).toEqual([
      "codex",
      "cline",
      "hermes",
      "custom:hermes-homeops",
      "custom:hermes-roleadmin",
      "code_buddy",
      "custom:goose",
    ])
  })
})
