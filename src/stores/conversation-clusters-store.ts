import { useEffect } from "react"
import { create } from "zustand"
import {
  createConversationCluster as apiCreate,
  deleteConversationCluster as apiDelete,
  listConversationClusters,
  updateConversationCluster as apiRename,
} from "@/lib/api"
import { toErrorMessage } from "@/lib/app-error"
import { onTransportReconnect, subscribe } from "@/lib/platform"
import {
  CONVERSATION_CLUSTER_CHANGED_EVENT,
  type ConversationClusterChange,
  type ConversationClusterDetail,
} from "@/lib/types"
import { registerBackendScopedStoreReset } from "@/stores/backend-scoped-store-reset"

interface ConversationClustersState {
  clusters: ConversationClusterDetail[]
  clustersById: ReadonlyMap<number, ConversationClusterDetail>
  hydrated: boolean
  loadError: string | null
  fetchClusters: () => Promise<void>
  applyChange: (change: ConversationClusterChange) => void
  createCluster: (args: {
    folderId: number
    title: string
  }) => Promise<ConversationClusterDetail>
  renameCluster: (clusterId: number, title: string) => Promise<ConversationClusterDetail>
  deleteCluster: (clusterId: number) => Promise<void>
}

function withClusters(clusters: ConversationClusterDetail[]) {
  return {
    clusters,
    clustersById: new Map(clusters.map((c) => [c.id, c])) as ReadonlyMap<
      number,
      ConversationClusterDetail
    >,
  }
}

export const useConversationClustersStore = create<ConversationClustersState>()(
  (set, get) => ({
    clusters: [],
    clustersById: new Map(),
    hydrated: false,
    loadError: null,

    fetchClusters: async () => {
      try {
        const list = await listConversationClusters()
        set({ ...withClusters(list), loadError: null, hydrated: true })
      } catch (err) {
        console.error("[ConversationClusters] fetch failed:", err)
        set({ loadError: toErrorMessage(err) })
      }
    },

    applyChange: (change) => {
      const { clusters } = get()
      if (change.kind === "deleted") {
        set(withClusters(clusters.filter((c) => c.id !== change.id)))
        return
      }
      const idx = clusters.findIndex((c) => c.id === change.cluster.id)
      if (idx < 0) {
        set(withClusters([...clusters, change.cluster]))
        return
      }
      const next = [...clusters]
      next[idx] = change.cluster
      set(withClusters(next))
    },

    createCluster: async (args) => {
      const cluster = await apiCreate(args)
      get().applyChange({ kind: "upsert", cluster })
      return cluster
    },

    renameCluster: async (clusterId, title) => {
      const cluster = await apiRename(clusterId, title)
      get().applyChange({ kind: "upsert", cluster })
      return cluster
    },

    deleteCluster: async (clusterId) => {
      await apiDelete(clusterId)
      get().applyChange({ kind: "deleted", id: clusterId })
    },
  })
)

export function resetConversationClustersStore(): void {
  useConversationClustersStore.setState(
    useConversationClustersStore.getInitialState(),
    true
  )
}

registerBackendScopedStoreReset(resetConversationClustersStore)

export function useConversationClustersSync(): void {
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined
    void useConversationClustersStore.getState().fetchClusters()
    void (async () => {
      const dispose = await subscribe<ConversationClusterChange>(
        CONVERSATION_CLUSTER_CHANGED_EVENT,
        (change) => {
          useConversationClustersStore.getState().applyChange(change)
        }
      )
      if (disposed) dispose()
      else unlisten = dispose
    })()
    const offReconnect = onTransportReconnect(() => {
      void useConversationClustersStore.getState().fetchClusters()
    })
    return () => {
      disposed = true
      unlisten?.()
      offReconnect?.()
    }
  }, [])
}

export function ConversationClustersSync(): null {
  useConversationClustersSync()
  return null
}

const EXPANDED_KEY = "codeg.sidebar.clusterExpanded"

export function loadClusterExpanded(): Record<number, boolean> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    const out: Record<number, boolean> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k)
      if (Number.isFinite(id)) out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveClusterExpanded(state: Record<number, boolean>): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(state))
}
