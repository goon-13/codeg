import { describe, expect, it } from "vitest"
import { blocksFromThreadItems } from "./blocks-from-thread"
import type { ThreadRenderItem } from "@/components/message/message-list-view"

function assistantItem(
  id: string,
  parts: ThreadRenderItem extends { kind: "turn" }
    ? ThreadRenderItem["group"]["parts"]
    : never
): ThreadRenderItem {
  return {
    key: `persisted-${id}`,
    kind: "turn",
    group: {
      id,
      role: "assistant",
      parts,
      resources: [],
      images: [],
    },
    phase: "persisted",
    isResponseComplete: true,
    showStats: false,
    isRoleTransition: false,
    previousUserIndex: null,
    isLastAssistantRun: false,
    isThreadTail: false,
    sourceTurns: [],
  }
}

describe("blocksFromThreadItems", () => {
  it("maps a read tool and text on the same thread index", () => {
    const items: ThreadRenderItem[] = [
      {
        key: "user-1",
        kind: "turn",
        group: {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "go" }],
          resources: [],
          images: [],
        },
        phase: "persisted",
        isResponseComplete: true,
        showStats: false,
        isRoleTransition: false,
        previousUserIndex: null,
        isLastAssistantRun: false,
        isThreadTail: false,
        sourceTurns: [],
      },
      assistantItem("a1", [
        {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "read",
          input: "/x.ts",
          state: "output-available",
        },
        { type: "text", text: "done" },
      ]),
    ]
    const blocks = blocksFromThreadItems(items)
    expect(blocks).toEqual([
      {
        threadIndex: 1,
        kind: "tool",
        toolName: "read",
        toolFailed: false,
        label: "read",
        size: 5,
        toolCallId: "t1",
      },
      {
        threadIndex: 1,
        kind: "text",
        label: "text",
        size: 4,
      },
    ])
  })
})
