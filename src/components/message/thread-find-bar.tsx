"use client"

import { useEffect, useRef } from "react"
import { useTranslations } from "next-intl"

export function ThreadFindBar({
  query,
  current,
  count,
  onQuery,
  onNext,
  onPrev,
  onClose,
}: {
  query: string
  current: number
  count: number
  onQuery: (q: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  const t = useTranslations("Folder.search")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5"
      data-testid="thread-find-bar"
    >
      <input
        ref={inputRef}
        data-testid="thread-find-input"
        data-find-input=""
        type="search"
        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[0.8125rem]"
        placeholder={t("threadFindPlaceholder")}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            onClose()
            return
          }
          if (e.key === "Enter") {
            e.preventDefault()
            if (e.shiftKey) onPrev()
            else onNext()
          }
        }}
      />
      <span className="shrink-0 text-[0.75rem] tabular-nums text-muted-foreground">
        {t("threadFindCount", {
          current: count === 0 ? 0 : current + 1,
          total: count,
        })}
      </span>
    </div>
  )
}
