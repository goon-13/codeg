"use client"

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { nextFlag } from "./run-reveal-model"

export type RunRevealValue = {
  toolsExpanded: boolean
  thinkingHidden: boolean
  focusToolCallId: string | null
  toggleTools: () => void
  toggleThinking: () => void
  focusTool: (id: string | null) => void
}

const DEFAULT: RunRevealValue = {
  toolsExpanded: false,
  thinkingHidden: false,
  focusToolCallId: null,
  toggleTools: () => {},
  toggleThinking: () => {},
  focusTool: () => {},
}

const RunRevealContext = createContext<RunRevealValue | null>(null)

export function useRunReveal(): RunRevealValue {
  return useContext(RunRevealContext) ?? DEFAULT
}

export function RunRevealProvider({
  children,
  initial,
}: {
  children: ReactNode
  initial?: { toolsExpanded?: boolean; thinkingHidden?: boolean }
}) {
  const [toolsExpanded, setToolsExpanded] = useState(
    () => initial?.toolsExpanded ?? false
  )
  const [thinkingHidden, setThinkingHidden] = useState(
    () => initial?.thinkingHidden ?? false
  )
  const [focusToolCallId, setFocusToolCallId] = useState<string | null>(null)
  const toggleTools = useCallback(() => {
    setToolsExpanded((v) => nextFlag(v))
  }, [])
  const toggleThinking = useCallback(() => {
    setThinkingHidden((v) => nextFlag(v))
  }, [])
  const focusTool = useCallback((id: string | null) => {
    setFocusToolCallId(id)
  }, [])
  const value = useMemo(
    () => ({
      toolsExpanded,
      thinkingHidden,
      focusToolCallId,
      toggleTools,
      toggleThinking,
      focusTool,
    }),
    [toolsExpanded, thinkingHidden, focusToolCallId, toggleTools, toggleThinking, focusTool]
  )
  return (
    <RunRevealContext.Provider value={value}>
      {children}
    </RunRevealContext.Provider>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest("input, textarea, [contenteditable=true], [role=textbox]")
  )
}

export const RunRevealSurface = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(function RunRevealSurface({ children, className }, ref) {
  const reveal = useRunReveal()
  const localRef = useRef<HTMLDivElement | null>(null)
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )
  const handleAlt = useCallback(
    (event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; key: string; target: EventTarget | null; preventDefault: () => void }) => {
      if (isEditableTarget(event.target)) return
      if (!event.altKey || event.ctrlKey || event.metaKey) return
      const root = localRef.current
      if (!root) return
      const target = event.target
      const active = document.activeElement
      const nodeInside = (node: EventTarget | null) =>
        node instanceof Node && (root === node || root.contains(node))
      if (!nodeInside(target) && !nodeInside(active)) return
      const key = event.key.toLowerCase()
      if (key === "o") {
        event.preventDefault()
        reveal.toggleTools()
      }
      if (key === "t") {
        event.preventDefault()
        reveal.toggleThinking()
      }
    },
    [reveal]
  )
  useEffect(() => {
    const onWindow = (event: globalThis.KeyboardEvent) => {
      handleAlt(event)
    }
    window.addEventListener("keydown", onWindow)
    return () => window.removeEventListener("keydown", onWindow)
  }, [handleAlt])
  return (
    <div
      ref={setRefs}
      className={className}
      tabIndex={-1}
      data-run-reveal-surface=""
    >
      {children}
    </div>
  )
})
