import { useCallback, useSyncExternalStore } from "react"
import { isModelConfigOption } from "@/lib/model-config-groups"
import type { AgentType, SessionConfigOptionInfo } from "@/lib/types"

export const HERMES_PROFILE_CONFIG_ID = "codeg:hermes-profile"

const CUSTOM_HERMES_PREFIX = "custom:hermes-"

export type HermesProfileAgentInfo = {
  agent_type: AgentType
  name: string
  enabled: boolean
}

export function isHermesFamilyAgent(agentType: AgentType): boolean {
  return agentType === "hermes" || agentType.startsWith(CUSTOM_HERMES_PREFIX)
}

/** Top AgentSelector shows one Hermes. `custom:hermes-*` are Role options. */
export function isAgentSelectorVisibleType(agentType: AgentType): boolean {
  return !agentType.startsWith(CUSTOM_HERMES_PREFIX)
}

function isEnabledHermesProfileAgent(agent: HermesProfileAgentInfo): boolean {
  return agent.enabled && isHermesFamilyAgent(agent.agent_type)
}

export function buildHermesProfileOption(args: {
  currentAgent: AgentType
  agents: HermesProfileAgentInfo[]
  label: string
}): SessionConfigOptionInfo | null {
  if (!isHermesFamilyAgent(args.currentAgent)) return null

  return {
    id: HERMES_PROFILE_CONFIG_ID,
    name: args.label,
    kind: {
      type: "select",
      current_value: args.currentAgent,
      options: args.agents.filter(isEnabledHermesProfileAgent).map((agent) => ({
        value: agent.agent_type,
        name: agent.name,
      })),
      groups: [],
    },
  }
}

export function mergeHermesProfileOption(
  configOptions: SessionConfigOptionInfo[],
  args: {
    currentAgent: AgentType
    agents: HermesProfileAgentInfo[]
    label: string
  }
): SessionConfigOptionInfo[] {
  const option = buildHermesProfileOption(args)
  if (!option) return configOptions
  return [option, ...configOptions]
}

/** Null means the caller must send ACP set_config_option. A string is the
 *  `agent_type` for an in-place role switch — never send this id to ACP. */
export function interceptHermesProfileConfigChange(
  configId: string,
  value: string
): AgentType | null {
  if (configId !== HERMES_PROFILE_CONFIG_ID) return null
  return value
}

/**
 * Role list is usable once any enabled Hermes-family agent is in the
 * registry, or a fetch has finished (even if the list is empty — don't
 * spin the composer forever).
 */
export function hermesRoleListReady(
  agents: HermesProfileAgentInfo[],
  fresh: boolean
): boolean {
  if (agents.some(isEnabledHermesProfileAgent)) return true
  return fresh
}

export type HermesSelectorCacheEntry = {
  configOptions?: SessionConfigOptionInfo[] | null
} | null

/**
 * Live `configOptions: []` is truthy, so `?? cache` never runs and Role
 * waits on session/new (~35s). Prefer a cached model list until the live
 * connection advertises one.
 */
export function hermesCachedConfigOptions(
  currentAgent: AgentType,
  getCached: (agentType: string) => HermesSelectorCacheEntry
): SessionConfigOptionInfo[] | null {
  if (!isHermesFamilyAgent(currentAgent)) return null
  const own = getCached(currentAgent)?.configOptions ?? null
  if (own?.some(isModelConfigOption)) return own
  if (currentAgent !== "hermes") {
    const fallback = getCached("hermes")?.configOptions ?? null
    if (fallback?.some(isModelConfigOption)) return fallback
  }
  return own
}

export function hermesLiveOrCachedConfigOptions(args: {
  currentAgent: AgentType
  liveSelectorsReady: boolean
  liveConfigOptions: SessionConfigOptionInfo[] | null
  cachedConfigOptions: SessionConfigOptionInfo[] | null
}): SessionConfigOptionInfo[] | null {
  if (!isHermesFamilyAgent(args.currentAgent)) return args.liveConfigOptions
  if (args.liveSelectorsReady) return args.liveConfigOptions
  if (args.liveConfigOptions?.some(isModelConfigOption)) {
    return args.liveConfigOptions
  }
  if (args.cachedConfigOptions?.some(isModelConfigOption)) {
    return args.cachedConfigOptions
  }
  return args.liveConfigOptions
}

/**
 * Role list is enough to leave the init spinner. Model joins from live or
 * cache. Empty `[]` must not park the composer on session/new.
 */
export function hermesComposerAcpReady(args: {
  currentAgent: AgentType
  acpConfigOptions: SessionConfigOptionInfo[] | null
  agentsReady: boolean
  liveSelectorsReady: boolean
}): boolean {
  if (!isHermesFamilyAgent(args.currentAgent)) return true
  return args.agentsReady
}

/**
 * Hold the Hermes composer chips until Role and the ACP options can paint
 * together. Grok is untouched.
 */
export function hermesComposerConfigOptions(args: {
  currentAgent: AgentType
  acpConfigOptions: SessionConfigOptionInfo[] | null
  agents: HermesProfileAgentInfo[]
  agentsReady: boolean
  liveSelectorsReady: boolean
  label: string
}): SessionConfigOptionInfo[] {
  if (!isHermesFamilyAgent(args.currentAgent)) {
    return args.acpConfigOptions ?? []
  }
  if (
    !hermesComposerAcpReady({
      currentAgent: args.currentAgent,
      acpConfigOptions: args.acpConfigOptions,
      agentsReady: args.agentsReady,
      liveSelectorsReady: args.liveSelectorsReady,
    })
  ) {
    return []
  }
  return mergeHermesProfileOption(args.acpConfigOptions ?? [], {
    currentAgent: args.currentAgent,
    agents: args.agents,
    label: args.label,
  })
}

export function hermesComposerSelectorsPending(args: {
  currentAgent: AgentType
  acpConfigOptions: SessionConfigOptionInfo[] | null
  agentsReady: boolean
  liveSelectorsReady: boolean
}): boolean {
  return (
    isHermesFamilyAgent(args.currentAgent) &&
    !hermesComposerAcpReady(args)
  )
}

/** Same conversation, new Hermes profile. Same agent: no-op. */
export function planHermesRoleSwitch(args: {
  nextAgent: AgentType
  currentAgent: AgentType
}): "noop" | "retarget" {
  if (args.nextAgent === args.currentAgent) return "noop"
  return "retarget"
}

/**
 * Conversation-scoped: panel and canvas both connect the same row, so a
 * per-component skip leaves the other surface free to `session/load` the
 * previous HERMES_HOME id and hang.
 */
const hermesRoleSwitchSkip = new Map<number, AgentType>()
const hermesRoleSwitchSkipListeners = new Set<() => void>()

function emitHermesRoleSwitchSkip(): void {
  for (const listener of hermesRoleSwitchSkipListeners) listener()
}

export function subscribeHermesRoleSwitchSkip(listener: () => void): () => void {
  hermesRoleSwitchSkipListeners.add(listener)
  return () => {
    hermesRoleSwitchSkipListeners.delete(listener)
  }
}

export function hermesRoleSwitchSkipFor(
  conversationId: number | null | undefined
): AgentType | null {
  if (conversationId == null) return null
  return hermesRoleSwitchSkip.get(conversationId) ?? null
}

export function beginHermesRoleSwitch(
  conversationId: number,
  nextAgent: AgentType
): void {
  hermesRoleSwitchSkip.set(conversationId, nextAgent)
  emitHermesRoleSwitchSkip()
}

export function clearHermesRoleSwitchSkip(conversationId: number): void {
  if (!hermesRoleSwitchSkip.delete(conversationId)) return
  emitHermesRoleSwitchSkip()
}

export function useHermesRoleSwitchSkip(
  conversationId: number | null | undefined
): AgentType | null {
  const getSnapshot = useCallback(
    () => hermesRoleSwitchSkipFor(conversationId),
    [conversationId]
  )
  return useSyncExternalStore(
    subscribeHermesRoleSwitchSkip,
    getSnapshot,
    getSnapshot
  )
}

/**
 * While any surface is retargeting this conversation, omit the session id.
 * Hermes sessions live per HERMES_HOME; loading the previous id into the
 * new profile hangs in session/load. Do not wait until `selectedAgent`
 * matches — the other surface may already be on the new role.
 */
export function hermesResumeSessionId(args: {
  skipForAgent: AgentType | null
  persistedSessionId: string | null | undefined
}): string | undefined {
  if (args.skipForAgent != null) return undefined
  return args.persistedSessionId ?? undefined
}

export function shouldClearHermesResumeSkip(args: {
  skipForAgent: AgentType | null
  liveAgent: AgentType | null
  liveStatus: string | null
  liveSessionId?: string | null
}): boolean {
  if (args.skipForAgent == null) return false
  if (args.liveAgent !== args.skipForAgent) return false
  if (args.liveStatus !== "connected" && args.liveStatus !== "prompting") {
    return false
  }
  return Boolean(args.liveSessionId)
}
