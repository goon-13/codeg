import { ALL_AGENT_TYPES, type BuiltinAgentType } from "@/lib/types"

export type ParsedSearchQuery = {
  text: string
  agent: string | null
  scope: "folder" | "all"
  after: string | null // YYYY-MM-DD or null
}

/** Builtin agent ids. `claude` maps to `claude_code`; it is not in the set. */
export const DEFAULT_AGENT_TOKENS: ReadonlySet<string> = new Set(
  ALL_AGENT_TYPES
)

const AGENT_ALIASES: Readonly<Record<string, BuiltinAgentType>> = {
  claude: "claude_code",
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// `\d{4}-\d{2}-\d{2}` accepts 2026-02-31. Round-trip through UTC so a
// non-civil date stays in the query text.
function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function resolveAgent(
  token: string,
  knownAgents: ReadonlySet<string>
): string | null {
  if (knownAgents.has(token)) return token
  const aliased = AGENT_ALIASES[token]
  if (aliased !== undefined && knownAgents.has(aliased)) return aliased
  return null
}

export function parseSearchQuery(
  raw: string,
  knownAgents: ReadonlySet<string> = DEFAULT_AGENT_TOKENS
): ParsedSearchQuery {
  let agent: string | null = null
  let scope: ParsedSearchQuery["scope"] = "folder"
  let after: string | null = null
  const text: string[] = []

  for (const token of raw.trim().split(/\s+/)) {
    if (token.length === 0) continue
    if (token.startsWith("agent:")) {
      const resolved = resolveAgent(token.slice("agent:".length), knownAgents)
      if (resolved !== null) {
        agent = resolved
        continue
      }
    } else if (token === "in:all" || token === "in:folder") {
      scope = token === "in:all" ? "all" : "folder"
      continue
    } else if (token.startsWith("after:")) {
      const date = token.slice("after:".length)
      if (isCalendarDate(date)) {
        after = date
        continue
      }
    }
    text.push(token)
  }

  return { text: text.join(" "), agent, scope, after }
}

const HAN = /\p{Script=Han}/u

export function queryHasHan(text: string): boolean {
  return HAN.test(text)
}
