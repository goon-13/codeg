"use client"

/**
 * In-app session-toast settings. Neighbour of the desktop-notification
 * section: one leaves the window, this one does not. No permission card —
 * LAN HTTP cannot use Notification.requestPermission, and this path never
 * asks.
 */

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { Bell, EyeOff, ListChecks, MessageSquare } from "lucide-react"

import { SettingCard, SettingRow } from "@/components/shared/setting-card"
import { SettingsSection } from "@/components/shared/settings-section"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { notifySession } from "@/lib/in-app-session-notify"
import {
  SESSION_NOTIFY_EVENT_IDS,
  saveInAppSessionNotifyPrefs,
  useInAppSessionNotifyPrefs,
  type SessionNotifyEventId,
} from "@/lib/in-app-session-notify-prefs"

const CHANNEL_EVENT_LABEL_KEYS = {
  turn_complete: "turnComplete",
  permission_request: "permissionRequest",
  question_request: "questionRequest",
  error: "error",
} as const

const LOCAL_EVENT_LABEL_KEYS = {
  background_task: "eventBackgroundTask",
  work_task: "eventWorkTask",
  plan_approval_request: "eventPlanApproval",
} as const

export function InAppSessionNotifySettingsSection() {
  const t = useTranslations("InAppSessionNotifySettings")
  const tEvents = useTranslations("ChatChannelSettings.events")
  const tDesktop = useTranslations("DesktopNotificationSettings")
  const prefs = useInAppSessionNotifyPrefs()
  const [expanded, setExpanded] = useState(false)

  const onSendTest = useCallback(() => {
    notifySession(
      {
        eventId: "turn_complete",
        contextKey: "settings-test",
        conversationId: null,
        folderId: null,
        agentType: null,
        title: t("testTitle"),
        body: t("testBody"),
      },
      { title: t("testTitle"), body: t("testBody") },
      { foreground: { conversationId: null, contextKey: null } }
    )
  }, [t])

  const eventLabel = (eventId: SessionNotifyEventId): string =>
    eventId in CHANNEL_EVENT_LABEL_KEYS
      ? tEvents(
          CHANNEL_EVENT_LABEL_KEYS[
            eventId as keyof typeof CHANNEL_EVENT_LABEL_KEYS
          ]
        )
      : tDesktop(
          LOCAL_EVENT_LABEL_KEYS[eventId as keyof typeof LOCAL_EVENT_LABEL_KEYS]
        )

  return (
    <SettingsSection
      icon={MessageSquare}
      title={t("title")}
      description={t("description")}
      htmlFor="in-app-session-notify-enabled"
      collapsible
      open={expanded}
      onOpenChange={setExpanded}
      control={
        <Switch
          id="in-app-session-notify-enabled"
          aria-label={t("title")}
          checked={prefs.enabled}
          onCheckedChange={(enabled) => {
            saveInAppSessionNotifyPrefs({ ...prefs, enabled })
            if (enabled) setExpanded(true)
          }}
        />
      }
    >
      {prefs.enabled && (
        <SettingCard>
          <SettingRow
            icon={EyeOff}
            title={t("hideBody")}
            description={t("hideBodyHint")}
            htmlFor="in-app-session-notify-hide-body"
            control={
              <Switch
                id="in-app-session-notify-hide-body"
                checked={prefs.hideBody}
                onCheckedChange={(hideBody) =>
                  saveInAppSessionNotifyPrefs({ ...prefs, hideBody })
                }
              />
            }
          />
          <SettingRow
            icon={ListChecks}
            title={t("eventsTitle")}
            description={t("eventsHint")}
          >
            <div className="space-y-1.5">
              {SESSION_NOTIFY_EVENT_IDS.map((eventId) => {
                const label = eventLabel(eventId)
                return (
                  <div
                    key={eventId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">{label}</span>
                    <Switch
                      className="shrink-0"
                      checked={prefs.events[eventId]}
                      aria-label={label}
                      onCheckedChange={(checked) =>
                        saveInAppSessionNotifyPrefs({
                          ...prefs,
                          events: { ...prefs.events, [eventId]: checked },
                        })
                      }
                    />
                  </div>
                )
              })}
            </div>
          </SettingRow>
          <SettingRow
            icon={Bell}
            title={t("sendTest")}
            description={t("testBody")}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-background"
              onClick={onSendTest}
            >
              {t("sendTest")}
            </Button>
          </SettingRow>
        </SettingCard>
      )}
    </SettingsSection>
  )
}
