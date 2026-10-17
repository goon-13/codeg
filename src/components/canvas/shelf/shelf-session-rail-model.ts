import { nestFolderBucketByCluster } from "@/components/conversations/sidebar-conversation-grouping"
import type { DbConversationSummary } from "@/lib/types"

export type ShelfRailRow =
  | { kind: "folder"; folderId: number; title: string }
  | {
      kind: "cluster"
      clusterId: number
      title: string
      memberCount: number
      agentTypes: string[]
      expanded: boolean
      depth: number
    }
  | {
      kind: "conversation"
      conversation: DbConversationSummary
      depth: number
    }

const EMPTY_EXPANDED: ReadonlySet<number> = new Set()
const EMPTY_CHILDREN: ReadonlyMap<number, readonly DbConversationSummary[]> =
  new Map()

/**
 * Workset → shelf rail rows. Depth is relative to the folder body; the folder
 * header is not a level. A folder with no visible regular is omitted. Side and
 * delegate children are not required to be in `visibleConversationIds`.
 */
export function buildShelfRailRows(args: {
  folders: readonly { id: number; name: string }[]
  conversationsByFolder: ReadonlyMap<number, readonly DbConversationSummary[]>
  visibleConversationIds: readonly number[]
  clustersById: ReadonlyMap<number, { id: number; title: string }>
  clusterExpanded?: Readonly<Record<number, boolean>>
  conversationExpanded?: ReadonlySet<number>
  childrenByParent?: ReadonlyMap<number, readonly DbConversationSummary[]>
}): ShelfRailRow[] {
  const {
    folders,
    conversationsByFolder,
    visibleConversationIds,
    clustersById,
    clusterExpanded,
    conversationExpanded = EMPTY_EXPANDED,
    childrenByParent = EMPTY_CHILDREN,
  } = args
  const visible = new Set(visibleConversationIds)
  const rows: ShelfRailRow[] = []

  for (const folder of folders) {
    const bucket = conversationsByFolder.get(folder.id)
    if (!bucket || bucket.length === 0) continue
    const visibleRegulars: DbConversationSummary[] = []
    for (const conv of bucket) {
      if (conv.kind === "regular" && visible.has(conv.id)) {
        visibleRegulars.push(conv)
      }
    }
    if (visibleRegulars.length === 0) continue

    rows.push({ kind: "folder", folderId: folder.id, title: folder.name })

    const nested = nestFolderBucketByCluster(visibleRegulars, clustersById)
    for (const item of nested) {
      if (item.kind === "loose") {
        rows.push({
          kind: "conversation",
          conversation: item.conversation,
          depth: 0,
        })
        continue
      }
      const expanded = clusterExpanded?.[item.clusterId] !== false
      const agentTypes: string[] = []
      for (const member of item.members) {
        if (!agentTypes.includes(member.agent_type)) {
          agentTypes.push(member.agent_type)
        }
      }
      rows.push({
        kind: "cluster",
        clusterId: item.clusterId,
        title: item.title,
        memberCount: item.members.length,
        // Same cap as the sidebar cluster row.
        agentTypes: agentTypes.slice(0, 4),
        expanded,
        depth: 0,
      })
      if (!expanded) continue
      for (const member of item.members) {
        rows.push({ kind: "conversation", conversation: member, depth: 1 })
        if (!conversationExpanded.has(member.id)) continue
        const kids = childrenByParent.get(member.id)
        if (!kids) continue
        for (const kid of kids) {
          rows.push({ kind: "conversation", conversation: kid, depth: 2 })
        }
      }
    }
  }

  return rows
}
