import { critiqueEdges, speakingSeats, type PlannedCall, type RunState, type SeatTurn } from "./protocol"
import type { SeatRunner } from "./run-loop"

export function fakeSeatRunner(): SeatRunner {
  return {
    async complete(call: PlannedCall, state: RunState): Promise<SeatTurn> {
      const speakingIds = speakingSeats(state.gate).map((seat) => seat.id)
      return {
        id: `${call.round}:${call.seatId}`,
        round: call.round,
        seatId: call.seatId,
        text: `ok:${call.seatId}`,
        costUsd: 0.01,
        edges:
          state.gate.protocol === "debate" && call.round === 2
            ? critiqueEdges(call.seatId, speakingIds)
            : [],
      }
    },
  }
}
