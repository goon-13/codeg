"use client"

import { useEffect, useState } from "react"

import { CanvasPage } from "@/components/canvas/canvas-page"
import { ChromeReserve } from "@/components/layout/chrome-reserve"
import {
  WorkbenchRouteStrip,
  useHasWorkbenchRouteStrip,
} from "@/components/workbench/workbench-content"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { cn } from "@/lib/utils"

export function ShelfKeepAlive({
  reserveLeft = 0,
}: {
  reserveLeft?: number
}) {
  const { routeId } = useWorkbenchRoute()
  const hasRouteStrip = useHasWorkbenchRouteStrip()
  const [visited, setVisited] = useState(false)

  useEffect(() => {
    if (routeId === "canvas") setVisited(true)
  }, [routeId])

  if (!visited) return null

  const visible = routeId === "canvas"
  return (
    <div
      data-testid="shelf-keep-alive"
      className={cn(
        "absolute inset-0 z-40 flex flex-col bg-background ws-transparent-bg",
        !visible && "conversation-tab-hidden invisible pointer-events-none"
      )}
      inert={visible ? undefined : true}
    >
      {visible && hasRouteStrip ? (
        <div className="flex h-10 shrink-0 items-stretch border-b border-border/50 ws-chrome-border">
          {reserveLeft > 0 ? (
            <ChromeReserve width={reserveLeft} line={false} />
          ) : null}
          <WorkbenchRouteStrip />
          <div data-tauri-drag-region className="h-full min-w-0 flex-1" />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <CanvasPage />
      </div>
    </div>
  )
}
