import { CHAT_ONLY_PREAMBLE, type PlannedCall } from "./protocol"

const DENY = /reject|deny|拒绝|不允许|don't run|dont run|not allow|取消/i

export function pickDenyOption(
  options: { optionId: string; name: string }[]
): string | null {
  const hit = options.find((option) =>
    DENY.test(`${option.optionId} ${option.name}`)
  )
  return hit?.optionId ?? null
}

export function buildSeatPrompt(call: PlannedCall): string {
  if (call.prompt.startsWith(CHAT_ONLY_PREAMBLE)) return call.prompt
  return `${CHAT_ONLY_PREAMBLE}\n${call.prompt}`
}

export function extractAssistantText(
  messages: { role: string; blocks: { type: string; text?: string }[] }[]
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== "assistant") continue
    const text = message.blocks
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim()
    if (text) return text
  }
  return ""
}
