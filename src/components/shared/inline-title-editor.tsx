"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import { useImeGuard } from "@/hooks/use-ime-guard"
import { normalizeTitle } from "@/lib/normalize-title"
import { cn } from "@/lib/utils"

export type InlineTitleEditorProps = {
  value: string
  restLabel: string
  maxChars: number
  editing: boolean
  onEditingChange: (editing: boolean) => void
  restOpensEditor: boolean
  onCommit: (next: string) => void | Promise<unknown>
  disabled?: boolean
  className?: string
  tabIndex?: number
  "aria-label"?: string
  "data-testid"?: string
}

export type InlineTitleEditorHandle = {
  start: () => void
  cancel: () => void
}

export const InlineTitleEditor = forwardRef<
  InlineTitleEditorHandle,
  InlineTitleEditorProps
>(function InlineTitleEditor(
  {
    value,
    restLabel,
    maxChars,
    editing,
    onEditingChange,
    restOpensEditor,
    onCommit,
    disabled = false,
    className,
    tabIndex,
    "aria-label": ariaLabel,
    "data-testid": testId = "inline-title-editor",
  },
  ref
) {
  const ime = useImeGuard()
  const [draft, setDraft] = useState(value)
  const suppressBlurRef = useRef(false)
  // Draft tracks `value` while open. Set during render so a parent that
  // flips `editing` without `start()` still shows `value`, not a stale draft.
  const [tracked, setTracked] = useState({ editing, value })
  if (tracked.editing !== editing || tracked.value !== value) {
    setTracked({ editing, value })
    if (editing) setDraft(value)
  }

  useEffect(() => {
    if (editing) suppressBlurRef.current = false
  }, [editing, value])

  const start = useCallback(() => {
    if (disabled) return
    onEditingChange(true)
  }, [disabled, onEditingChange])

  const cancel = useCallback(() => {
    if (disabled) return
    suppressBlurRef.current = true
    setDraft(value)
    onEditingChange(false)
  }, [disabled, onEditingChange, value])

  useImperativeHandle(ref, () => ({ start, cancel }), [start, cancel])

  const submit = useCallback(async () => {
    if (draft === value || draft.trim() === value.trim()) {
      onEditingChange(false)
      return
    }
    const next = normalizeTitle(draft, maxChars)
    if (next === null) {
      onEditingChange(false)
      return
    }
    try {
      await onCommit(next)
      onEditingChange(false)
    } catch {
      // caller rethrows; keep editing
    }
  }, [draft, value, maxChars, onCommit, onEditingChange])

  if (!editing) {
    return (
      <span
        data-testid={testId}
        className={cn(className, restOpensEditor && !disabled && "cursor-text")}
        tabIndex={disabled ? undefined : tabIndex}
        aria-label={ariaLabel}
        onClick={(event) => {
          if (!restOpensEditor || disabled) return
          event.stopPropagation()
          onEditingChange(true)
        }}
      >
        {restLabel}
      </span>
    )
  }

  return (
    <input
      data-testid="inline-title-editor-input"
      className={cn("min-w-0 flex-1 bg-transparent outline-none", className)}
      value={draft}
      autoFocus
      aria-label={ariaLabel}
      {...ime.props}
      onChange={(event) => {
        const next = event.target.value
        const scalars = [...next]
        setDraft(
          scalars.length > maxChars ? scalars.slice(0, maxChars).join("") : next
        )
      }}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (ime.isComposing(event)) return
        if (event.key === "Enter") {
          event.preventDefault()
          event.stopPropagation()
          void submit()
        }
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          cancel()
        }
      }}
      onBlur={() => {
        if (suppressBlurRef.current) {
          suppressBlurRef.current = false
          return
        }
        void submit()
      }}
    />
  )
})
