export const THEME_SEAT_TITLE_PREFIX = "主题席 · "
export const THEME_SEAT_FILE = "theme-seat.json"
export const THEME_SEAT_DEFAULT_BUDGET_USD = 2.4
export const THEME_SEAT_DEFAULT_MAX_ROUND = 3
export const CHAT_ONLY_PREAMBLE =
  "你是主题席的一个席位，不是编码 agent。不要使用任何工具，不要读改文件，不要跑命令。只输出这一席的正文。"

export type ProtocolId = "council" | "debate" | "relay"
export type Stance = "none" | "for" | "against" | "chair" | "specialist"
export type RunStatus = "gated" | "running" | "halted" | "done"
export type GateError =
  | "empty-theme"
  | "too-few-seats"
  | "too-many-seats"
  | "no-chair"
  | "duplicate-persona"
  | "chair-speaks"

export type Seat = {
  id: string
  agentType: string
  label: string
  rolePrompt: string
  stance: Stance
  chair: boolean
}

export type Gate = {
  theme: string
  protocol: ProtocolId
  seats: Seat[]
  maxRound: number
  budgetUsd: number
}

export type MapEdge = {
  from: string
  to: string
  kind: "批" | "补" | "交"
  note: string
}

export type SeatTurn = {
  id: string
  round: number
  seatId: string
  text: string
  costUsd: number
  edges: MapEdge[]
}

export type RunState = {
  version: 1
  conversationId: number
  folderId: number
  gate: Gate
  status: RunStatus
  turns: SeatTurn[]
  spentUsd: number
  seatConversations: Record<string, number>
  haltReason?: "user" | "budget" | "round" | "seat-error"
}

export type PlannedCall = {
  seatId: string
  round: number
  prompt: string
  parallelGroup: number
}

export function speakingSeats(gate: Gate): Seat[] {
  return gate.seats.filter((seat) => !seat.chair)
}

export function chairSeat(gate: Gate): Seat | null {
  const chairs = gate.seats.filter((seat) => seat.chair)
  return chairs.length === 1 ? (chairs[0] ?? null) : null
}

export function validateGate(gate: Gate): GateError | null {
  if (!gate.theme.trim()) return "empty-theme"
  const speaking = speakingSeats(gate)
  const chairs = gate.seats.filter((seat) => seat.chair)
  if (chairs.length !== 1) return "no-chair"
  if (speaking.length < 2) return "too-few-seats"
  if (speaking.length > 3) return "too-many-seats"
  const chair = chairs[0]
  if (chair && speaking.some((seat) => seat.id === chair.id)) return "chair-speaks"
  const personas = speaking.map((seat) => seat.rolePrompt.trim())
  if (personas.length >= 2 && personas.every((persona) => persona === personas[0])) {
    return "duplicate-persona"
  }
  return null
}

export function themeSeatTitle(theme: string): string {
  return `${THEME_SEAT_TITLE_PREFIX}${theme.trim()}`
}

export function isThemeSeatTitle(title: string | null | undefined): boolean {
  return Boolean(title && title.startsWith(THEME_SEAT_TITLE_PREFIX))
}

export function emptyRun(args: {
  conversationId: number
  folderId: number
  gate: Gate
}): RunState {
  return {
    version: 1,
    conversationId: args.conversationId,
    folderId: args.folderId,
    gate: args.gate,
    status: "gated",
    turns: [],
    spentUsd: 0,
    seatConversations: {},
  }
}

export function defaultSeats(agentTypes: string[]): Seat[] {
  const types = agentTypes.length > 0 ? agentTypes : ["grok"]
  const chairType = types[0] ?? "grok"
  const extras = types.slice(1)
  while (extras.length < 2) extras.push(chairType)
  const speakingTypes = extras.slice(0, 2)
  const roles = [
    "产品合同。反对再开第六器官。",
    "试点。先做三轮硬顶。",
  ]
  const seats: Seat[] = speakingTypes.map((agentType, index) => ({
    id: `s${index + 1}`,
    agentType,
    label: index === 0 ? "合同" : "试点",
    rolePrompt: roles[index] ?? `席${index + 1}`,
    stance: index === 0 ? "for" : "against",
    chair: false,
  }))
  seats.push({
    id: "chair",
    agentType: chairType,
    label: "主席",
    rolePrompt: "合成。不坐席抬杠。只根据前面轮次写终稿。",
    stance: "chair",
    chair: true,
  })
  return seats
}

function hasTurn(state: RunState, seatId: string, round: number): boolean {
  return state.turns.some((turn) => turn.seatId === seatId && turn.round === round)
}

function seatById(gate: Gate, seatId: string): Seat | undefined {
  return gate.seats.find((seat) => seat.id === seatId)
}

function roundTurns(state: RunState, round: number): SeatTurn[] {
  return state.turns.filter((turn) => turn.round === round)
}

function formatTurn(state: RunState, turn: SeatTurn): string {
  const seat = seatById(state.gate, turn.seatId)
  const name = seat?.label ?? turn.seatId
  return `${name}：${turn.text}`
}

function stanceLine(seat: Seat): string {
  if (seat.stance === "for") return "立场：赞成。"
  if (seat.stance === "against") return "立场：反对。"
  if (seat.stance === "chair") return "立场：主席，只合成。"
  if (seat.stance === "specialist") return "立场：专长接力。"
  return "立场：不派。"
}

function basePrompt(state: RunState, seat: Seat, extra: string): string {
  return [
    CHAT_ONLY_PREAMBLE,
    `主题：${state.gate.theme.trim()}`,
    `协议：${state.gate.protocol}`,
    `角色：${seat.rolePrompt}`,
    stanceLine(seat),
    extra,
  ]
    .filter(Boolean)
    .join("\n")
}

function independentPrompt(state: RunState, seat: Seat): string {
  return basePrompt(state, seat, "第 1 轮：独立作答。不要读其它席，它们还没写完。")
}

function councilRankPrompt(state: RunState, seat: Seat): string {
  const others = roundTurns(state, 1)
    .filter((turn) => turn.seatId !== seat.id)
    .map((turn, index) => {
      const letter = String.fromCharCode(65 + index)
      return `席 ${letter}（${seatById(state.gate, turn.seatId)?.label ?? turn.seatId}）：${turn.text}`
    })
    .join("\n")
  return basePrompt(
    state,
    seat,
    `第 2 轮：下面是其它席第 1 轮原文（已标 A/B/C）。只排名并各写一句理由，禁止把自己排第一。\n${others}`
  )
}

function critiquePrompt(state: RunState, seat: Seat): string {
  const others = roundTurns(state, 1)
    .filter((turn) => turn.seatId !== seat.id)
    .map((turn) => formatTurn(state, turn))
    .join("\n")
  return basePrompt(
    state,
    seat,
    `第 2 轮：当批评家。读其它席第 1 轮，指出弱点、前提和风险。不要改写成自己的方案清单。\n${others}`
  )
}

function chairPrompt(state: RunState): string {
  const chair = chairSeat(state.gate)
  const body = state.turns.map((turn) => formatTurn(state, turn)).join("\n")
  return basePrompt(
    state,
    chair ?? {
      id: "chair",
      agentType: "grok",
      label: "主席",
      rolePrompt: "合成",
      stance: "chair",
      chair: true,
    },
    `最后一轮：根据上面全部轮次写终稿。不要发明席位没说过的事实。\n${body}`
  )
}

function relayPrompt(state: RunState, seat: Seat, round: number): string {
  const prior = state.turns.map((turn) => formatTurn(state, turn)).join("\n")
  const extra = prior
    ? `接力第 ${round} 步。必须读完前面所有正文再写。\n${prior}`
    : `接力第 ${round} 步。你是第一席，独立开写。`
  return basePrompt(state, seat, extra)
}

function pendingParallel(
  state: RunState,
  seats: Seat[],
  round: number,
  parallelGroup: number,
  promptFor: (seat: Seat) => string
): PlannedCall[] {
  return seats
    .filter((seat) => !hasTurn(state, seat.id, round))
    .map((seat) => ({
      seatId: seat.id,
      round,
      parallelGroup,
      prompt: promptFor(seat),
    }))
}

function plannedForRunning(state: RunState): PlannedCall[] {
  const speaking = speakingSeats(state.gate)
  const chair = chairSeat(state.gate)
  if (speaking.length === 0 || !chair) return []

  if (state.gate.protocol === "relay") {
    const order = [...speaking, chair]
    const done = state.turns.length
    if (done >= order.length) return []
    const seat = order[done]
    if (!seat) return []
    const round = done + 1
    return [
      {
        seatId: seat.id,
        round,
        parallelGroup: round,
        prompt: relayPrompt(state, seat, round),
      },
    ]
  }

  const r1 = pendingParallel(state, speaking, 1, 1, (seat) =>
    independentPrompt(state, seat)
  )
  if (r1.length > 0) return r1

  const rankOrCritique =
    state.gate.protocol === "debate" ? critiquePrompt : councilRankPrompt
  const r2 = pendingParallel(state, speaking, 2, 2, (seat) =>
    rankOrCritique(state, seat)
  )
  if (r2.length > 0) return r2

  if (!hasTurn(state, chair.id, 3)) {
    return [
      {
        seatId: chair.id,
        round: 3,
        parallelGroup: 3,
        prompt: chairPrompt(state),
      },
    ]
  }
  return []
}

export function nextCalls(state: RunState): PlannedCall[] {
  if (state.status !== "running") return []
  if (state.spentUsd >= state.gate.budgetUsd && state.turns.some((turn) => turn.costUsd > 0)) {
    const remainingIfRich = plannedForRunning({
      ...state,
      gate: { ...state.gate, budgetUsd: Number.POSITIVE_INFINITY },
    })
    if (remainingIfRich.length > 0) return []
  }
  return plannedForRunning(state)
}

export function applyTurn(state: RunState, turn: SeatTurn): RunState {
  if (state.status === "halted" || state.status === "done") return state
  const next: RunState = {
    ...state,
    turns: [...state.turns, turn],
    spentUsd: state.spentUsd + turn.costUsd,
    status: "running",
  }
  const remaining = plannedForRunning(next)
  if (remaining.length === 0) {
    return { ...next, status: "done" }
  }
  return next
}

export function halt(
  state: RunState,
  reason: NonNullable<RunState["haltReason"]>
): RunState {
  return { ...state, status: "halted", haltReason: reason }
}

export function argumentMap(turns: SeatTurn[]): MapEdge[] {
  return turns.flatMap((turn) => turn.edges)
}

export function estimateRun(
  gate: Gate,
  usdPerCall: Record<string, number | null>
): { usd: number | null; calls: number; overBudget: boolean } {
  let state = emptyRun({ conversationId: 0, folderId: 0, gate })
  state = { ...state, status: "running", gate: { ...gate, budgetUsd: Number.POSITIVE_INFINITY } }
  const seatIds: string[] = []
  let guard = 0
  while (guard < 40) {
    const calls = plannedForRunning(state)
    if (calls.length === 0) break
    for (const call of calls) {
      seatIds.push(call.seatId)
      state = {
        ...state,
        turns: [
          ...state.turns,
          {
            id: `est-${seatIds.length}`,
            round: call.round,
            seatId: call.seatId,
            text: "",
            costUsd: 0,
            edges: [],
          },
        ],
      }
    }
    guard += 1
  }
  const calls = seatIds.length
  let usd = 0
  for (const seatId of seatIds) {
    if (!(seatId in usdPerCall) || usdPerCall[seatId] == null) {
      return { usd: null, calls, overBudget: false }
    }
    usd += usdPerCall[seatId] ?? 0
  }
  return {
    usd,
    calls,
    overBudget: usd > gate.budgetUsd,
  }
}

export function critiqueEdges(fromSeatId: string, speakingIds: string[]): MapEdge[] {
  return speakingIds
    .filter((id) => id !== fromSeatId)
    .map((to) => ({
      from: fromSeatId,
      to,
      kind: "批" as const,
      note: "互读批评",
    }))
}
