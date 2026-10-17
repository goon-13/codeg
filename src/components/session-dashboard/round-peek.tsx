"use client"

import { useTranslations } from "next-intl"
import { DASHBOARD_CAT_CLASS } from "./session-dashboard-colors"
import type { RoundMapRound } from "./round-map-model"

export function RoundPeek({
  round,
  onJumpUser,
  onJumpAssistant,
}: {
  round: RoundMapRound
  onJumpUser?: () => void
  onJumpAssistant?: () => void
}) {
  const t = useTranslations("Folder.chat.sessionDashboard")
  const ticks = round.segs.slice(0, 3)
  return (
    <div
      data-round-peek=""
      className="absolute left-3 top-full z-30 mt-1 w-64 rounded-md border border-border bg-popover p-2 shadow-md"
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <p className="line-clamp-2 text-xs leading-5 text-foreground">
        {round.userLabel || t("legendText")}
      </p>
      {ticks.length > 0 ? (
        <span className="mt-1.5 flex items-end gap-px">
          {ticks.map((s) => (
            <i
              key={`${s.cat}-${s.first}`}
              className={`block h-2 w-1.5 rounded-[1px] ${DASHBOARD_CAT_CLASS[s.cat]}`}
              aria-hidden
            />
          ))}
        </span>
      ) : null}
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          className="rounded-md border border-border bg-background px-1.5 py-0.5 text-3xs text-foreground disabled:opacity-40"
          disabled={!onJumpUser}
          onClick={onJumpUser}
        >
          {t("peekJumpUser")}
        </button>
        <button
          type="button"
          className="rounded-md border border-border bg-background px-1.5 py-0.5 text-3xs text-foreground disabled:opacity-40"
          disabled={!onJumpAssistant}
          onClick={onJumpAssistant}
        >
          {t("peekJumpReply")}
        </button>
      </div>
    </div>
  )
}
