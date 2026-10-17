export function shouldShowAgentTypePicker(input: {
  canPick: boolean
  isDraft: boolean
  hasTranscript: boolean
  hasStartedSend: boolean
}): boolean {
  return (
    input.canPick &&
    input.isDraft &&
    !input.hasTranscript &&
    !input.hasStartedSend
  )
}
