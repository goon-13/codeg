import type { ProtocolId } from "@/components/theme-seat/protocol"
import type { SessionConfigOptionInfo } from "@/lib/types"

export const THEME_SEAT_PROTOCOL_CONFIG_ID = "codeg:theme-seat-protocol"

export type ThemeSeatProtocolValue = "off" | ProtocolId

const VALUES: ThemeSeatProtocolValue[] = ["off", "council", "debate", "relay"]

export function buildThemeSeatProtocolOption(args: {
  current: ThemeSeatProtocolValue
  name: string
  off: string
  council: string
  debate: string
  relay: string
}): SessionConfigOptionInfo {
  return {
    id: THEME_SEAT_PROTOCOL_CONFIG_ID,
    name: args.name,
    kind: {
      type: "select",
      current_value: args.current,
      options: [
        { value: "off", name: args.off },
        { value: "council", name: args.council },
        { value: "debate", name: args.debate },
        { value: "relay", name: args.relay },
      ],
      groups: [],
    },
  }
}

export function interceptThemeSeatProtocolChange(
  configId: string,
  value: string
): ThemeSeatProtocolValue | null {
  if (configId !== THEME_SEAT_PROTOCOL_CONFIG_ID) return null
  return VALUES.find((item) => item === value) ?? null
}

export function mergeThemeSeatProtocolOption(
  configOptions: SessionConfigOptionInfo[],
  option: SessionConfigOptionInfo | null
): SessionConfigOptionInfo[] {
  if (!option) return configOptions
  const rest = configOptions.filter((item) => item.id !== option.id)
  return [option, ...rest]
}
