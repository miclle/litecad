import type {
  ProjectAgentMessageResponse,
  ProjectAgentStreamEvent,
  ProjectAgentStreamStage,
  SendProjectAgentMessagePayload,
} from 'src/types/project'
import { redirectToLoginOnUnauthorized } from './client'

type ProjectAgentStreamEventHandler = (event: ProjectAgentStreamEvent) => void

export class ProjectAgentStreamError extends Error {
  response: {
    data: { message: string }
    status: number
  }

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ProjectAgentStreamError'
    this.response = {
      status,
      data: { message },
    }
  }
}

export async function streamProjectAgentConversationMessage(
  projectId: string,
  conversationId: string,
  payload: SendProjectAgentMessagePayload,
  onEvent: ProjectAgentStreamEventHandler,
  signal?: AbortSignal,
): Promise<ProjectAgentMessageResponse> {
  const endpoint = `/api/v1/projects/${encodeURIComponent(projectId)}/agent/conversations/${encodeURIComponent(conversationId)}/messages/stream`
  const response = await fetch(
    endpoint,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    },
  )
  if (!response.ok) {
    redirectToLoginOnUnauthorized(response.status, endpoint)
    throw await projectAgentHTTPError(response)
  }
  if (!response.body) {
    throw new ProjectAgentStreamError(502, 'Assistant stream did not return a response body')
  }

  let result: ProjectAgentMessageResponse | undefined
  await parseProjectAgentSSEStream(response.body, (event) => {
    onEvent(event)
    if (event.type === 'result') {
      result = {
        message: event.message,
        ...(event.artifact ? { artifact: event.artifact } : {}),
      }
    }
    if (event.type === 'error') {
      redirectToLoginOnUnauthorized(event.status, endpoint)
      throw new ProjectAgentStreamError(event.status, event.message)
    }
  })
  if (!result) {
    throw new ProjectAgentStreamError(502, 'Assistant stream ended before the final result')
  }
  if (result.message.project_id !== projectId || result.message.conversation_id !== conversationId) {
    throw new ProjectAgentStreamError(502, 'Assistant stream returned a result for another conversation')
  }
  if (
    payload.client_request_id &&
    result.message.client_request_id !== payload.client_request_id
  ) {
    throw new ProjectAgentStreamError(502, 'Assistant stream returned a result for another request')
  }
  return result
}

export async function parseProjectAgentSSEStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: ProjectAgentStreamEventHandler,
) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      let frameBoundary = nextSSEFrameBoundary(buffer)
      while (frameBoundary) {
        const frame = buffer.slice(0, frameBoundary.index)
        buffer = buffer.slice(frameBoundary.index + frameBoundary.length)
        const event = parseProjectAgentSSEFrame(frame)
        if (event) {
          onEvent(event)
        }
        frameBoundary = nextSSEFrameBoundary(buffer)
      }
      if (done) {
        break
      }
    }
    if (buffer.trim() !== '') {
      const event = parseProjectAgentSSEFrame(buffer)
      if (event) {
        onEvent(event)
      }
    }
  } catch (error) {
    try {
      await reader.cancel(error)
    } catch {
      // Preserve the original parser or callback error.
    }
    throw error
  } finally {
    reader.releaseLock()
  }
}

function nextSSEFrameBoundary(value: string) {
  const match = /\r?\n\r?\n/.exec(value)
  return match ? { index: match.index, length: match[0].length } : undefined
}

function parseProjectAgentSSEFrame(frame: string): ProjectAgentStreamEvent | undefined {
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) {
      continue
    }
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }
  if (dataLines.length === 0) {
    return undefined
  }

  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    throw new ProjectAgentStreamError(502, 'Assistant stream returned invalid JSON')
  }
  if (!isRecord(data)) {
    throw new ProjectAgentStreamError(502, 'Assistant stream returned an invalid event')
  }

  if (eventName === 'status' && isProjectAgentStreamStage(data.stage)) {
    return { type: 'status', stage: data.stage }
  }
  if ((eventName === 'reasoning' || eventName === 'content') && typeof data.delta === 'string') {
    return { type: eventName, delta: data.delta }
  }
  if (eventName === 'result' && isProjectAgentMessageResponse(data)) {
    return {
      type: 'result',
      message: data.message,
      ...(data.artifact ? { artifact: data.artifact } : {}),
    }
  }
  if (eventName === 'error' && typeof data.status === 'number' && typeof data.message === 'string') {
    return { type: 'error', status: data.status, message: data.message }
  }
  throw new ProjectAgentStreamError(502, `Assistant stream returned an invalid ${eventName} event`)
}

function isProjectAgentStreamStage(value: unknown): value is ProjectAgentStreamStage {
  return value === 'accepted' || value === 'context' || value === 'provider' || value === 'persisting' || value === 'complete'
}

function isProjectAgentMessageResponse(value: unknown): value is ProjectAgentMessageResponse {
  if (!isRecord(value)) {
    return false
  }
  const message = value.message
  return (
    isRecord(message) &&
    typeof message.id === 'string' &&
    typeof message.project_id === 'string' &&
    typeof message.conversation_id === 'string' &&
    (message.client_request_id === undefined || typeof message.client_request_id === 'string') &&
    message.role === 'assistant' &&
    typeof message.body === 'string' &&
    typeof message.created_at === 'string' &&
    typeof message.updated_at === 'string' &&
    (value.artifact === undefined || isProjectParametricArtifact(value.artifact))
  )
}

function isProjectParametricArtifact(value: unknown) {
  if (!isRecord(value)) {
    return false
  }
  return (
    typeof value.id === 'string' &&
    typeof value.project_id === 'string' &&
    typeof value.conversation_id === 'string' &&
    typeof value.message_id === 'string' &&
    typeof value.title === 'string' &&
    (value.source_kind === 'openscad' || value.source_kind === 'litecad-feature-dsl') &&
    typeof value.source_code === 'string' &&
    isRecord(value.parameter_values) &&
    (value.compile_status === 'pending' || value.compile_status === 'success' || value.compile_status === 'error') &&
    typeof value.compile_error === 'string' &&
    typeof value.preview_model_id === 'string' &&
    (value.generation_tool_mode === '' ||
      value.generation_tool_mode === 'json_fallback' ||
      value.generation_tool_mode === 'native_tool') &&
    typeof value.generation_duration_ms === 'number' &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function projectAgentHTTPError(response: Response) {
  const body = await response.text()
  let message = body || `Assistant request failed with status ${response.status}`
  try {
    const data = JSON.parse(body) as { message?: unknown }
    if (typeof data.message === 'string' && data.message.trim() !== '') {
      message = data.message
    }
  } catch {
    // Plain-text error bodies are already suitable for the shared error boundary.
  }
  return new ProjectAgentStreamError(response.status, message)
}
