import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"
import { RunRevealProvider } from "@/components/session-dashboard/run-reveal-context"
import enMessages from "@/i18n/messages/en.json"
import { ToolGroupPart } from "./tool-group-part"
import type { AdaptedToolCallPart, AdaptedToolGroupPart } from "./tool-group-part"

const call: AdaptedToolCallPart = {
  type: "tool-call",
  toolCallId: "t1",
  toolName: "read",
  input: "{}",
  output: "ok",
  state: "output-available",
}

const group: AdaptedToolGroupPart = {
  type: "tool-group",
  items: [call],
  isStreaming: false,
}

function wrap(
  initial?: { toolsExpanded?: boolean; focusToolCallId?: string }
) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RunRevealProvider initial={initial}>
        <ToolGroupPart
          part={group}
          renderItem={(item) => (
            <div data-tool-call-id={item.toolCallId}>{item.output}</div>
          )}
        />
      </RunRevealProvider>
    </NextIntlClientProvider>
  )
}

describe("ToolGroupPart run reveal", () => {
  it("keeps the group closed by default", () => {
    render(wrap())
    expect(screen.queryByText("ok")).toBeNull()
  })

  it("opens grouped tool cards when toolsExpanded", () => {
    render(wrap({ toolsExpanded: true }))
    expect(screen.getByText("ok")).toBeTruthy()
  })
})
