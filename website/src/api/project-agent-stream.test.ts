import { afterEach, describe, expect, it, vi } from 'vitest'

import { redirectToLoginOnUnauthorized } from 'src/api/client'
import type { ProjectAgentStreamEvent } from 'src/types/project'
import { parseProjectAgentSSEStream, streamProjectAgentConversationMessage } from './project-agent-stream'

afterEach(() => {
  window.history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

describe('parseProjectAgentSSEStream', () => {
  it('parses ordered UTF-8 SSE events across arbitrary network chunks', async () => {
    const source = [
      'event: status\r\ndata: {"type":"status","stage":"context"}\r\n\r\n',
      'event: reasoning\ndata: {"type":"reasoning","delta":"正在检查项目上下文。"}\n\n',
      'event: content\ndata: {"type":"content","delta":"支架"}\n\n',
      'event: content\ndata: {"type":"content","delta":"已经就绪。"}\n\n',
      'event: result\ndata: {"message":{"id":"agm_stream","project_id":"prj_stream","conversation_id":"agc_stream","role":"assistant","body":"支架已经就绪。","created_at":"2026-07-26T00:00:00Z","updated_at":"2026-07-26T00:00:00Z"}}\n\n',
    ].join('')
    const bytes = new TextEncoder().encode(source)
    const splitPoints = [7, 31, 68, 91, 118, 149, 177, bytes.length]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let offset = 0
        for (const splitPoint of splitPoints) {
          controller.enqueue(bytes.slice(offset, splitPoint))
          offset = splitPoint
        }
        controller.close()
      },
    })
    const events: ProjectAgentStreamEvent[] = []

    await parseProjectAgentSSEStream(stream, (event) => {
      events.push(event)
    })

    expect(events).toEqual([
      { type: 'status', stage: 'context' },
      { type: 'reasoning', delta: '正在检查项目上下文。' },
      { type: 'content', delta: '支架' },
      { type: 'content', delta: '已经就绪。' },
      {
        type: 'result',
        message: {
          id: 'agm_stream',
          project_id: 'prj_stream',
          conversation_id: 'agc_stream',
          role: 'assistant',
          body: '支架已经就绪。',
          created_at: '2026-07-26T00:00:00Z',
          updated_at: '2026-07-26T00:00:00Z',
        },
      },
    ])
  })

  it('applies the shared login redirect behavior to unauthorized streams', async () => {
    const assign = vi.fn()
    redirectToLoginOnUnauthorized(401, '/projects/prj_stream/agent/conversations/agc_stream/messages/stream', {
      assign,
      pathname: '/projects/prj_stream',
    })

    expect(assign).toHaveBeenCalledWith('/login')

    window.history.replaceState(null, '', '/login')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"unauthorized"}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(
      streamProjectAgentConversationMessage(
        'prj_stream',
        'agc_stream',
        {
          client_request_id: 'assistant_request_01',
          messages: [{ role: 'user', body: 'Inspect the bracket' }],
        },
        () => undefined,
      ),
    ).rejects.toMatchObject({ response: { status: 401 } })
  })

  it('rejects a final result that does not belong to the requested message context', async () => {
    const source =
      'event: result\ndata: {"message":{"id":"agm_stream","project_id":"prj_stream","conversation_id":"agc_stream","client_request_id":"other_request","role":"assistant","body":"Wrong request","created_at":"2026-07-26T00:00:00Z","updated_at":"2026-07-26T00:00:00Z"}}\n\n'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(source, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })))

    await expect(
      streamProjectAgentConversationMessage(
        'prj_stream',
        'agc_stream',
        {
          client_request_id: 'assistant_request_01',
          messages: [{ role: 'user', body: 'Inspect the bracket' }],
        },
        () => undefined,
      ),
    ).rejects.toMatchObject({ response: { status: 502 } })
  })

  it('cancels the response reader when an event callback fails', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: content\ndata: {"delta":"partial"}\n\n'))
      },
    })

    await expect(
      parseProjectAgentSSEStream(stream, () => {
        throw new Error('consumer failed')
      }),
    ).rejects.toThrow('consumer failed')
    expect(cancel).toHaveBeenCalled()
  })
})
