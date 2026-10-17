import {
  THEME_SEAT_DEFAULT_BUDGET_USD,
  THEME_SEAT_DEFAULT_MAX_ROUND,
  type Gate,
  type GateError,
  type ProtocolId,
  type Seat,
  themeSeatTitle,
  validateGate,
} from "@/components/theme-seat/protocol"

export type RecipeId = "code" | "council" | "debate" | "relay"

export const RECIPE_IDS: RecipeId[] = ["code", "council", "debate", "relay"]

export const SEAT_MOUTH_TITLE_PREFIX = "席 · "

export function isRecipeId(value: string): value is RecipeId {
  return (RECIPE_IDS as string[]).includes(value)
}

export function isThemeSeatRecipe(
  value: RecipeId
): value is Exclude<RecipeId, "code"> {
  return value !== "code"
}

export function parseRecipe(value: string | null | undefined): RecipeId {
  return value && isRecipeId(value) ? value : "code"
}

export function shouldInterceptFirstSend(
  recipe: RecipeId,
  hasPersistedConversation: boolean
): boolean {
  return !hasPersistedConversation && recipe !== "code"
}

export function isSeatMouthTitle(title: string | null | undefined): boolean {
  return Boolean(title?.startsWith(SEAT_MOUTH_TITLE_PREFIX))
}

export function buildDefaultSeats(args: {
  protocol: Exclude<RecipeId, "code">
  chairAgent: string
  chairLabel: string
  others: { agentType: string; label: string }[]
  role: { for: string; against: string; specialist: string; chair: string }
}): Seat[] {
  const speaking: Seat[] = []
  const pool = args.others.filter((item) => item.agentType !== args.chairAgent)
  while (speaking.length < 2) {
    const fromPool = pool[speaking.length]
    const index = speaking.length
    const agentType = fromPool?.agentType ?? args.chairAgent
    const label = fromPool?.label ?? `${args.chairLabel} ${index + 1}`
    const debateFor = index === 0
    speaking.push({
      id: `speak-${index + 1}`,
      agentType,
      label,
      rolePrompt:
        args.protocol === "debate"
          ? debateFor
            ? args.role.for
            : args.role.against
          : `${args.role.specialist} (${index + 1})`,
      stance:
        args.protocol === "debate"
          ? debateFor
            ? "for"
            : "against"
          : "specialist",
      chair: false,
    })
  }
  const chair: Seat = {
    id: "chair",
    agentType: args.chairAgent,
    label: args.chairLabel,
    rolePrompt: args.role.chair,
    stance: "chair",
    chair: true,
  }
  return [...speaking, chair]
}

export function themeSeatCreatePlan(args: {
  folderId: number
  recipe: Exclude<RecipeId, "code">
  theme: string
  seats: Seat[]
}): { title: string; gate: Gate } | { error: "empty-theme" | GateError } {
  const theme = args.theme.trim()
  if (!theme) return { error: "empty-theme" }
  const protocol = args.recipe as ProtocolId
  const gate: Gate = {
    theme,
    protocol,
    seats: args.seats,
    maxRound: THEME_SEAT_DEFAULT_MAX_ROUND,
    budgetUsd: THEME_SEAT_DEFAULT_BUDGET_USD,
  }
  const gateError = validateGate(gate)
  if (gateError) return { error: gateError }
  return { title: themeSeatTitle(theme), gate }
}
