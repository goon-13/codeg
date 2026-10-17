import type { Editor } from "@tiptap/core"

import { PROMPT_VAR_RE } from "@/lib/prompt-library/prompt-model"

export type PlaceholderSpan = { name: string; start: number; end: number }

export function findPlaceholderSpans(text: string): PlaceholderSpan[] {
  const spans: PlaceholderSpan[] = []
  const re = new RegExp(PROMPT_VAR_RE.source, "g")
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    spans.push({
      name: match[1],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return spans
}

export function nextPlaceholderSpan(
  spans: PlaceholderSpan[],
  caret: number,
  direction: 1 | -1
): PlaceholderSpan | null {
  if (spans.length === 0) return null
  if (direction === 1) {
    return spans.find((span) => span.start >= caret) ?? spans[0]
  }
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].end <= caret) return spans[i]
  }
  return spans[spans.length - 1]
}

/** Select the next `{{…}}` in the current block. Returns false if none. */
export function selectPlaceholderInEditor(
  editor: Editor,
  direction: 1 | -1
): boolean {
  const { $from } = editor.state.selection
  if ($from.parent.type.spec.code) return false
  const text = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\n")
  const spans = findPlaceholderSpans(text)
  if (spans.length === 0) return false
  const span = nextPlaceholderSpan(spans, $from.parentOffset, direction)
  if (!span) return false
  const base = $from.start()
  editor
    .chain()
    .focus()
    .setTextSelection({ from: base + span.start, to: base + span.end })
    .run()
  return true
}
