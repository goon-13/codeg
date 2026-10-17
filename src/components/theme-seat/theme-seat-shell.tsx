"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  argumentMap,
  speakingSeats,
  type GateError,
  type RunState,
  type Seat,
} from "./protocol"

const GATE_ERRORS: GateError[] = [
  "empty-theme",
  "too-few-seats",
  "too-many-seats",
  "no-chair",
  "duplicate-persona",
  "chair-speaks",
]

function isGateError(value: string): value is GateError {
  return GATE_ERRORS.includes(value as GateError)
}

export function ThemeSeatShell(props: {
  state: RunState
  onChange: (state: RunState) => void
  onPlay: () => void
  onHalt: () => void
  estimateLabel: string
  disabledPlayReason: string | null
  footer?: ReactNode
}) {
  const t = useTranslations("ThemeSeat")
  const gated = props.state.status === "gated"
  const busy = props.state.status === "running"
  const hint =
    props.disabledPlayReason && isGateError(props.disabledPlayReason)
      ? t(`error.${props.disabledPlayReason}`)
      : props.disabledPlayReason
  const edges = argumentMap(props.state.turns)
  const seats = props.state.gate.seats

  const patchGate = (gate: RunState["gate"]) =>
    props.onChange({ ...props.state, gate })

  const patchSeat = (id: string, next: Partial<Seat>) =>
    patchGate({
      ...props.state.gate,
      seats: seats.map((seat) => (seat.id === id ? { ...seat, ...next } : seat)),
    })

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-theme-seat
      data-protocol={props.state.gate.protocol}
    >
      <header className="shrink-0 space-y-2 border-b border-border/60 px-4 py-3">
        <input
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          data-theme-input
          disabled={!gated}
          value={props.state.gate.theme}
          onChange={(event) =>
            patchGate({ ...props.state.gate, theme: event.target.value })
          }
        />
        {gated ? (
          <ul className="space-y-1 text-xs">
            {speakingSeats(props.state.gate).map((seat) => (
              <li key={seat.id} className="flex gap-2">
                <span className="w-16 shrink-0 pt-1 font-medium">{seat.label}</span>
                <textarea
                  className="min-h-[2.5rem] flex-1 rounded border border-input bg-background px-2 py-1"
                  value={seat.rolePrompt}
                  onChange={(event) =>
                    patchSeat(seat.id, { rolePrompt: event.target.value })
                  }
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-play
            data-testid="theme-seat-play"
            disabled={
              Boolean(props.disabledPlayReason) ||
              props.state.status !== "gated"
            }
            onClick={props.onPlay}
            size="sm"
          >
            {t("play")}
          </Button>
          <Button
            data-halt
            disabled={!busy && props.state.status !== "running"}
            onClick={props.onHalt}
            size="sm"
            variant="destructive"
          >
            {t("halt")}
          </Button>
          <span className="text-xs text-muted-foreground" data-cost>
            {props.estimateLabel} · {t("cost")} {props.state.spentUsd.toFixed(2)}
          </span>
        </div>
        {hint ? (
          <p className="text-xs text-destructive">{hint}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("newHint")}</p>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-3 py-2" data-rail>
            {props.state.turns.map((turn) => (
              <button
                key={turn.id}
                className={cn(
                  "h-7 min-w-[2.5rem] rounded bg-muted px-2 text-[11px]",
                  "hover:bg-accent"
                )}
                data-turn={turn.id}
                type="button"
                onClick={() => {
                  document
                    .getElementById(`theme-seat-turn-${turn.id}`)
                    ?.scrollIntoView({ block: "start" })
                }}
              >
                R{turn.round}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            {props.state.turns.map((turn) => {
              const seat = seats.find((item) => item.id === turn.seatId)
              return (
                <article
                  key={turn.id}
                  className="mb-3 scroll-mt-2"
                  data-testid={`theme-seat-turn-${turn.id}`}
                  id={`theme-seat-turn-${turn.id}`}
                >
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {seat?.label ?? turn.seatId} · R{turn.round}
                  </p>
                  <p className="whitespace-pre-wrap rounded-xl border border-border/60 bg-card px-3 py-2 text-sm">
                    {turn.text}
                  </p>
                </article>
              )
            })}
          </div>
        </div>
        <aside className="hidden w-64 shrink-0 overflow-auto border-l border-border/60 p-3 text-xs md:block" data-map>
          <h2 className="mb-2 font-medium text-muted-foreground">{t("map")}</h2>
          {edges.length === 0 ? (
            <p className="text-muted-foreground">—</p>
          ) : (
            edges.map((edge, index) => (
              <p key={`${edge.from}-${edge.to}-${index}`} className="mb-1 rounded border px-2 py-1">
                {edge.from} {edge.kind} {edge.to} · {edge.note}
              </p>
            ))
          )}
        </aside>
      </div>
      {props.footer ? (
        <div className="shrink-0 border-t border-border/60" data-composer>
          {props.footer}
        </div>
      ) : null}
    </div>
  )
}
