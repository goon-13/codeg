import { formatConversationTitle } from "@/lib/conversation-title"

/**
 * Temporary title filter for the home conversation list.
 * A blank query returns the same array. Otherwise the haystack is the
 * display title (`formatConversationTitle`, falling back to `untitled`
 * when that is empty) — not the raw stored string.
 */
export function filterHomeListConversations<
  T extends { title?: string | null },
>(convs: readonly T[], query: string, untitled: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return convs as T[]
  return convs.filter((conv) => {
    const label = formatConversationTitle(conv.title) || untitled
    return label.toLowerCase().includes(needle)
  })
}
