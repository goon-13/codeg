"use client"

import { memo, useState } from "react"
import { ChevronRight, Pencil, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { AgentIcon } from "@/components/agent-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useImeGuard } from "@/hooks/use-ime-guard"
import { cn } from "@/lib/utils"
import type { AgentType } from "@/lib/types"

export const SidebarClusterHeader = memo(function SidebarClusterHeader({
  clusterId,
  title,
  memberCount,
  agentTypes,
  expanded,
  depth,
  onToggle,
  onRename,
  onDissolve,
}: {
  clusterId: number
  title: string
  memberCount: number
  agentTypes: string[]
  expanded: boolean
  depth: number
  onToggle: (clusterId: number) => void
  onRename: (clusterId: number, title: string) => void
  onDissolve: (clusterId: number) => void
}) {
  const t = useTranslations("Folder.cluster")
  const ime = useImeGuard()
  const [renameOpen, setRenameOpen] = useState(false)
  const [dissolveOpen, setDissolveOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(title)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-conversation-cluster
            data-cluster-id={clusterId}
            className="relative h-[2rem]"
            style={{
              paddingLeft: `calc(${depth} * 1.25rem)`,
            }}
          >
            <button
              type="button"
              onClick={() => onToggle(clusterId)}
              className={cn(
                "relative flex h-[1.9375rem] w-full items-center rounded-full text-left text-[0.75rem] text-sidebar-foreground outline-none transition-colors duration-[120ms] hover:bg-[color-mix(in_oklab,var(--sidebar-accent),var(--sidebar-foreground)_2%)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              )}
              style={{
                paddingLeft: "calc(var(--conv-rail-axis, 0.875rem) + 0.875rem)",
              }}
              aria-expanded={expanded}
              aria-label={expanded ? t("collapse") : t("expand")}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 flex items-center justify-center"
                style={{
                  left: "var(--conv-rail-axis, 0.875rem)",
                  width: "0.875rem",
                  height: "0.875rem",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <ChevronRight
                  className={cn(
                    "h-[0.75rem] w-[0.75rem] transition-transform",
                    expanded && "rotate-90"
                  )}
                />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {title || t("untitled")}
              </span>
              <span className="ml-1 shrink-0 text-muted-foreground/80">
                {t("memberCount", { count: memberCount })}
              </span>
              <span className="ml-1 flex shrink-0 items-center gap-0.5 pr-1">
                {agentTypes.map((agent) => (
                  <AgentIcon
                    key={agent}
                    agentType={agent as AgentType}
                    className="h-3.5 w-3.5"
                  />
                ))}
              </span>
            </button>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onSelect={() => {
              setRenameValue(title)
              setRenameOpen(true)
            }}
          >
            <Pencil className="h-4 w-4" />
            {t("rename")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setDissolveOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("dissolve")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            {...ime.props}
            onKeyDown={(e) => {
              if (ime.isComposing(e)) return
              if (e.key === "Enter" && renameValue.trim()) {
                onRename(clusterId, renameValue.trim())
                setRenameOpen(false)
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={() => {
                onRename(clusterId, renameValue.trim())
                setRenameOpen(false)
              }}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dissolveOpen} onOpenChange={setDissolveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dissolveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dissolveDescription", { title: title || t("untitled") })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDissolve(clusterId)}>
              {t("dissolve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})
