"use client"

import { useCallback, useState, type ReactNode, type RefObject } from "react"
import { useTranslations } from "next-intl"

import { PromptFillDialog } from "@/components/prompt-library/prompt-fill-dialog"
import type { RichComposerHandle } from "@/components/chat/composer/rich-composer"
import {
  applyPromptValues,
  type PromptVar,
} from "@/lib/prompt-library/prompt-model"

export type PromptFormRequest = {
  title: string
  template: string
  vars: PromptVar[]
  restoreToken?: string | null
}

export function usePromptFormInsert(
  editorRef: RefObject<RichComposerHandle | null>,
  onAfterInsert?: () => void
): {
  startForm: (request: PromptFormRequest) => void
  formOpen: boolean
  dialog: ReactNode
} {
  const t = useTranslations("Folder.chat.messageInput")
  const [form, setForm] = useState<PromptFormRequest | null>(null)

  const startForm = useCallback((request: PromptFormRequest) => {
    setForm(request)
  }, [])

  const dialog = (
    <PromptFillDialog
      open={form !== null}
      title={form?.title ?? ""}
      vars={form?.vars ?? []}
      labels={{
        dialogTitle: t("promptFillTitle"),
        insert: t("promptFillInsert"),
        cancel: t("promptFillCancel"),
      }}
      onConfirm={(values) => {
        if (!form) return
        editorRef.current?.insertTextAtCursor(
          applyPromptValues(form.template, values)
        )
        setForm(null)
        onAfterInsert?.()
      }}
      onCancel={() => {
        if (form?.restoreToken) {
          editorRef.current?.insertTextAtCursor(form.restoreToken)
        }
        setForm(null)
      }}
    />
  )

  return { startForm, formOpen: form !== null, dialog }
}
