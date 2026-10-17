import type { AdaptedContentPart } from "@/lib/adapters/ai-elements-adapter"
import type { ThreadRenderItem } from "@/components/message/message-list-view"
import type { DashboardBlock } from "./dashboard-model"

function flattenParts(parts: AdaptedContentPart[]): AdaptedContentPart[] {
  const out: AdaptedContentPart[] = []
  for (const part of parts) {
    if (part.type === "tool-group") {
      out.push(...part.items)
      continue
    }
    out.push(part)
  }
  return out
}

function sizeOf(value: string | null | undefined): number {
  const n = value?.length ?? 0
  return n > 0 ? n : 1
}

export function blocksFromThreadItems(
  items: readonly ThreadRenderItem[]
): DashboardBlock[] {
  const blocks: DashboardBlock[] = []
  items.forEach((item, threadIndex) => {
    if (item.kind !== "turn") return
    if (item.group.role !== "assistant") return
    for (const part of flattenParts(item.group.parts)) {
      if (part.type === "text") {
        blocks.push({
          threadIndex,
          kind: "text",
          label: "text",
          size: sizeOf(part.text),
        })
        continue
      }
      if (part.type === "reasoning") {
        blocks.push({
          threadIndex,
          kind: "thinking",
          label: "think",
          size: sizeOf(part.content),
        })
        continue
      }
      if (part.type === "tool-call") {
        const failed =
          part.state === "output-error" || Boolean(part.errorText)
        blocks.push({
          threadIndex,
          kind: "tool",
          toolName: part.toolName,
          toolFailed: failed,
          label: part.displayTitle || part.toolName,
          size: sizeOf(part.input ?? part.output),
          ...(part.toolCallId ? { toolCallId: part.toolCallId } : {}),
        })
      }
    }
  })
  return blocks
}
