import {
  newPlanId,
  PLAN_HEADING,
  type PlanChild,
  type PlanItem,
  type PlanList,
} from "./types"

const ITEM_RE = /^- \[([ xX])\] (.+)$/
const AT_DATE = /@(\d{4}-\d{2}-\d{2})/
const EST = /~(\d+)m/
const THEME = /theme:([A-Za-z0-9_-]+)/

export function childPercent(children?: PlanChild[]): number | null {
  if (!children || children.length === 0) return null
  const done = children.filter((child) => child.done).length
  return Math.round((100 * done) / children.length)
}

function parseTitleMeta(rest: string): {
  title: string
  date?: string
  estimateMinutes?: number
  theme: string
  conversationIds: number[]
  workTaskIds: number[]
  id: string
  hadId: boolean
} {
  const conversationIds = [
    ...rest.matchAll(/codeg:\/\/conversation\/(\d+)/g),
  ].map((x) => Number(x[1]))
  const workTaskIds = [...rest.matchAll(/codeg:\/\/work-task\/(\d+)/g)].map(
    (x) => Number(x[1])
  )
  let id = ""
  let hadId = true
  const idm = rest.match(/`p_([0-9a-f]{8})`/)
  if (idm) id = `p_${idm[1]}`
  else {
    id = newPlanId()
    hadId = false
  }
  const date = rest.match(AT_DATE)?.[1]
  const est = rest.match(EST)
  const theme = rest.match(THEME)?.[1] ?? ""
  const title = rest
    .replace(/`p_[0-9a-f]{8}`/g, "")
    .replace(/codeg:\/\/conversation\/\d+/g, "")
    .replace(/codeg:\/\/work-task\/\d+/g, "")
    .replace(AT_DATE, "")
    .replace(EST, "")
    .replace(THEME, "")
    .replace(/\s+/g, " ")
    .trim()
  return {
    title,
    date,
    estimateMinutes: est ? Number(est[1]) : undefined,
    theme,
    conversationIds,
    workTaskIds,
    id,
    hadId,
  }
}

function formatLine(item: PlanItem): string {
  const mark = item.done ? "x" : " "
  const bits = [item.title]
  if (item.date) bits.push(`@${item.date}`)
  if (item.estimateMinutes) bits.push(`~${item.estimateMinutes}m`)
  if (item.theme) bits.push(`theme:${item.theme}`)
  const extra = [
    `\`${item.id}\``,
    ...item.conversationIds.map((n) => `codeg://conversation/${n}`),
    ...item.workTaskIds.map((n) => `codeg://work-task/${n}`),
  ]
    .filter(Boolean)
    .join(" ")
  return `- [${mark}] ${bits.join(" ")} ${extra}`.trimEnd()
}

function formatBlock(item: PlanItem): string[] {
  const lines = [formatLine(item)]
  for (const child of item.children ?? []) {
    lines.push(`  - [${child.done ? "x" : " "}] ${child.title}`)
  }
  for (const row of item.progress ?? []) {
    lines.push(`  progress: ${row}`)
  }
  if (item.next) lines.push(`  next: ${item.next}`)
  return lines
}

function isIndent(line: string): boolean {
  return line.startsWith(" ") || line.startsWith("\t")
}

export function parseMdItems(
  text: string,
  list: PlanList
): { items: PlanItem[]; dirty: boolean; text: string } {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const items: PlanItem[] = []
  let dirty = false
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isIndent(line)) {
      out.push(line)
      i += 1
      continue
    }
    const m = line.match(ITEM_RE)
    if (!m) {
      out.push(line)
      i += 1
      continue
    }
    const meta = parseTitleMeta(m[2])
    if (!meta.hadId) dirty = true
    const blockLines = [line]
    i += 1
    const children: PlanChild[] = []
    const progress: string[] = []
    let next = ""
    while (i < lines.length) {
      const nxt = lines[i]
      if (!nxt.trim()) {
        let j = i + 1
        while (j < lines.length && !lines[j].trim()) j += 1
        if (j < lines.length && isIndent(lines[j])) {
          blockLines.push(nxt)
          i += 1
          continue
        }
        break
      }
      if (!isIndent(nxt)) break
      blockLines.push(nxt)
      const body = nxt.trim()
      i += 1
      const child = body.match(ITEM_RE)
      if (child) {
        const nested = parseTitleMeta(child[2])
        children.push({
          title: nested.title,
          done: child[1].toLowerCase() === "x",
        })
      } else if (body.toLowerCase().startsWith("progress:")) {
        progress.push(body.slice(body.indexOf(":") + 1).trim())
      } else if (body.toLowerCase().startsWith("next:")) {
        next = body.slice(body.indexOf(":") + 1).trim()
      }
    }
    const item: PlanItem = {
      id: meta.id,
      title: meta.title,
      list,
      done: m[1].toLowerCase() === "x",
      conversationIds: meta.conversationIds,
      workTaskIds: meta.workTaskIds,
      date: meta.date,
      estimateMinutes: meta.estimateMinutes,
      theme: meta.theme,
      children,
      progress,
      next,
      percent: childPercent(children),
    }
    items.push(item)
    if (meta.hadId) out.push(...blockLines)
    else out.push(...formatBlock(item))
  }
  return { items, dirty, text: dirty ? out.join("\n") : text }
}

export function serializeMdFile(title: string, items: PlanItem[]): string {
  const body = items.flatMap(formatBlock).join("\n")
  return `# ${title}\n\n${body}${body ? "\n" : ""}`
}

export function fileHeading(list: PlanList): string {
  return PLAN_HEADING[list]
}
