"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { formatDistanceToNow } from "date-fns"
import { enUS, zhCN, zhTW } from "date-fns/locale"
import { File, Folder } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAuxPanelContext } from "@/contexts/aux-panel-context"
import { useActiveFolder } from "@/contexts/active-folder-context"
import { useAppWorkspaceStore } from "@/stores/app-workspace-store"
import { useTabActions } from "@/contexts/tab-context"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useWorkspaceActions } from "@/contexts/workspace-context"
import {
  listAllConversations,
  searchCorpus,
  type CorpusHit,
} from "@/lib/api"
import { isElementLive } from "@/lib/search-surface"
import { parseSearchQuery } from "@/lib/search-query"
import { useFileTree, type FlatFileEntry } from "@/hooks/use-file-tree"
import { rankFileMatches } from "@/lib/file-search-match"
import {
  compareAgentType,
  STATUS_ORDER,
  type AgentType,
  type ConversationStatus,
  type DbConversationSummary,
} from "@/lib/types"
import { getAgentLabel } from "@/lib/custom-agents"
import { AgentIcon } from "@/components/agent-icon"
import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { formatConversationTitle } from "@/lib/conversation-title"

type SearchRow = DbConversationSummary & {
  snippet?: string
  hitSource?: "title" | "body"
}

function isConversationStatus(status: string): status is ConversationStatus {
  return (STATUS_ORDER as readonly string[]).includes(status)
}

function hitToRow(
  hit: CorpusHit,
  known: DbConversationSummary | undefined
): SearchRow {
  const snippet = hit.snippet
  const hitSource = hit.source
  if (!known) {
    return {
      id: hit.conversation_id,
      folder_id: hit.folder_id,
      title: hit.title,
      title_locked: false,
      agent_type: hit.agent_type as AgentType,
      status: "",
      kind: "regular",
      model: null,
      git_branch: null,
      external_id: null,
      message_count: 0,
      child_count: 0,
      created_at: "",
      updated_at: "",
      pinned_at: null,
      snippet,
      hitSource,
    }
  }
  return {
    ...known,
    id: hit.conversation_id,
    folder_id: hit.folder_id,
    agent_type: hit.agent_type as AgentType,
    title: hit.title ?? known.title,
    snippet,
    hitSource,
  }
}

function hitsToRows(
  hits: CorpusHit[],
  knownById: ReadonlyMap<number, DbConversationSummary>
): SearchRow[] {
  const byId = new Map<number, SearchRow>()
  for (const hit of hits) {
    const prev = byId.get(hit.conversation_id)
    if (!prev || (prev.hitSource !== "body" && hit.source === "body")) {
      byId.set(hit.conversation_id, hitToRow(hit, knownById.get(hit.conversation_id)))
    }
  }
  return [...byId.values()]
}

interface SearchCommandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function applyAfter(
  list: DbConversationSummary[],
  after: string | null
): DbConversationSummary[] {
  if (!after) return list
  const start = Date.parse(`${after}T00:00:00Z`)
  if (Number.isNaN(start)) return list
  return list.filter((c) => Date.parse(c.updated_at) >= start)
}

export function SearchCommandDialog({
  open,
  onOpenChange,
}: SearchCommandDialogProps) {
  const t = useTranslations("Folder.search")
  const locale = useLocale()
  const dateFnsLocale =
    locale === "zh-CN" ? zhCN : locale === "zh-TW" ? zhTW : enUS
  const { activeFolder: folder, activeFolderId } = useActiveFolder()
  const allConversations = useAppWorkspaceStore((s) => s.conversations)
  const folderId = activeFolderId ?? 0
  const conversations = useMemo(
    () =>
      activeFolderId == null
        ? []
        : allConversations.filter((c) => c.folder_id === activeFolderId),
    [allConversations, activeFolderId]
  )
  const { openTab } = useTabActions()
  const { openConversations } = useWorkbenchRoute()
  const { openFilePreview } = useWorkspaceActions()
  const { revealInFileTree } = useAuxPanelContext()

  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [agentFilter, setAgentFilter] = useState<AgentType | null>(null)
  const [results, setResults] = useState<SearchRow[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const searchGen = useRef(0)

  const folderPath = folder?.path ?? ""
  const parsed = useMemo(() => parseSearchQuery(query), [query])
  const resolvedAgent = (parsed.agent as AgentType | null) ?? agentFilter

  const {
    allFiles,
    loading: filesLoading,
    reset: resetFileTree,
  } = useFileTree({
    folderPath: folderPath || undefined,
    enabled: open,
  })

  const availableAgents = Array.from(
    new Set(conversations.map((c) => c.agent_type))
  ).sort(compareAgentType)

  const fileNeedle = parsed.text
  const filteredFiles = useMemo(
    () =>
      rankFileMatches(fileNeedle, allFiles, fileNeedle.trim() ? 100 : 20),
    [allFiles, fileNeedle]
  )

  const knownById = useMemo(() => {
    const map = new Map<number, DbConversationSummary>()
    for (const row of allConversations) {
      map.set(row.id, row)
    }
    return map
  }, [allConversations])

  const recents = useMemo(() => {
    const usable = conversations.filter(
      (c) => typeof c.id === "number" && typeof c.updated_at === "string"
    )
    const sorted = [...usable].sort((a, b) => {
      const tb = Date.parse(b.updated_at)
      const ta = Date.parse(a.updated_at)
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta)
    })
    return applyAfter(sorted.slice(0, 8), parsed.after)
  }, [conversations, parsed.after])

  const doSearch = useCallback(
    async (raw: string, chipAgent: AgentType | null) => {
      const gen = ++searchGen.current
      const parsedQ = parseSearchQuery(raw)
      const agent = (parsedQ.agent as AgentType | null) ?? chipAgent
      if (!parsedQ.text.trim() && !agent) {
        setResults(recents)
        setSearching(false)
        return
      }
      const folderIds =
        parsedQ.scope === "all" ? null : folderId > 0 ? [folderId] : null
      setSearching(true)
      try {
        const text = parsedQ.text.trim()
        if (text) {
          try {
            const corpus = await searchCorpus({
              query: text,
              folder_ids: folderIds,
              agent_type: agent,
              after: parsedQ.after,
              limit: 30,
            })
            if (searchGen.current !== gen) return
            setResults(hitsToRows(corpus.hits, knownById))
            return
          } catch {
            if (searchGen.current !== gen) return
            // Body index missing or 404: title LIKE still answers.
          }
        }
        const data = await listAllConversations({
          folder_ids: folderIds,
          search: text || null,
          agent_type: agent,
        })
        if (searchGen.current !== gen) return
        setResults(applyAfter(data, parsedQ.after))
      } catch {
        if (searchGen.current !== gen) return
        setResults([])
      } finally {
        if (searchGen.current === gen) setSearching(false)
      }
    },
    [folderId, recents, knownById]
  )

  useEffect(() => {
    // Debounce has not started the next doSearch yet. Bump now so the
    // in-flight corpus call is already stale when its await resolves.
    searchGen.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void doSearch(query, agentFilter)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, agentFilter, doSearch])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setAgentFilter(null)
      setResults([])
      resetFileTree()
    }
  }, [open, resetFileTree])

  const handleSelectConversation = useCallback(
    (conv: DbConversationSummary) => {
      const onShelf = document.querySelector(
        `[data-shelf-card="${conv.id}"]`
      )
      if (onShelf instanceof HTMLElement && isElementLive(onShelf)) {
        if (onShelf instanceof HTMLButtonElement) onShelf.click()
        onShelf.scrollIntoView({ block: "nearest", inline: "nearest" })
        onOpenChange(false)
        return
      }
      openConversations()
      openTab(conv.folder_id, conv.id, conv.agent_type, true)
      onOpenChange(false)
    },
    [openTab, onOpenChange, openConversations]
  )

  const handleSelectFile = useCallback(
    (entry: FlatFileEntry) => {
      if (entry.kind === "dir") {
        revealInFileTree(entry.relativePath)
      } else {
        const lastSlash = entry.relativePath.lastIndexOf("/")
        if (lastSlash > 0) {
          revealInFileTree(entry.relativePath.slice(0, lastSlash))
        }
        openFilePreview(entry.relativePath)
      }
      onOpenChange(false)
    },
    [revealInFileTree, openFilePreview, onOpenChange]
  )

  const conversationRows: SearchRow[] =
    parsed.text.trim() || resolvedAgent ? results : recents
  const emptyLabel = searching || filesLoading ? t("searching") : t("noResults")

  return (
    <CommandDialog
      title={
        folder
          ? t("dialogTitleWithFolder", { name: folder.name })
          : t("dialogTitle")
      }
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        inputRef.current?.focus()
      }}
    >
      {folder && (
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium truncate">
            {t("dialogTitleWithFolder", { name: folder.name })}
          </span>
        </div>
      )}

      <CommandInput
        ref={inputRef}
        placeholder={t("placeholder")}
        value={query}
        onValueChange={setQuery}
      />

      {availableAgents.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setAgentFilter(null)}
            className={cn(
              "h-6 shrink-0 text-xs px-2 rounded-md transition-colors",
              agentFilter === null
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("allAgents")}
          </button>
          {availableAgents.map((at) => (
            <button
              key={at}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAgentFilter(at)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 h-6 text-xs px-2 rounded-md transition-colors",
                agentFilter === at
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <AgentIcon agentType={at} className="w-3.5 h-3.5" />
              {getAgentLabel(at)}
            </button>
          ))}
        </div>
      )}

      <CommandList className="min-h-96">
        <CommandEmpty>{emptyLabel}</CommandEmpty>
        {conversationRows.length > 0 && (
          <CommandGroup
            heading={
              parsed.text.trim() || resolvedAgent
                ? t("groupConversations")
                : t("recentConversations")
            }
          >
            {conversationRows.map((conv) => (
              <CommandItem
                key={conv.id}
                value={`${conv.id}-${formatConversationTitle(conv.title)}`}
                onSelect={() => handleSelectConversation(conv)}
              >
                {isConversationStatus(conv.status) ? (
                  <ConversationStatusDot status={conv.status} />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {formatConversationTitle(conv.title) ||
                      t("untitledConversation")}
                  </span>
                  {conv.hitSource === "body" && conv.snippet ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {conv.snippet}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {getAgentLabel(conv.agent_type)}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {Number.isNaN(Date.parse(conv.created_at))
                    ? ""
                    : formatDistanceToNow(new Date(conv.created_at), {
                        addSuffix: true,
                        locale: dateFnsLocale,
                      })}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {filteredFiles.length > 0 && (
          <CommandGroup heading={t("groupFiles")}>
            {filteredFiles.map((entry) => (
              <CommandItem
                key={entry.relativePath}
                value={entry.relativePath}
                onSelect={() => handleSelectFile(entry)}
              >
                {entry.kind === "dir" ? (
                  <Folder className="w-4 h-4 shrink-0 text-blue-500" />
                ) : (
                  <File className="w-4 h-4 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{entry.name}</span>
                <span className="text-xs text-muted-foreground shrink-0 truncate max-w-48">
                  {entry.relativePath}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
