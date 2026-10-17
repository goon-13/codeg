export type AcpWaitingKind = "question" | "permission" | "plan" | null

/** What the ACP connection is blocked on, if anything. WorkTask review is not this. */
export function acpWaitingKind(
  conn:
    | {
        pendingAskQuestion?: unknown
        pendingPlanApproval?: unknown
        pendingPermission?: unknown
      }
    | null
    | undefined
): AcpWaitingKind {
  if (!conn) return null
  if (conn.pendingAskQuestion) return "question"
  if (conn.pendingPlanApproval) return "plan"
  if (conn.pendingPermission) return "permission"
  return null
}
