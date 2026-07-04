import client from './client'

export interface StudioStatus {
  name: string
  status: 'initializing' | 'ready'
  summary: string
  capabilities: string[]
}

export function fetchStudioStatus() {
  return client.get<StudioStatus>('/studio/status')
}
