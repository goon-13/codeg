"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { WorkbenchPageTitle } from "@/components/workbench/workbench-page-title"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useTabActions } from "@/contexts/tab-context"
import type { PlanItem, PlanList } from "@/lib/plan/types"
import { newPlanId } from "@/lib/plan/types"
import {
  attachPlanSession,
  attachPlanWorkTask,
  completePlanItem,
  listPlanItems,
  movePlanItem,
  upsertPlanItem,
} from "@/lib/plan-api"
import { toErrorMessage } from "@/lib/app-error"
import {
  createConversation,
  listAllConversations,
  listConversationTags,
  workTaskList,
} from "@/lib/api"
import type { ConversationTagDetail } from "@/lib/types"
import type { AgentType, DbConversationSummary, WorkTask } from "@/lib/types"
import { conversationsForTheme, countByList, itemsIn, toggleChild } from "./pool-model"
import { buildAttempts, resolveAttemptHome, type Attempt } from "./attempt-model"
import {
  buildTrackRows,
  type TrackRow,
  type TrackSession,
} from "./track-model"

export function PoolPageTitle() {
  const t = useTranslations("Folder.sidebar")
  return <WorkbenchPageTitle title={t("pool")} />
}

const LISTS: PlanList[] = ["inbox", "next", "waiting", "done"]

function sessionFromAttempt(attempt: Attempt): TrackSession | null {
  if (attempt.kind !== "session" || attempt.conversationId == null) return null
  return {
    id: attempt.conversationId,
    folderId: attempt.folderId,
    agentType: attempt.agentType,
    status: attempt.status,
  }
}

function canOpenSession(session: TrackSession | null): session is TrackSession & {
  folderId: number
  agentType: string
} {
  return session != null && session.folderId != null && Boolean(session.agentType)
}

function AttemptChips({
  attempts,
  onOpenSession,
  onOpenTasks,
}: {
  attempts: Attempt[]
  onOpenSession?: (session: TrackSession) => void
  onOpenTasks?: () => void
}) {
  const t = useTranslations("Plan")
  if (attempts.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {attempts.map((attempt) => {
        if (attempt.kind === "session") {
          const session = sessionFromAttempt(attempt)
          const openable = canOpenSession(session)
          return (
            <button
              key={attempt.key}
              type="button"
              data-attempt-chip={attempt.key}
              data-session-chip={attempt.conversationId}
              disabled={!openable}
              className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] disabled:opacity-50"
              onClick={() => openable && onOpenSession?.(session)}
            >
              #{attempt.conversationId}
            </button>
          )
        }
        const taskId = attempt.workTaskId
        if (taskId == null) return null
        return (
          <button
            key={attempt.key}
            type="button"
            data-attempt-chip={attempt.key}
            className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px]"
            onClick={() => onOpenTasks?.()}
          >
            {t("taskChip", { id: taskId })}
          </button>
        )
      })}
    </div>
  )
}

export function TrackingBlock({
  rows,
  onComplete,
  onOpenSession,
  onOpenTasks,
  onNewAttempt,
}: {
  rows: TrackRow[]
  onComplete: (poolId: string) => void
  onOpenSession: (session: TrackSession) => void
  onOpenTasks: () => void
  onNewAttempt?: (poolId: string) => void
}) {
  const t = useTranslations("Plan")
  return (
    <section
      data-track-block=""
      data-testid="track-block"
      className="rounded-md border border-border p-3"
    >
      <h2 className="mb-2 text-sm font-medium">{t("tracking")}</h2>
      <ul className="space-y-2">
        {rows.map((row) => {
          const home = row.attempts.some(
            (attempt) => attempt.folderId != null && attempt.agentType
          )
          return (
            <li key={row.key} className="text-sm" data-track={row.poolId ?? row.workTaskId}>
              <div className="flex flex-wrap items-center gap-2">
                <span>{row.title}</span>
                <AttemptChips
                  attempts={row.attempts}
                  onOpenSession={onOpenSession}
                  onOpenTasks={onOpenTasks}
                />
                <span className="text-xs text-muted-foreground">
                  {row.lamp === "running" ? t("running") : t("waitingYou")}
                </span>
                {row.kind === "pool" && row.poolId ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-new-attempt={row.poolId}
                      disabled={!home}
                      title={!home ? t("newAttemptHint") : undefined}
                      onClick={() => home && onNewAttempt?.(row.poolId!)}
                    >
                      {t("newAttempt")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onComplete(row.poolId!)}>
                      {t("complete")}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={onOpenTasks}>
                    {t("openTasks")}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function ThemeGather({
  slug,
  tags,
  convs,
}: {
  slug: string
  tags: ConversationTagDetail[]
  convs: { id: number; title?: string | null; tag_ids?: number[] }[]
}) {
  if (!slug) return null
  const found = conversationsForTheme(slug, tags, convs)
  return (
    <section data-theme-gather={slug} className="rounded-md border border-border p-3">
      <h2 className="mb-2 text-sm font-medium">{slug}</h2>
      <div className="flex flex-wrap gap-1">
        {found.map((conv) => (
          <span
            key={conv.id}
            data-theme-session={conv.id}
            className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px]"
          >
            #{conv.id}
          </span>
        ))}
      </div>
    </section>
  )
}

export function PoolColumns({
  items,
  tasks = [],
  convs = new Map(),
  onComplete,
  onAttach,
  onAttachTask,
  onMove,
  onOpenSession,
  onOpenTasks,
  onNewAttempt,
  onToggleChild,
  onPatch,
}: {
  items: PlanItem[]
  tasks?: WorkTask[]
  convs?: Map<number, TrackSession>
  onComplete: (id: string) => void
  onAttach?: (id: string) => void
  onAttachTask?: (id: string) => void
  onMove?: (id: string, list: PlanList) => void
  onOpenSession?: (session: TrackSession) => void
  onOpenTasks?: () => void
  onNewAttempt?: (id: string) => void
  onToggleChild?: (id: string, index: number) => void
  onPatch?: (item: PlanItem) => void
}) {
  const t = useTranslations("Plan")
  const counts = countByList(items)
  return (
    <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-4">
      {LISTS.map((list) => (
        <section key={list} data-list={list} className="flex min-h-0 flex-col rounded-md border border-border">
          <header className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
            <span>{t(list)}</span>
            <span className="font-mono text-xs text-muted-foreground">{counts[list]}</span>
          </header>
          <ul className="flex-1 space-y-1 overflow-auto p-2">
            {itemsIn(items, list).map((item) => {
              const attempts = buildAttempts(item, tasks, convs)
              const home = resolveAttemptHome(item, tasks, convs)
              return (
                <li
                  key={item.id}
                  className="rounded-md bg-card px-2 py-1.5 text-sm"
                  data-item-id={item.id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{item.title}</span>
                    {item.percent != null ? (
                      <span
                        data-testid={`percent-${item.id}`}
                        className="font-mono text-[11px] text-muted-foreground"
                      >
                        {t("percent", { n: item.percent })}
                      </span>
                    ) : null}
                    {item.theme ? (
                      <span className="text-[11px] text-muted-foreground">
                        {item.theme}
                      </span>
                    ) : null}
                  </div>
                  {(item.children ?? []).length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {(item.children ?? []).map((child, index) => (
                        <li key={`${item.id}-${index}`}>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={child.done}
                              data-child={index}
                              onChange={() => onToggleChild?.(item.id, index)}
                            />
                            <span>{child.title}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {(item.progress ?? []).map((row) => (
                    <div key={row} className="text-xs text-muted-foreground">
                      {row}
                    </div>
                  ))}
                  {item.next ? (
                    <div className="text-xs text-muted-foreground">{item.next}</div>
                  ) : null}
                  {onPatch && list !== "done" ? (
                    <div className="mt-1 flex flex-col gap-1">
                      <Input
                        className="h-7 text-xs"
                        defaultValue={item.progress?.[0] ?? ""}
                        placeholder={t("progress")}
                        onBlur={(e) => {
                          const text = e.target.value.trim()
                          const prev = item.progress?.[0] ?? ""
                          if (text === prev) return
                          onPatch({
                            ...item,
                            progress: text ? [text, ...(item.progress ?? []).slice(1)] : [],
                          })
                        }}
                      />
                      <Input
                        className="h-7 text-xs"
                        defaultValue={item.next ?? ""}
                        placeholder={t("nextStep")}
                        onBlur={(e) => {
                          const text = e.target.value.trim()
                          if (text === (item.next ?? "")) return
                          onPatch({ ...item, next: text })
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="mt-1">
                    <AttemptChips
                      attempts={attempts}
                      onOpenSession={onOpenSession}
                      onOpenTasks={onOpenTasks}
                    />
                  </div>
                  {list !== "done" ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {onMove && list !== "next" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-move="next"
                          onClick={() => onMove(item.id, "next")}
                        >
                          {t("next")}
                        </Button>
                      ) : null}
                      {onMove && list !== "waiting" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-move="waiting"
                          onClick={() => onMove(item.id, "waiting")}
                        >
                          {t("waiting")}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => onComplete(item.id)}>
                        {t("complete")}
                      </Button>
                      {onAttach ? (
                        <Button size="sm" variant="ghost" onClick={() => onAttach(item.id)}>
                          {t("attachSession")}
                        </Button>
                      ) : null}
                      {onAttachTask ? (
                        <Button size="sm" variant="ghost" onClick={() => onAttachTask(item.id)}>
                          {t("attachTask")}
                        </Button>
                      ) : null}
                      {onNewAttempt ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          data-new-attempt={item.id}
                          disabled={!home}
                          title={!home ? t("newAttemptHint") : undefined}
                          onClick={() => home && onNewAttempt(item.id)}
                        >
                          {t("newAttempt")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function PoolPage() {
  const t = useTranslations("Plan")
  const { openConversations, setRoute } = useWorkbenchRoute()
  const { openTab } = useTabActions()
  const [items, setItems] = useState<PlanItem[]>([])
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [convs, setConvs] = useState<DbConversationSummary[]>([])
  const [tags, setTags] = useState<ConversationTagDetail[]>([])
  const [themeSlug, setThemeSlug] = useState("")
  const [capture, setCapture] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState("")
  const [taskId, setTaskId] = useState("")

  const load = useCallback(async () => {
    try {
      setItems(await listPlanItems())
      try {
        setTasks(await workTaskList())
      } catch {
        setTasks([])
      }
      try {
        setConvs(await listAllConversations({ include_children: false }))
      } catch {
        setConvs([])
      }
      try {
        setTags(await listConversationTags())
      } catch {
        setTags([])
      }
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const convMap = useMemo(() => {
    const map = new Map<number, TrackSession>()
    for (const conv of convs) {
      map.set(conv.id, {
        id: conv.id,
        folderId: conv.folder_id,
        agentType: conv.agent_type,
        status: conv.status,
      })
    }
    return map
  }, [convs])

  const rows = useMemo(
    () => buildTrackRows(items, tasks, convMap),
    [items, tasks, convMap]
  )

  const recent = convs.slice(0, 40)
  const recentTasks = tasks.filter((task) => !task.archived_at).slice(0, 40)
  const themes = useMemo(() => {
    const names = new Set<string>()
    for (const item of items) if (item.theme) names.add(item.theme)
    return [...names]
  }, [items])

  const openSession = (session: TrackSession) => {
    if (session.folderId == null || !session.agentType) return
    openConversations()
    openTab(session.folderId, session.id, session.agentType as AgentType)
  }

  const startAttempt = async (id: string) => {
    const item = items.find((row) => row.id === id)
    if (!item) return
    const home = resolveAttemptHome(item, tasks, convMap)
    if (!home) return
    try {
      const created = await createConversation(
        home.folderId,
        home.agentType as AgentType,
        item.title
      )
      await attachPlanSession(id, created)
      await load()
      openConversations()
      openTab(home.folderId, created, home.agentType as AgentType)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      <TrackingBlock
        rows={rows}
        onComplete={async (id) => {
          await completePlanItem(id)
          await load()
        }}
        onOpenSession={openSession}
        onOpenTasks={() => setRoute("tasks")}
        onNewAttempt={startAttempt}
      />
      {themes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>{t("themeGather")}</span>
          {themes.map((slug) => (
            <Button
              key={slug}
              size="sm"
              variant={themeSlug === slug ? "default" : "outline"}
              data-theme-slug={slug}
              onClick={() => setThemeSlug(slug === themeSlug ? "" : slug)}
            >
              {slug}
            </Button>
          ))}
        </div>
      ) : null}
      <ThemeGather slug={themeSlug} tags={tags} convs={convs} />
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          const title = capture.trim()
          if (!title) return
          await upsertPlanItem({
            id: newPlanId(),
            title,
            list: "inbox",
            done: false,
            conversationIds: [],
            workTaskIds: [],
          })
          setCapture("")
          await load()
        }}
      >
        <Input
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          placeholder={t("capture")}
        />
        <Button type="submit">{t("add")}</Button>
      </form>
      <PoolColumns
        items={items}
        tasks={tasks}
        convs={convMap}
        onComplete={async (id) => {
          await completePlanItem(id)
          await load()
        }}
        onMove={async (id, list) => {
          await movePlanItem(id, list)
          await load()
        }}
        onAttach={async (id) => {
          const n = Number(sessionId)
          if (!Number.isFinite(n) || n <= 0) return
          await attachPlanSession(id, n)
          await load()
        }}
        onAttachTask={async (id) => {
          const n = Number(taskId)
          if (!Number.isFinite(n) || n <= 0) return
          await attachPlanWorkTask(id, n)
          await load()
        }}
        onOpenSession={openSession}
        onOpenTasks={() => setRoute("tasks")}
        onNewAttempt={startAttempt}
        onToggleChild={async (id, index) => {
          const next = toggleChild(items, id, index).find((row) => row.id === id)
          if (!next) return
          await upsertPlanItem(next)
          await load()
        }}
        onPatch={async (item) => {
          await upsertPlanItem(item)
          await load()
        }}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t("attachHint")}</span>
        <select
          data-session-pick=""
          className="h-7 max-w-[16rem] rounded-md border border-border bg-background px-2"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">{t("pickSession")}</option>
          {recent.map((conv) => (
            <option key={conv.id} value={String(conv.id)}>
              #{conv.id} {conv.title ?? conv.agent_type}
            </option>
          ))}
        </select>
        <Input
          className="h-7 w-28"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="conversation id"
        />
        <select
          data-task-pick=""
          className="h-7 max-w-[16rem] rounded-md border border-border bg-background px-2"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
        >
          <option value="">{t("pickTask")}</option>
          {recentTasks.map((task) => (
            <option key={task.id} value={String(task.id)}>
              {t("taskChip", { id: task.id })} {task.title}
            </option>
          ))}
        </select>
        <Input
          className="h-7 w-28"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          placeholder="work-task id"
        />
      </div>
    </div>
  )
}
