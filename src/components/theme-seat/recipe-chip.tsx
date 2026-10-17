"use client"

import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DropdownRadioItemContent } from "@/components/chat/dropdown-radio-item-content"
import type { RecipeId } from "@/lib/theme-seat-recipe"
import { RECIPE_IDS } from "@/lib/theme-seat-recipe"

const THEME_RECIPES: RecipeId[] = ["council", "debate", "relay"]

export function ThemeSeatRecipeChip(props: {
  value: RecipeId
  onChange: (value: RecipeId) => void
  labels: Record<RecipeId, string> & { name: string; group: string }
  disabled?: boolean
}) {
  const current = props.labels[props.value]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={props.disabled}
          data-theme-recipe={props.value}
          aria-label={`${props.labels.name}: ${current}`}
          className="min-w-0 gap-0.5 px-1 text-muted-foreground"
        >
          <span className="max-w-[10rem] truncate">
            {props.labels.name} · {current}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={(value) => props.onChange(value as RecipeId)}
        >
          <DropdownMenuRadioItem value="code">
            <DropdownRadioItemContent label={props.labels.code} />
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{props.labels.group}</DropdownMenuLabel>
          {THEME_RECIPES.map((id) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <DropdownRadioItemContent label={props.labels[id]} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const RECIPE_CHIP_VALUES = RECIPE_IDS
