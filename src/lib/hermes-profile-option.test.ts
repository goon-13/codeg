import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import ar from "@/i18n/messages/ar.json"
import de from "@/i18n/messages/de.json"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"
import fr from "@/i18n/messages/fr.json"
import ja from "@/i18n/messages/ja.json"
import ko from "@/i18n/messages/ko.json"
import pt from "@/i18n/messages/pt.json"
import zhCN from "@/i18n/messages/zh-CN.json"
import zhTW from "@/i18n/messages/zh-TW.json"
import {
  HERMES_PROFILE_CONFIG_ID,
  buildHermesProfileOption,
  hermesCachedConfigOptions,
  hermesComposerAcpReady,
  hermesComposerConfigOptions,
  hermesComposerSelectorsPending,
  hermesLiveOrCachedConfigOptions,
  hermesRoleListReady,
  interceptHermesProfileConfigChange,
  isAgentSelectorVisibleType,
  isHermesFamilyAgent,
  beginHermesRoleSwitch,
  clearHermesRoleSwitchSkip,
  hermesResumeSessionId,
  hermesRoleSwitchSkipFor,
  mergeHermesProfileOption,
  planHermesRoleSwitch,
  shouldClearHermesResumeSkip,
} from "./hermes-profile-option"
import type { AgentType, SessionConfigOptionInfo } from "./types"

const SRC_ROOT = resolve(process.cwd(), "src")

function collectProductionSource(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      out.push(...collectProductionSource(path))
      continue
    }
    if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue
    out.push(path)
  }
  return out
}

function handleSetConfigOptionBody(source: string, file: string): string {
  const start = source.indexOf("const handleSetConfigOption = useCallback(")
  expect(start, `${file} must define handleSetConfigOption`).toBeGreaterThan(-1)
  const acpCall = "lifecycleSetConfigOption(configId, valueId)"
  const acpIdx = source.indexOf(acpCall, start)
  expect(acpIdx, `${file} must still forward non-profile ids to ACP`).toBeGreaterThan(
    start
  )
  return source.slice(start, acpIdx + acpCall.length)
}

const AGENTS: {
  agent_type: AgentType
  name: string
  enabled: boolean
}[] = [
  { agent_type: "grok", name: "Grok", enabled: true },
  { agent_type: "hermes", name: "Hermes Agent", enabled: true },
  {
    agent_type: "custom:hermes-homeops",
    name: "Hermes 家网运维",
    enabled: true,
  },
  { agent_type: "custom:goose", name: "Goose", enabled: true },
  {
    agent_type: "custom:hermes-roleadmin",
    name: "Role Admin",
    enabled: false,
  },
]

const MODE_OPTION: SessionConfigOptionInfo = {
  id: "mode",
  name: "Default",
  description: null,
  category: "mode",
  kind: {
    type: "select",
    current_value: "default",
    options: [{ value: "default", name: "Default" }],
    groups: [],
  },
}

const MODEL_OPTION: SessionConfigOptionInfo = {
  id: "model",
  name: "Model",
  description: null,
  category: "model",
  kind: {
    type: "select",
    current_value: "default",
    options: [{ value: "default", name: "Default" }],
    groups: [],
  },
}

describe("isHermesFamilyAgent", () => {
  it("matches built-in hermes and custom:hermes-* ids only", () => {
    expect(isHermesFamilyAgent("hermes")).toBe(true)
    expect(isHermesFamilyAgent("custom:hermes-homeops")).toBe(true)
    expect(isHermesFamilyAgent("grok")).toBe(false)
    expect(isHermesFamilyAgent("custom:goose")).toBe(false)
    expect(isHermesFamilyAgent("custom:hermes")).toBe(false)
  })
})

describe("isAgentSelectorVisibleType", () => {
  it("hides custom hermes roles from the session agent row", () => {
    expect(isAgentSelectorVisibleType("hermes")).toBe(true)
    expect(isAgentSelectorVisibleType("grok")).toBe(true)
    expect(isAgentSelectorVisibleType("cursor")).toBe(true)
    expect(isAgentSelectorVisibleType("custom:goose")).toBe(true)
    expect(isAgentSelectorVisibleType("custom:hermes-homeops")).toBe(false)
    expect(isAgentSelectorVisibleType("custom:hermes-roleadmin")).toBe(false)
  })
})

describe("buildHermesProfileOption", () => {
  it("returns null when the current agent is not Hermes family", () => {
    expect(
      buildHermesProfileOption({
        currentAgent: "grok",
        agents: AGENTS,
        label: "Role",
      })
    ).toBeNull()
  })

  it("lists enabled built-in hermes and enabled custom:hermes-* when current is hermes", () => {
    const option = buildHermesProfileOption({
      currentAgent: "hermes",
      agents: AGENTS,
      label: "Role",
    })

    expect(option).toEqual({
      id: "codeg:hermes-profile",
      name: "Role",
      kind: {
        type: "select",
        current_value: "hermes",
        options: [
          { value: "hermes", name: "Hermes Agent" },
          { value: "custom:hermes-homeops", name: "Hermes 家网运维" },
        ],
        groups: [],
      },
    })
  })

  it("sets current_value to the current custom hermes profile", () => {
    const option = buildHermesProfileOption({
      currentAgent: "custom:hermes-homeops",
      agents: AGENTS,
      label: "Role",
    })

    expect(option).not.toBeNull()
    expect(option!.kind).toMatchObject({
      type: "select",
      current_value: "custom:hermes-homeops",
    })
  })
})

describe("mergeHermesProfileOption", () => {
  it("leaves Grok config options unchanged", () => {
    const options = [MODE_OPTION]
    expect(
      mergeHermesProfileOption(options, {
        currentAgent: "grok",
        agents: AGENTS,
        label: "Role",
      })
    ).toBe(options)
  })

  it("prepends the synthetic role option next to existing composer config options", () => {
    const merged = mergeHermesProfileOption([MODE_OPTION], {
      currentAgent: "hermes",
      agents: AGENTS,
      label: "Role",
    })

    expect(merged.map((option) => option.id)).toEqual([
      "codeg:hermes-profile",
      "mode",
    ])
  })
})

describe("interceptHermesProfileConfigChange", () => {
  it("returns the new agent for the synthetic profile id and null for ACP ids", () => {
    expect(interceptHermesProfileConfigChange("model", "opus")).toBeNull()
    expect(interceptHermesProfileConfigChange("mode", "default")).toBeNull()
    expect(
      interceptHermesProfileConfigChange(
        HERMES_PROFILE_CONFIG_ID,
        "custom:hermes-homeops"
      )
    ).toBe("custom:hermes-homeops")
    expect(
      interceptHermesProfileConfigChange(HERMES_PROFILE_CONFIG_ID, "hermes")
    ).toBe("hermes")
  })
})

describe("composer parents intercept the synthetic role id", () => {
  const panelSource = readFileSync(
    resolve(SRC_ROOT, "components/conversations/conversation-detail-panel.tsx"),
    "utf8"
  )
  const canvasSource = readFileSync(
    resolve(SRC_ROOT, "components/canvas/canvas-conversation-surface.tsx"),
    "utf8"
  )
  const chatInputSource = readFileSync(
    resolve(SRC_ROOT, "components/chat/chat-input.tsx"),
    "utf8"
  )
  const shellSource = readFileSync(
    resolve(SRC_ROOT, "components/chat/conversation-shell.tsx"),
    "utf8"
  )

  it("conversation-detail-panel retargets draft and persisted in place, never ACP", () => {
    const body = handleSetConfigOptionBody(
      panelSource,
      "conversation-detail-panel.tsx"
    )
    const interceptIdx = body.indexOf("interceptHermesProfileConfigChange")
    const planIdx = body.indexOf("planHermesRoleSwitch")
    const draftIdx = body.indexOf("confirmDraftAgent(")
    const persistIdx = body.indexOf("updateConversationAgentType(")
    const tabIdx = body.indexOf("setTabAgentType(")
    const stolenDraft = body.indexOf("openNewConversationTab(")
    const createIdx = body.indexOf("createConversation(")
    const openIdx = body.indexOf("openTab(")
    const acpIdx = body.indexOf("lifecycleSetConfigOption(configId, valueId)")
    expect(interceptIdx).toBeGreaterThan(-1)
    expect(planIdx).toBeGreaterThan(interceptIdx)
    expect(draftIdx).toBeGreaterThan(planIdx)
    expect(persistIdx).toBeGreaterThan(planIdx)
    expect(tabIdx).toBeGreaterThan(persistIdx)
    expect(stolenDraft).toBe(-1)
    expect(createIdx).toBe(-1)
    expect(openIdx).toBe(-1)
    expect(acpIdx).toBeGreaterThan(tabIdx)
    expect(panelSource).toContain("hermesResumeSessionId(")
    expect(panelSource).toContain("shouldClearHermesResumeSkip(")
    expect(panelSource).toContain("beginHermesRoleSwitch(")
    expect(panelSource).toContain("useHermesRoleSwitchSkip(")
    expect(panelSource).toContain("setExternalId(dbConversationId, null)")
    const disconnectIdx = Math.max(
      body.indexOf("handleDisconnect("),
      body.indexOf("await handleDisconnect(")
    )
    expect(disconnectIdx).toBeGreaterThan(-1)
    expect(disconnectIdx).toBeLessThan(persistIdx)
  })

  it("canvas-conversation-surface retargets the current card in place, never ACP", () => {
    const body = handleSetConfigOptionBody(
      canvasSource,
      "canvas-conversation-surface.tsx"
    )
    const interceptIdx = body.indexOf("interceptHermesProfileConfigChange")
    const planIdx = body.indexOf("planHermesRoleSwitch")
    const retargetIdx = body.indexOf("handleAgentRowSelect(")
    const stolenDraft = body.indexOf("openNewConversationTab(")
    const createIdx = body.indexOf("createConversation(")
    const openIdx = body.indexOf("openTab(")
    const acpIdx = body.indexOf("lifecycleSetConfigOption(configId, valueId)")
    expect(interceptIdx).toBeGreaterThan(-1)
    expect(planIdx).toBeGreaterThan(interceptIdx)
    expect(retargetIdx).toBeGreaterThan(planIdx)
    expect(stolenDraft).toBe(-1)
    expect(createIdx).toBe(-1)
    expect(openIdx).toBe(-1)
    expect(acpIdx).toBeGreaterThan(retargetIdx)
    expect(canvasSource).toContain("hermesResumeSessionId(")
    expect(canvasSource).toContain("shouldClearHermesResumeSkip(")
    expect(canvasSource).toContain("beginHermesRoleSwitch(")
    expect(canvasSource).toContain("useHermesRoleSwitchSkip(")
    expect(canvasSource).toContain("setExternalId(dbConversationId, null)")
    expect(canvasSource).not.toContain("isDraft && onAgentTypeChange")
    expect(canvasSource).toContain("{onAgentTypeChange && (")
    expect(canvasSource).not.toContain('disabled={conn.status === "connecting"}')
    expect(canvasSource).toContain("onSelect={handleAgentRowSelect}")
    expect(canvasSource).not.toContain("onSelect={onAgentTypeChange}")
    expect(canvasSource).toContain("onFallback={isDraft ? onAgentTypeChange")
  })

  it("canvas AgentSelector pick tears down the live session before persist", () => {
    const start = canvasSource.indexOf("const handleAgentRowSelect")
    expect(start).toBeGreaterThan(-1)
    const body = canvasSource.slice(start, canvasSource.indexOf("const connStatus"))
    const disconnectIdx = body.indexOf("await handleDisconnect(")
    const persistIdx = body.indexOf("updateConversationAgentType(")
    expect(disconnectIdx).toBeGreaterThan(-1)
    expect(persistIdx).toBeGreaterThan(disconnectIdx)
    expect(body).toContain("beginHermesRoleSwitch(")
    expect(body).toContain("setExternalId(dbConversationId, null)")
    expect(body).toContain("onAgentTypeChange?.(")
  })

  it("no other production parent mounts MessageInput without that intercept", () => {
    const production = collectProductionSource(SRC_ROOT)
    const messageInputParents = production.filter((path) =>
      /<MessageInput[\s>]/.test(readFileSync(path, "utf8"))
    )
    expect(
      messageInputParents.map((path) => relative(SRC_ROOT, path)).sort()
    ).toEqual(["components/chat/chat-input.tsx"])

    expect(chatInputSource).toContain(
      "onConfigOptionChange={onConfigOptionChange}"
    )
    expect(shellSource).toContain(
      "onConfigOptionChange={onConfigOptionChange}"
    )
    expect(panelSource).toContain(
      "onConfigOptionChange={handleSetConfigOption}"
    )
    expect(canvasSource).toContain(
      "onConfigOptionChange={handleSetConfigOption}"
    )
  })
})

describe("hermes composer paint gate", () => {
  it("paints Role as soon as the agent list is ready, even before session/new", () => {
    expect(
      hermesComposerConfigOptions({
        currentAgent: "hermes",
        acpConfigOptions: null,
        agents: AGENTS,
        agentsReady: true,
        liveSelectorsReady: false,
        label: "Role",
      }).map((option) => option.id)
    ).toEqual(["codeg:hermes-profile"])
    expect(
      hermesComposerSelectorsPending({
        currentAgent: "hermes",
        acpConfigOptions: null,
        agentsReady: true,
        liveSelectorsReady: false,
      })
    ).toBe(false)
  })

  it("holds chips only until the Hermes agent list is ready", () => {
    expect(
      hermesComposerAcpReady({
        currentAgent: "hermes",
        acpConfigOptions: [],
        agentsReady: false,
        liveSelectorsReady: false,
      })
    ).toBe(false)
    expect(
      hermesComposerConfigOptions({
        currentAgent: "hermes",
        acpConfigOptions: [MODE_OPTION],
        agents: AGENTS,
        agentsReady: false,
        liveSelectorsReady: false,
        label: "Role",
      })
    ).toEqual([])
    expect(
      hermesComposerSelectorsPending({
        currentAgent: "hermes",
        acpConfigOptions: [],
        agentsReady: true,
        liveSelectorsReady: false,
      })
    ).toBe(false)
  })

  it("uses a cached model list while live options are still empty", () => {
    expect(
      hermesLiveOrCachedConfigOptions({
        currentAgent: "custom:hermes-company",
        liveSelectorsReady: false,
        liveConfigOptions: [],
        cachedConfigOptions: [MODEL_OPTION],
      })
    ).toEqual([MODEL_OPTION])
    expect(
      hermesCachedConfigOptions("custom:hermes-company", (agent) =>
        agent === "hermes" ? { configOptions: [MODEL_OPTION] } : null
      )
    ).toEqual([MODEL_OPTION])
  })

  it("paints Role and ACP options in one list once a model option is present", () => {
    const merged = hermesComposerConfigOptions({
      currentAgent: "hermes",
      acpConfigOptions: [MODEL_OPTION, MODE_OPTION],
      agents: AGENTS,
      agentsReady: true,
      liveSelectorsReady: false,
      label: "Role",
    })
    expect(merged.map((option) => option.id)).toEqual([
      "codeg:hermes-profile",
      "model",
      "mode",
    ])
    expect(
      hermesComposerSelectorsPending({
        currentAgent: "hermes",
        acpConfigOptions: [MODEL_OPTION, MODE_OPTION],
        agentsReady: true,
        liveSelectorsReady: false,
      })
    ).toBe(false)
  })

  it("releases once live selectorsReady even if ACP advertised no model", () => {
    expect(
      hermesComposerSelectorsPending({
        currentAgent: "hermes",
        acpConfigOptions: [],
        agentsReady: true,
        liveSelectorsReady: true,
      })
    ).toBe(false)
    expect(
      hermesComposerConfigOptions({
        currentAgent: "hermes",
        acpConfigOptions: [],
        agents: AGENTS,
        agentsReady: true,
        liveSelectorsReady: true,
        label: "Role",
      }).map((option) => option.id)
    ).toEqual(["codeg:hermes-profile"])
  })

  it("leaves Grok options unchanged even while Hermes agents are still loading", () => {
    expect(
      hermesComposerConfigOptions({
        currentAgent: "grok",
        acpConfigOptions: [MODE_OPTION],
        agents: [],
        agentsReady: false,
        liveSelectorsReady: false,
        label: "Role",
      })
    ).toEqual([MODE_OPTION])
    expect(
      hermesComposerSelectorsPending({
        currentAgent: "grok",
        acpConfigOptions: null,
        agentsReady: false,
        liveSelectorsReady: false,
      })
    ).toBe(false)
  })

  it("treats a cached Hermes agent list as ready before fresh settles", () => {
    expect(hermesRoleListReady([], false)).toBe(false)
    expect(hermesRoleListReady(AGENTS, false)).toBe(true)
    expect(hermesRoleListReady([], true)).toBe(true)
  })
})

describe("planHermesRoleSwitch", () => {
  it("no-ops when the same role is picked", () => {
    expect(
      planHermesRoleSwitch({
        nextAgent: "custom:hermes-homeops",
        currentAgent: "custom:hermes-homeops",
      })
    ).toBe("noop")
  })

  it("retargets the current conversation for draft and persisted alike", () => {
    expect(
      planHermesRoleSwitch({
        nextAgent: "custom:hermes-homeops",
        currentAgent: "hermes",
      })
    ).toBe("retarget")
  })
})

describe("hermes resume skip across a live role switch", () => {
  it("omits the session id for every surface the moment skip is set", () => {
    expect(
      hermesResumeSessionId({
        skipForAgent: "custom:hermes-company",
        persistedSessionId: "old-sess",
      })
    ).toBeUndefined()
  })

  it("resumes the persisted id when no switch is in flight", () => {
    expect(
      hermesResumeSessionId({
        skipForAgent: null,
        persistedSessionId: "old-sess",
      })
    ).toBe("old-sess")
  })

  it("does not clear skip while the previous role is still connected", () => {
    expect(
      shouldClearHermesResumeSkip({
        skipForAgent: "custom:hermes-company",
        liveAgent: "hermes",
        liveStatus: "connected",
        liveSessionId: "old-sess",
      })
    ).toBe(false)
  })

  it("does not clear skip until the new role has its own session id", () => {
    expect(
      shouldClearHermesResumeSkip({
        skipForAgent: "custom:hermes-company",
        liveAgent: "custom:hermes-company",
        liveStatus: "connected",
        liveSessionId: null,
      })
    ).toBe(false)
  })

  it("clears skip only after the new role is connected with a session", () => {
    expect(
      shouldClearHermesResumeSkip({
        skipForAgent: "custom:hermes-company",
        liveAgent: "custom:hermes-company",
        liveStatus: "connected",
        liveSessionId: "new-sess",
      })
    ).toBe(true)
  })

  it("shares skip across surfaces by conversation id", () => {
    beginHermesRoleSwitch(256, "custom:hermes-learn")
    expect(hermesRoleSwitchSkipFor(256)).toBe("custom:hermes-learn")
    expect(hermesRoleSwitchSkipFor(1)).toBeNull()
    clearHermesRoleSwitchSkip(256)
    expect(hermesRoleSwitchSkipFor(256)).toBeNull()
  })
})

describe("hermesRoleLabel i18n", () => {
  const locales = [
    ["en", en],
    ["ar", ar],
    ["de", de],
    ["es", es],
    ["fr", fr],
    ["ja", ja],
    ["ko", ko],
    ["pt", pt],
    ["zh-CN", zhCN],
    ["zh-TW", zhTW],
  ] as const

  it("every locale has a non-empty Folder.chat.messageInput.hermesRoleLabel", () => {
    for (const [locale, messages] of locales) {
      const label = (
        messages as {
          Folder: { chat: { messageInput: { hermesRoleLabel?: string } } }
        }
      ).Folder.chat.messageInput.hermesRoleLabel
      expect(label, locale).toEqual(expect.any(String))
      expect(label?.length, locale).toBeGreaterThan(0)
    }
  })
})
