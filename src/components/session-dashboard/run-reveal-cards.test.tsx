import { type ReactNode } from "react"
import { render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/ai-elements/link-safety", () => ({
  FilePathLink: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  useStreamdownLinkSafety: () => ({ enabled: false }),
}))

vi.mock("@/components/ai-elements/code-block", () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
}))

vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: ({ children }: { children: string }) => (
    <div>{children}</div>
  ),
}))

import { ContentPartsRenderer } from "@/components/message/content-parts-renderer"
import enMessages from "@/i18n/messages/en.json"
import type { AdaptedContentPart } from "@/lib/adapters/ai-elements-adapter"
import { RunRevealProvider } from "./run-reveal-context"

const settledSearch: AdaptedContentPart = {
  type: "tool-call",
  toolCallId: "t1",
  toolName: "grep",
  input: "keep-mount",
  output: "src/shelf-keep-alive.ts:41: keepMounted",
  state: "output-available",
}

function wrap(
  ui: ReactNode,
  initial?: { toolsExpanded?: boolean; thinkingHidden?: boolean }
) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <RunRevealProvider initial={initial}>{ui}</RunRevealProvider>
    </NextIntlClientProvider>
  )
}

describe("run reveal cards", () => {
  it("shows settled tool output when toolsExpanded", async () => {
    render(
      wrap(
        <ContentPartsRenderer parts={[settledSearch]} role="assistant" />,
        { toolsExpanded: true }
      )
    )
    await waitFor(() => {
      expect(screen.getByText(/keepMounted/)).toBeTruthy()
    })
    expect(document.querySelector("[data-tool-call-id=t1]")).toBeTruthy()
  })

  it("shows hidden read output when toolsExpanded", async () => {
    const settledRead: AdaptedContentPart = {
      type: "tool-call",
      toolCallId: "r1",
      toolName: "read",
      input: JSON.stringify({ path: "src/keep.ts" }),
      output: "export const keep = 1",
      state: "output-available",
    }
    const hidden = render(
      wrap(<ContentPartsRenderer parts={[settledRead]} role="assistant" />)
    )
    expect(screen.queryByText(/export const keep/)).toBeNull()
    hidden.unmount()
    render(
      wrap(<ContentPartsRenderer parts={[settledRead]} role="assistant" />, {
        toolsExpanded: true,
      })
    )
    await waitFor(() => {
      expect(screen.getAllByText(/export const keep/).length).toBeGreaterThan(0)
      expect(
        document.querySelector("[data-tool-call-id=r1][data-state=open]")
      ).toBeTruthy()
    })
  })

  it("hides Thought when thinkingHidden", () => {
    render(
      wrap(
        <ContentPartsRenderer
          parts={[
            { type: "reasoning", content: "plan the sweep", isStreaming: false },
          ]}
          role="assistant"
        />,
        { thinkingHidden: true }
      )
    )
    expect(screen.queryByRole("button", { name: /thought/i })).toBeNull()
    expect(screen.queryByText(/plan the sweep/i)).toBeNull()
  })
})
