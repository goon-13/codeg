import type { MessageTurn } from "@/lib/types"

export const HANDOFF_TURN_CHARS = 1500
export const HANDOFF_PACKET_CHARS = 8000
export const HANDOFF_FILE_LIMIT = 20
export const HANDOFF_TURN_PAIRS = 4
const PLACEHOLDER = "（未抽出，请改）"

export function buildHandoffPacket(input: {
  goal: string
  sourceTitle: string
  done?: string
  blocked?: string
  files?: string[]
  decisions?: string
  dont?: string
  turns: { role: "user" | "assistant"; text: string }[]
}): string {
  const goal = input.goal.trim() || PLACEHOLDER
  const files =
    input.files && input.files.length > 0
      ? input.files.slice(0, HANDOFF_FILE_LIMIT).join("\n")
      : PLACEHOLDER
  const lines = [
    `目标：${goal}`,
    `已做：${input.done?.trim() || PLACEHOLDER}`,
    `未做 / 卡住：${input.blocked?.trim() || PLACEHOLDER}`,
    `文件：${files}`,
    `决定：${input.decisions?.trim() || PLACEHOLDER}`,
    `不要：${input.dont?.trim() || PLACEHOLDER}`,
  ]
  const turns = input.turns.slice(-HANDOFF_TURN_PAIRS * 2)
  const clipped = turns.map((t) => {
    const body =
      t.text.length > HANDOFF_TURN_CHARS
        ? t.text.slice(0, HANDOFF_TURN_CHARS) + "…"
        : t.text
    return `${t.role === "user" ? "用户" : "助手"}：${body}`
  })
  let packet = [...lines, ...clipped].join("\n")
  if (packet.length <= HANDOFF_PACKET_CHARS) return packet
  while (clipped.length > 0 && packet.length > HANDOFF_PACKET_CHARS) {
    clipped.shift()
    packet = [...lines, ...clipped].join("\n")
  }
  if (packet.length > HANDOFF_PACKET_CHARS) {
    return packet.slice(0, HANDOFF_PACKET_CHARS)
  }
  return packet
}

export function extractHandoffTurns(
  turns: readonly MessageTurn[]
): { role: "user" | "assistant"; text: string }[] {
  const out: { role: "user" | "assistant"; text: string }[] = []
  for (const turn of turns) {
    if (turn.role !== "user" && turn.role !== "assistant") continue
    const text = turn.blocks
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim()
    if (!text) continue
    out.push({ role: turn.role, text })
  }
  return out.slice(-HANDOFF_TURN_PAIRS * 2)
}

export function extractHandoffFiles(_turns: readonly MessageTurn[]): string[] {
  // Spec: do not regex-mine tool JSON. Path lists come from a dedicated
  // field later; P0 leaves the packet placeholder for the user to edit.
  return []
}
