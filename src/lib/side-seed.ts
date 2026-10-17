import type { ContentBlock, MessageTurn } from "@/lib/types"

export const SIDE_SEED_PREFIX =
  "你是旁问，父历史只作参考，不要把这段复述进可见回复。"

const TURN_CHARS = 1500
const PACKET_CHARS = 4000
const MIN_TURNS = 2
const MAX_TURNS = 4

const SIDE_SLASH = /^(?:\/side|\/btw)\b/i

export function parseSideSlash(
  input: string
): { cmd: "side"; question: string } | null {
  const trimmed = input.trim()
  const match = SIDE_SLASH.exec(trimmed)
  if (!match) return null
  return { cmd: "side", question: trimmed.slice(match[0].length).trim() }
}

/**
 * Non-null means the composer must return before prompting the source
 * session and open a side row instead. Null means send on the source as usual.
 * A second call is another open — 1:N is not collapsed here.
 */
export function planSideIntercept(input: {
  kind: string | null | undefined
  hasDbId: boolean
  text: string
}): { question: string } | null {
  if (input.kind !== "regular" || !input.hasDbId) return null
  const parsed = parseSideSlash(input.text)
  if (!parsed) return null
  return { question: parsed.question.trim() }
}

function textFromBlocks(blocks: ContentBlock[]): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type !== "text") continue
    const text = block.text.trim()
    if (text) parts.push(text)
  }
  return parts.join("\n")
}

/** User/assistant text only. System, tool, and empty turns are dropped. */
export function sideSeedSourceTurns(
  turns: Pick<MessageTurn, "role" | "blocks">[]
): { role: "user" | "assistant"; text: string }[] {
  const out: { role: "user" | "assistant"; text: string }[] = []
  for (const turn of turns) {
    if (turn.role !== "user" && turn.role !== "assistant") continue
    const text = textFromBlocks(turn.blocks)
    if (!text) continue
    out.push({ role: turn.role, text })
  }
  return out
}

function clipTurn(text: string): string {
  if (text.length <= TURN_CHARS) return text
  return text.slice(0, TURN_CHARS - 1) + "…"
}

/** Prefix plus the last 2–4 user/assistant turns. Empty input is just the prefix. */
export function buildSideSeed(
  turns: { role: "user" | "assistant"; text: string }[]
): string {
  const clipped = turns.slice(-MAX_TURNS).map((turn) => {
    const label = turn.role === "user" ? "用户" : "助手"
    return `${label}：${clipTurn(turn.text)}`
  })
  const join = (parts: string[]) =>
    parts.length === 0
      ? SIDE_SEED_PREFIX
      : `${SIDE_SEED_PREFIX}\n${parts.join("\n")}`
  let packet = join(clipped)
  while (clipped.length > MIN_TURNS && packet.length > PACKET_CHARS) {
    clipped.shift()
    packet = join(clipped)
  }
  if (packet.length > PACKET_CHARS) return packet.slice(0, PACKET_CHARS)
  return packet
}

export function isSideSeedText(text: string): boolean {
  return text.startsWith(SIDE_SEED_PREFIX)
}
