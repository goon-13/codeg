"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PromptVar } from "@/lib/prompt-library/prompt-model"

export function seedPromptValues(vars: PromptVar[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const item of vars) {
    if (item.enumOptions && item.enumOptions.length > 0) {
      values[item.name] =
        item.defaultValue && item.enumOptions.includes(item.defaultValue)
          ? item.defaultValue
          : item.enumOptions[0]
    } else {
      values[item.name] = item.defaultValue ?? ""
    }
  }
  return values
}

export function PromptFillDialog({
  open,
  title,
  vars,
  labels,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  vars: PromptVar[]
  labels: {
    dialogTitle: string
    insert: string
    cancel: string
  }
  onConfirm: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const seeded = useMemo(() => seedPromptValues(vars), [vars])
  const [values, setValues] = useState(seeded)

  useEffect(() => {
    if (open) setValues(seedPromptValues(vars))
  }, [open, vars])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent data-testid="prompt-fill-dialog">
        <DialogHeader>
          <DialogTitle>{labels.dialogTitle}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {vars.map((item) => {
            const fieldId = `prompt-var-${item.name}`
            return (
              <div key={item.name} className="grid gap-1.5">
                <Label htmlFor={fieldId}>{item.name}</Label>
                {item.enumOptions && item.enumOptions.length > 0 ? (
                  <select
                    id={fieldId}
                    className="border-input bg-input/30 h-9 w-full rounded-4xl border px-3 text-sm outline-none"
                    value={values[item.name] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [item.name]: event.target.value,
                      }))
                    }
                  >
                    {item.enumOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id={fieldId}
                    value={values[item.name] ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [item.name]: event.target.value,
                      }))
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {labels.cancel}
          </Button>
          <Button type="button" onClick={() => onConfirm({ ...values })}>
            {labels.insert}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
