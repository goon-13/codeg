import type { DashboardCat } from "./dashboard-model"

export const DASHBOARD_CAT_CLASS: Record<DashboardCat, string> = {
  read: "bg-blue-500",
  write: "bg-amber-500",
  search: "bg-cyan-500",
  command: "bg-violet-500",
  fetch: "bg-sky-500",
  think: "bg-muted-foreground/50",
  todo: "bg-emerald-500",
  task: "bg-indigo-500",
  error: "bg-destructive",
  text: "bg-zinc-400",
  other: "bg-zinc-300 dark:bg-zinc-600",
}

export const DASHBOARD_CAT_LEGEND_KEY: Record<DashboardCat, string> = {
  read: "legendRead",
  write: "legendWrite",
  search: "legendSearch",
  command: "legendCommand",
  fetch: "legendFetch",
  think: "legendThink",
  todo: "legendTodo",
  task: "legendTask",
  error: "legendError",
  text: "legendText",
  other: "legendOther",
}
