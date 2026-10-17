"use client"

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { Pencil, Plus, X } from "lucide-react"
import { useTranslations } from "next-intl"

import { AgentIcon } from "@/components/agent-icon"
import { ConversationStatusDot } from "@/components/conversations/conversation-status-dot"
import { InlineTitleEditor } from "@/components/shared/inline-title-editor"
import { Button } from "@/components/ui/button"
import { updateConversationTitle } from "@/lib/api"
import { SESSION_TITLE_MAX_CHARS } from "@/lib/normalize-title"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { formatConversationTitle } from "@/lib/conversation-title"
import type { AgentType, ConversationStatus, DbConversationSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

import { CanvasConversationSurface } from "../canvas-conversation-surface"
import { shelfContextKey, shelfDraftContextKey } from "./shelf-model"

// Same box as the board detail card. Duplicated so this file does not import
// canvas-model.
const SHELF_EXPANDED_WIDTH = 520
const SHELF_EXPANDED_HEIGHT = 560

type ShelfComposerFocus = {
  activeKey: string | null
  liveKeys: ReadonlySet<string>
  claim: (key: string) => void
  adopt: (keys: readonly string[]) => void
}

const ShelfComposerFocusContext = createContext<ShelfComposerFocus>({
  activeKey: null,
  liveKeys: new Set(),
  claim: () => {},
  adopt: () => {},
})

export function ShelfComposerFocusProvider({
  children,
}: {
  children: ReactNode
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [liveKeys, setLiveKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const claim = useCallback((key: string) => {
    setActiveKey((current) => (current === key ? current : key))
    setLiveKeys((current) => {
      if (current.has(key)) return current
      const next = new Set(current)
      next.add(key)
      return next
    })
  }, [])
  const adopt = useCallback((keys: readonly string[]) => {
    setLiveKeys((current) => {
      let changed = false
      const next = new Set(current)
      for (const key of keys) {
        if (!next.has(key)) {
          next.add(key)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [])
  const value = useMemo(
    () => ({ activeKey, liveKeys, claim, adopt }),
    [activeKey, liveKeys, claim, adopt]
  )
  return (
    <ShelfComposerFocusContext.Provider value={value}>
      {children}
    </ShelfComposerFocusContext.Provider>
  )
}

export function useShelfComposerFocus() {
  return useContext(ShelfComposerFocusContext)
}

interface MoveTarget {
  id: number
  name: string
}

interface ShelfSessionCardProps {
  conversation: DbConversationSummary
  expanded: boolean
  onShelf: boolean
  moveTargets: MoveTarget[]
  onToggleExpand: () => void
  onMove: (toFolderId: number) => void
  onHideFromShelf: () => void
  onAddToShelf: () => void
  isTransientUnmount?: () => boolean
  contextKey?: string
}

export function ShelfSessionCard({
  conversation,
  expanded,
  onShelf,
  moveTargets,
  onToggleExpand,
  onMove,
  onHideFromShelf,
  onAddToShelf,
  isTransientUnmount: _isTransientUnmount,
  contextKey,
}: ShelfSessionCardProps) {
  const t = useTranslations("Canvas")
  const { activeKey, liveKeys, claim } = useShelfComposerFocus()
  const surfaceKey = contextKey ?? shelfContextKey(conversation.id)
  const composerActive = expanded && activeKey === surfaceKey
  const live = liveKeys.has(surfaceKey)
  const status = conversation.status as ConversationStatus
  const running = status === "in_progress"
  const [editing, setEditing] = useState(false)
  const titleText = conversation.title
    ? formatConversationTitle(conversation.title)
    : t("untitled")
  const showPencil = Number.isFinite(conversation.id) && conversation.id > 0

  function expandAndClaim() {
    if (!expanded) claim(surfaceKey)
    onToggleExpand()
  }

  const editor = (
    <InlineTitleEditor
      value={conversation.title || ""}
      restLabel={titleText}
      maxChars={SESSION_TITLE_MAX_CHARS}
      editing={editing}
      onEditingChange={setEditing}
      restOpensEditor={false}
      onCommit={async (next) => {
        try {
          await updateConversationTitle(conversation.id, next)
        } catch (err) {
          console.error("[ShelfSessionCard] rename:", err)
          throw err
        }
      }}
      className={
        expanded
          ? "min-w-0 flex-1 truncate text-left text-sm font-medium"
          : "mt-1 line-clamp-3 text-[13px] font-medium leading-snug"
      }
    />
  )

  const pencil = showPencil ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={expanded ? undefined : "absolute right-8 top-1"}
      data-testid="shelf-card-rename"
      aria-label={t("renameShelfTitle")}
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
    >
      <Pencil />
    </Button>
  ) : null

  const moveMenu = (
    <ContextMenuContent>
      {onShelf ? (
        <ContextMenuItem onSelect={onHideFromShelf}>
          {t("hideFromShelf")}
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onSelect={onAddToShelf}>
          {t("addToShelf")}
        </ContextMenuItem>
      )}
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={running}>
          {t("moveToProject")}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          {moveTargets.map((target) => (
            <ContextMenuItem
              key={target.id}
              disabled={running}
              onSelect={() => onMove(target.id)}
            >
              {target.name}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      {running ? (
        <ContextMenuItem disabled>{t("moveRunningBlocked")}</ContextMenuItem>
      ) : null}
    </ContextMenuContent>
  )

  if (!expanded) {
    return (
      <div className="relative shrink-0">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {editing ? (
          <div
            draggable={!running}
            onDragStart={(event) => {
              if (running) {
                event.preventDefault()
                return
              }
              event.dataTransfer.setData(
                "application/x-codeg-conversation",
                String(conversation.id)
              )
              event.dataTransfer.effectAllowed = "move"
            }}
            data-shelf-card={conversation.id}
            data-testid="shelf-card-title"
            className={cn(
              "flex w-[216px] h-[126px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card px-2.5 py-2 text-left transition-colors",
              "border-foreground/15 hover:border-foreground/30",
              running && "ring-1 ring-primary/30"
            )}
          >
            <span className="flex items-center gap-1.5">
              <AgentIcon
                agentType={conversation.agent_type}
                className="size-3.5 shrink-0"
              />
              <ConversationStatusDot
                status={status}
                size="sm"
                className={cn(running && "motion-safe:animate-pulse")}
              />
            </span>
            {editor}
          </div>
          ) : (
          <button
            type="button"
            draggable={!running}
            onDragStart={(event) => {
              if (running) {
                event.preventDefault()
                return
              }
              event.dataTransfer.setData(
                "application/x-codeg-conversation",
                String(conversation.id)
              )
              event.dataTransfer.effectAllowed = "move"
            }}
            data-shelf-card={conversation.id}
            data-testid="shelf-card-title"
            onClick={expandAndClaim}
            className={cn(
              "flex w-[216px] h-[126px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card px-2.5 py-2 text-left transition-colors",
              "border-foreground/15 hover:border-foreground/30",
              running && "ring-1 ring-primary/30"
            )}
          >
            <span className="flex items-center gap-1.5">
              <AgentIcon
                agentType={conversation.agent_type}
                className="size-3.5 shrink-0"
              />
              <ConversationStatusDot
                status={status}
                size="sm"
                className={cn(running && "motion-safe:animate-pulse")}
              />
            </span>
            {editor}
          </button>
          )}
        </ContextMenuTrigger>
        {moveMenu}
      </ContextMenu>
        {pencil}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute right-1 top-1"
          aria-label={onShelf ? t("hideFromShelf") : t("addToShelf")}
          onClick={(event) => {
            event.stopPropagation()
            if (onShelf) onHideFromShelf()
            else onAddToShelf()
          }}
        >
          {onShelf ? <X /> : <Plus />}
        </Button>
      </div>
    )
  }

  return (
    <div
      data-shelf-card={conversation.id}
      className="flex w-[520px] h-[560px] shrink-0 flex-col overflow-hidden rounded-xl border border-primary bg-card ring-2 ring-primary/25"
      style={{ width: SHELF_EXPANDED_WIDTH, height: SHELF_EXPANDED_HEIGHT }}
      onPointerDownCapture={() => claim(surfaceKey)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-1.5">
        <AgentIcon
          agentType={conversation.agent_type}
          className="size-3.5 shrink-0"
        />
        <ConversationStatusDot
          status={status}
          size="sm"
          className={cn(running && "motion-safe:animate-pulse")}
        />
        {editing ? (
          <div className="min-w-0 flex-1">
            {editor}
          </div>
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left text-sm font-medium"
            onClick={onToggleExpand}
          >
            {editor}
          </button>
        )}
        {pencil}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("closeExpanded")}
          onClick={onToggleExpand}
        >
          <X />
        </Button>
      </div>
      <CanvasConversationSurface
        key={conversation.id}
        contextKey={surfaceKey}
        conversationId={conversation.id}
        agentType={conversation.agent_type}
        isActive={live}
        composerActive={composerActive}
        // Bound conversation: show its own folder and do not move the
        // workspace tab. The chip is display-only (`editable: false`).
        folderPickerOverride={{
          folderId: conversation.folder_id,
          editable: false,
          onSelectFolder: () => {},
          onSelectChatMode: () => {},
        }}
        className="min-h-0 flex-1"
      />
    </div>
  )
}

interface ShelfDraftCardProps {
  folderId: number
  folderPath: string
  nonce: string
  agentType: AgentType
  onAgentTypeChange: (agentType: AgentType) => void
  onDiscard: () => void
  onCreated: (conversationId: number, folderId: number) => void
}

export function ShelfDraftCard({
  folderId,
  folderPath,
  nonce,
  agentType,
  onAgentTypeChange,
  onDiscard,
  onCreated,
}: ShelfDraftCardProps) {
  const t = useTranslations("Canvas")
  const surfaceKey = shelfDraftContextKey(folderId, nonce)
  const { activeKey, liveKeys, claim } = useShelfComposerFocus()
  useLayoutEffect(() => {
    claim(surfaceKey)
  }, [claim, surfaceKey])
  return (
    <div
      data-testid="shelf-draft-card"
      className="flex w-[520px] h-[560px] shrink-0 flex-col overflow-hidden rounded-xl border border-primary bg-card ring-2 ring-primary/25"
      style={{ width: SHELF_EXPANDED_WIDTH, height: SHELF_EXPANDED_HEIGHT }}
      onPointerDownCapture={() => claim(surfaceKey)}
      onFocusCapture={() => claim(surfaceKey)}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-1.5">
        <AgentIcon agentType={agentType} className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
          {t("newConversation")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("discardDraft")}
          onClick={onDiscard}
        >
          <X />
        </Button>
      </div>
      <div
        data-testid="shelf-expanded-body"
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <CanvasConversationSurface
          contextKey={surfaceKey}
          conversationId={null}
          agentType={agentType}
          isActive={liveKeys.has(surfaceKey)}
          composerActive={activeKey === surfaceKey}
          showWelcome
          onAgentTypeChange={onAgentTypeChange}
          draftTarget={{
            kind: "folder",
            folderId,
            workingDir: folderPath,
          }}
          onConversationCreated={onCreated}
          folderPickerOverride={{
            folderId,
            editable: false,
            onSelectFolder: () => {},
            onSelectChatMode: () => {},
          }}
          className="h-full min-h-0"
        />
      </div>
    </div>
  )
}
