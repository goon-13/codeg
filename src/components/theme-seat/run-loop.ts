import {
  applyTurn,
  halt,
  nextCalls,
  type PlannedCall,
  type RunState,
  type SeatTurn,
} from "./protocol"

export type SeatRunner = {
  complete(call: PlannedCall, state: RunState): Promise<SeatTurn>
}

export type HaltSignal = { halted: boolean }

export async function stepRun(
  state: RunState,
  runner: SeatRunner
): Promise<RunState> {
  const current =
    state.status === "gated" ? { ...state, status: "running" as const } : state
  const planned = nextCalls(current)
  if (planned.length === 0) return current
  const turns = await Promise.all(
    planned.map((call) => runner.complete(call, current))
  )
  let next = current
  for (const turn of turns) {
    next = applyTurn(next, turn)
  }
  return next
}

export async function playRun(
  state: RunState,
  runner: SeatRunner,
  onUpdate: (state: RunState) => void,
  signal?: HaltSignal
): Promise<RunState> {
  let current: RunState =
    state.status === "gated" || state.status === "running"
      ? { ...state, status: "running" }
      : state
  onUpdate(current)
  let guard = 0
  while (guard < 40) {
    guard += 1
    if (signal?.halted) {
      current = halt(current, "user")
      onUpdate(current)
      return current
    }
    const planned = nextCalls(current)
    if (planned.length === 0) {
      if (
        current.status === "running" &&
        current.spentUsd >= current.gate.budgetUsd &&
        current.turns.some((turn) => turn.costUsd > 0)
      ) {
        const leftover = nextCalls({
          ...current,
          gate: { ...current.gate, budgetUsd: Number.POSITIVE_INFINITY },
        })
        if (leftover.length > 0) {
          current = halt(current, "budget")
          onUpdate(current)
        }
      }
      return current
    }
    const turns = await Promise.all(
      planned.map((call) => runner.complete(call, current))
    )
    for (const turn of turns) {
      current = applyTurn(current, turn)
    }
    onUpdate(current)
  }
  return halt(current, "round")
}
