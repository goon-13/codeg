import { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  InlineTitleEditor,
  type InlineTitleEditorHandle,
} from "./inline-title-editor"

function Shell({
  value = "stored",
  restLabel = "stored",
  restOpensEditor = true,
  maxChars = 80,
  disabled = false,
  onCommit = vi.fn(async () => {}),
}: {
  value?: string
  restLabel?: string
  restOpensEditor?: boolean
  maxChars?: number
  disabled?: boolean
  onCommit?: (next: string) => void | Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  return editing ? (
    <div data-testid="shell">
      <InlineTitleEditor
        value={value}
        restLabel={restLabel}
        maxChars={maxChars}
        editing={editing}
        onEditingChange={setEditing}
        restOpensEditor={restOpensEditor}
        onCommit={onCommit}
        disabled={disabled}
        data-testid="inline-title-editor"
      />
    </div>
  ) : (
    <button type="button" data-testid="shell">
      <InlineTitleEditor
        value={value}
        restLabel={restLabel}
        maxChars={maxChars}
        editing={editing}
        onEditingChange={setEditing}
        restOpensEditor={restOpensEditor}
        onCommit={onCommit}
        disabled={disabled}
        data-testid="inline-title-editor"
      />
    </button>
  )
}

describe("InlineTitleEditor", () => {
  it("rest root is a span, not a button", () => {
    render(<Shell />)
    const rest = screen.getByTestId("inline-title-editor")
    expect(rest.tagName).toBe("SPAN")
  })

  it("click rest with restOpensEditor swaps parent to div+input in the same render", () => {
    render(<Shell />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    expect(document.querySelector("button input")).toBeNull()
    expect(screen.getByTestId("shell").tagName).toBe("DIV")
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
  })

  it("cancel() returns to span", () => {
    const ref = { current: null as InlineTitleEditorHandle | null }
    function CancelShell() {
      const [editing, setEditing] = useState(false)
      return (
        <>
          <button type="button" onClick={() => ref.current?.cancel()}>
            abort
          </button>
          {editing ? (
            <div>
              <InlineTitleEditor
                ref={ref}
                value="stored"
                restLabel="stored"
                maxChars={80}
                editing={editing}
                onEditingChange={setEditing}
                restOpensEditor
                onCommit={vi.fn()}
                data-testid="inline-title-editor"
              />
            </div>
          ) : (
            <span>
              <InlineTitleEditor
                ref={ref}
                value="stored"
                restLabel="stored"
                maxChars={80}
                editing={editing}
                onEditingChange={setEditing}
                restOpensEditor
                onCommit={vi.fn()}
                data-testid="inline-title-editor"
              />
            </span>
          )}
        </>
      )
    }
    render(<CancelShell />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
    fireEvent.click(screen.getByText("abort"))
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
    expect(screen.getByTestId("inline-title-editor").tagName).toBe("SPAN")
  })

  it("restOpensEditor false does not call onEditingChange", () => {
    const onEditingChange = vi.fn()
    render(
      <InlineTitleEditor
        value="stored"
        restLabel="stored"
        maxChars={80}
        editing={false}
        onEditingChange={onEditingChange}
        restOpensEditor={false}
        onCommit={vi.fn()}
        data-testid="inline-title-editor"
      />
    )
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    expect(onEditingChange).not.toHaveBeenCalled()
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })

  it("unchanged 100-char stored Enter/blur does not onCommit", () => {
    const stored = "x".repeat(100)
    const onCommit = vi.fn(async () => {})
    render(<Shell value={stored} restLabel={stored} onCommit={onCommit} />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    const input = screen.getByTestId("inline-title-editor-input")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    fireEvent.blur(screen.getByTestId("inline-title-editor-input"))
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })

  it("empty Enter is Esc: no onCommit, leaves editing", async () => {
    const onCommit = vi.fn(async () => {})
    render(<Shell onCommit={onCommit} />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    const input = screen.getByTestId("inline-title-editor-input")
    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })

  it("IME confirming Enter does not commit", () => {
    const onCommit = vi.fn(async () => {})
    render(<Shell onCommit={onCommit} />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    const input = screen.getByTestId("inline-title-editor-input")
    fireEvent.change(input, { target: { value: "nihao" } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
  })

  it("disabled rest does not enter editing", () => {
    render(<Shell disabled />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })

  it("reject keeps editing", async () => {
    const onCommit = vi.fn(async () => {
      throw new Error("nope")
    })
    render(<Shell onCommit={onCommit} />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    const input = screen.getByTestId("inline-title-editor-input")
    fireEvent.change(input, { target: { value: "next" } })
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" })
    })
    expect(onCommit).toHaveBeenCalledWith("next")
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
  })

  it("start() calls onEditingChange(true)", () => {
    const ref = { current: null as InlineTitleEditorHandle | null }
    function StartShell() {
      const [editing, setEditing] = useState(false)
      return (
        <>
          <button type="button" onClick={() => ref.current?.start()}>
            f2
          </button>
          <InlineTitleEditor
            ref={ref}
            value="stored"
            restLabel="stored"
            maxChars={80}
            editing={editing}
            onEditingChange={setEditing}
            restOpensEditor
            onCommit={vi.fn()}
            data-testid="inline-title-editor"
          />
        </>
      )
    }
    render(<StartShell />)
    fireEvent.click(screen.getByText("f2"))
    expect(screen.getByTestId("inline-title-editor-input")).toBeTruthy()
  })

  it("Escape does not commit even if blur follows", () => {
    const onCommit = vi.fn(async () => {})
    // React flushes editing=false inside keyDown's act(), so a blur after
    // that line hits a detached node and never reaches onBlur. Blur while
    // cancel() is still inside onEditingChange, before the input unmounts.
    function EscapeShell() {
      const [editing, setEditing] = useState(false)
      return (
        <InlineTitleEditor
          value="stored"
          restLabel="stored"
          maxChars={80}
          editing={editing}
          onEditingChange={(next) => {
            const node = document.querySelector(
              "[data-testid='inline-title-editor-input']"
            )
            if (!next && node instanceof HTMLElement) fireEvent.blur(node)
            setEditing(next)
          }}
          restOpensEditor
          onCommit={onCommit}
          data-testid="inline-title-editor"
        />
      )
    }
    render(<EscapeShell />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    const input = screen.getByTestId("inline-title-editor-input")
    fireEvent.change(input, { target: { value: "draft" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.queryByTestId("inline-title-editor-input")).toBeNull()
  })

  it("typing past maxChars slices input but does not slice unedited stored", () => {
    const stored = "x".repeat(100)
    render(<Shell value={stored} restLabel={stored} maxChars={80} />)
    fireEvent.click(screen.getByTestId("inline-title-editor"))
    const input = screen.getByTestId(
      "inline-title-editor-input"
    ) as HTMLInputElement
    expect(input.value).toBe(stored)
    fireEvent.change(input, { target: { value: stored + "y" } })
    expect([...input.value].length).toBe(80)
  })
})
