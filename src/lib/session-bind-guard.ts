/**
 * Whether sending `targetConversationId` on a live ACP session would try to
 * bind a session another Codeg row already holds. Backend `bind_external_id`
 * refuses that (and must keep refusing — we do not implement "move session").
 * Callers must spawn `session/new` for the target row instead of
 * `send_prompt_linked` on the foreign session.
 */
export function wouldBindForeignSession(
  targetConversationId: number | null | undefined,
  holderConversationId: number | null | undefined
): boolean {
  if (targetConversationId == null || targetConversationId <= 0) return false
  if (holderConversationId == null || holderConversationId <= 0) return false
  return holderConversationId !== targetConversationId
}

/** Named-session orphan rescue may rekey only onto the row that already holds it. */
export function shouldRekeyNamedSession(
  destConversationId: number | null | undefined,
  holderConversationId: number | null | undefined
): boolean {
  if (destConversationId == null || destConversationId <= 0) return true
  if (holderConversationId == null || holderConversationId <= 0) return true
  return holderConversationId === destConversationId
}
