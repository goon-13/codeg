"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getAgentLabel } from "@/lib/custom-agents"
import type { AgentType } from "@/lib/types"

export function HandoffGoalDialog({
  open,
  agentType,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  agentType: AgentType | null
  onOpenChange: (open: boolean) => void
  onConfirm: (goal: string) => void
}) {
  const t = useTranslations("Folder.handoff")
  const [goal, setGoal] = useState("")
  const empty = !goal.trim()
  const label = agentType ? getAgentLabel(agentType) : ""

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setGoal("")
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("goalTitle", { agent: label })}</DialogTitle>
        </DialogHeader>
        <textarea
          data-handoff-goal
          className="min-h-[6rem] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t("goalPlaceholder")}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        {empty ? (
          <p className="text-xs text-muted-foreground">{t("emptyGoal")}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            data-handoff-confirm
            disabled={empty || !agentType}
            onClick={() => {
              if (empty) return
              onConfirm(goal.trim())
              setGoal("")
              onOpenChange(false)
            }}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
