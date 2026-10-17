export const RESERVED_PROMPT_SLUGS = ["compact", "status", "fork", "model"] as const

const TRAILING_SLUG = /\s\/([a-z][a-z0-9-]{0,47})$/i

/** One Mustache-shaped blank: `{{name}}`, `{{name|a,b}}`, `{{name:default}}`. */
export const PROMPT_VAR_RE =
  /\{\{\s*([A-Za-z0-9_\u4e00-\u9fff]+)\s*(?:\|([^}:]+))?(?::([^}]*))?\s*\}\}/g

export type PromptVar = {
  name: string
  enumOptions: string[] | null
  defaultValue: string | null
}

export type PromptFillPlan =
  | { mode: "plain"; text: string }
  | { mode: "tab"; text: string; vars: PromptVar[] }
  | { mode: "form"; template: string; vars: PromptVar[] }

export function explicitSlug(title: string): string | null {
  const match = title.match(TRAILING_SLUG)
  return match ? match[1].toLowerCase() : null
}

export function promptDisplayTitle(title: string): string {
  return title.replace(TRAILING_SLUG, "").trim()
}

export function latinSlug(title: string): string | null {
  const stripped = promptDisplayTitle(title)
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return stripped || null
}

export function promptSlug(title: string): string | null {
  return explicitSlug(title) ?? latinSlug(title)
}

export function isReservedPromptSlug(slug: string | null): boolean {
  if (!slug) return false
  return (RESERVED_PROMPT_SLUGS as readonly string[]).includes(
    slug.toLowerCase()
  )
}

function parseEnumOptions(raw: string | undefined): string[] | null {
  if (!raw) return null
  const options = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  return options.length > 0 ? options : null
}

export function parsePromptVars(content: string): PromptVar[] {
  const vars: PromptVar[] = []
  const seen = new Set<string>()
  const re = new RegExp(PROMPT_VAR_RE.source, "g")
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const name = match[1]
    if (seen.has(name)) continue
    seen.add(name)
    const enumOptions = parseEnumOptions(match[2])
    const defaultValue =
      match[3] !== undefined && match[3] !== "" ? match[3] : null
    vars.push({ name, enumOptions, defaultValue })
  }
  return vars
}

export function planPromptFill(content: string): PromptFillPlan {
  const vars = parsePromptVars(content)
  if (vars.length === 0) return { mode: "plain", text: content }
  if (vars.length <= 2) return { mode: "tab", text: content, vars }
  return { mode: "form", template: content, vars }
}

export function applyPromptValues(
  template: string,
  values: Record<string, string>
): string {
  const re = new RegExp(PROMPT_VAR_RE.source, "g")
  return template.replace(re, (full, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : full
  )
}

export function promptSearchText(title: string, content: string): string {
  const slug = promptSlug(title)
  return `${promptDisplayTitle(title)} ${slug ?? ""} ${content}`
}

export function isPromptListable(content: string): boolean {
  return content.trim().length > 0
}
