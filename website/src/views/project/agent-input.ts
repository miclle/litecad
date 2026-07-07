export type AgentInputSubmitKey = {
  key: string
  shiftKey: boolean
  isComposing: boolean
}

export function shouldSubmitAgentInputFromKey(event: AgentInputSubmitKey) {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing
}
