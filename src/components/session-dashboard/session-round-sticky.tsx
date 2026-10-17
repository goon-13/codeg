"use client"

import { useTranslations } from "next-intl"

export function SessionRoundSticky({
  label,
  ordinal,
  total,
  onJump,
}: {
  label: string
  ordinal: number
  total: number
  onJump?: () => void
}) {
  const t = useTranslations("Folder.chat.sessionDashboard")
  return (
    <button
      type="button"
      data-round-sticky=""
      aria-label={t("stickyAria")}
      className="flex w-full shrink-0 items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-1 text-left"
      onClick={onJump}
    >
      <span className="min-w-0 truncate text-xs text-foreground">{label}</span>
      <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
        {ordinal} / {total}
      </span>
    </button>
  )
}
