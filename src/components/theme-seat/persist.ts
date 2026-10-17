import type { Gate, ProtocolId, RunState, Seat, Stance } from "./protocol"

const PROTOCOLS = new Set<ProtocolId>(["council", "debate", "relay"])
const STANCES = new Set<Stance>([
  "none",
  "for",
  "against",
  "chair",
  "specialist",
])

function isSeat(value: unknown): value is Seat {
  if (!value || typeof value !== "object") return false
  const seat = value as Seat
  return (
    typeof seat.id === "string" &&
    typeof seat.agentType === "string" &&
    typeof seat.label === "string" &&
    typeof seat.rolePrompt === "string" &&
    STANCES.has(seat.stance) &&
    typeof seat.chair === "boolean"
  )
}

function isGate(value: unknown): value is Gate {
  if (!value || typeof value !== "object") return false
  const gate = value as Gate
  return (
    typeof gate.theme === "string" &&
    PROTOCOLS.has(gate.protocol) &&
    Array.isArray(gate.seats) &&
    gate.seats.every(isSeat) &&
    typeof gate.maxRound === "number" &&
    typeof gate.budgetUsd === "number"
  )
}

export function serializeRun(state: RunState): string {
  return JSON.stringify(state)
}

export function parseRun(raw: string): RunState | null {
  if (!raw.trim()) return null
  try {
    const value = JSON.parse(raw) as RunState
    if (value?.version !== 1) return null
    if (!isGate(value.gate)) return null
    if (typeof value.conversationId !== "number") return null
    if (typeof value.folderId !== "number") return null
    if (!Array.isArray(value.turns)) return null
    if (typeof value.spentUsd !== "number") return null
    if (!value.seatConversations || typeof value.seatConversations !== "object") {
      return null
    }
    return value
  } catch {
    return null
  }
}
