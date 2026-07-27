import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createProjectAgentConversation,
  fetchProjectAgentConversationMessages,
  fetchProjectAgentConversations,
  runProjectAgentParametric,
} from 'src/api/projects'
import { streamProjectAgentConversationMessage } from 'src/api/project-agent-stream'
import type { ProjectModel } from 'src/types/project'
import { projectAssistantErrorMessage, useProjectAssistantController } from './use-project-assistant-controller'

vi.mock('src/api/projects', () => ({
  createProjectAgentConversation: vi.fn(),
  fetchProjectAgentConversationMessages: vi.fn(),
  fetchProjectAgentConversations: vi.fn(),
  fetchProjectParametricArtifacts: vi.fn(),
  runProjectAgentParametric: vi.fn(),
}))

vi.mock('src/api/project-agent-stream', () => ({
  streamProjectAgentConversationMessage: vi.fn(),
}))

const projectId = 'project_assistant'

function createHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useProjectAssistantController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchProjectAgentConversations).mockResolvedValue({
      data: {
        conversations: [
          { id: 'agc_first', project_id: projectId, title: 'First pass', active_model_id: '', updated_at: '2026-07-13T00:00:00Z' },
        ],
      },
    } as Awaited<ReturnType<typeof fetchProjectAgentConversations>>)
    vi.mocked(fetchProjectAgentConversationMessages).mockResolvedValue({
      data: {
        messages: [
          {
            id: 'agm_reply',
            project_id: projectId,
            conversation_id: 'agc_first',
            role: 'assistant',
            body: 'Persisted reply',
            created_at: '2026-07-13T00:00:00Z',
            updated_at: '2026-07-13T00:00:00Z',
          },
        ],
      },
    } as Awaited<ReturnType<typeof fetchProjectAgentConversationMessages>>)
    vi.mocked(streamProjectAgentConversationMessage).mockResolvedValue({
      message: {
        id: 'agm_answer',
        project_id: projectId,
        conversation_id: 'agc_first',
        role: 'assistant',
        body: 'Inspection complete',
        created_at: '2026-07-13T00:00:00Z',
        updated_at: '2026-07-13T00:00:00Z',
      },
    })
  })

  it('selects the first conversation and composes persisted messages', async () => {
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    await waitFor(() => expect(result.current.messages.map((message) => message.body)).toEqual(['Persisted reply']))
  })

  it('submits the current draft through the active conversation', async () => {
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    act(() => result.current.setDraft('Inspect this model'))
    act(() => result.current.submitMessage())

    await waitFor(() => expect(streamProjectAgentConversationMessage).toHaveBeenCalled())
    expect(vi.mocked(streamProjectAgentConversationMessage).mock.calls[0]?.slice(0, 3)).toEqual([
      projectId,
      'agc_first',
      expect.objectContaining({
        client_request_id: expect.stringMatching(/^local-assistant-stream-/),
        messages: [{ role: 'user', body: 'Inspect this model' }],
      }),
    ])
    expect(result.current.draft).toBe('')
  })

  it('shows Assistant progress, reasoning, and partial content before the stream completes', async () => {
    let emitEvent: Parameters<typeof streamProjectAgentConversationMessage>[3] = () => undefined
    let finishStream: (value: Awaited<ReturnType<typeof streamProjectAgentConversationMessage>>) => void = () => undefined
    let clientRequestID = ''
    vi.mocked(streamProjectAgentConversationMessage).mockImplementation(
      (_projectID, _conversationID, payload, onEvent) =>
        new Promise((resolve) => {
          clientRequestID = payload.client_request_id ?? ''
          emitEvent = onEvent
          finishStream = resolve
        }),
    )
    const { queryClient, wrapper } = createHarness()
    const { result } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    act(() => result.current.setDraft('Inspect streaming state'))
    act(() => result.current.submitMessage())

    await waitFor(() => expect(result.current.pendingKind).toBe('message'))
    expect(result.current.messages.at(-1)?.stream).toMatchObject({ stage: 'connecting', state: 'active' })

    act(() => {
      emitEvent({ type: 'status', stage: 'context' })
      emitEvent({ type: 'reasoning', delta: 'Checking source metadata.' })
      emitEvent({ type: 'content', delta: 'The bracket ' })
      emitEvent({ type: 'content', delta: 'is ready.' })
    })

    expect(result.current.messages.at(-1)).toMatchObject({
      role: 'assistant',
      body: 'The bracket is ready.',
      stream: {
        stage: 'context',
        reasoning: 'Checking source metadata.',
        state: 'active',
      },
    })

    act(() => {
      queryClient.setQueryData(['project-agent-messages', projectId, 'agc_first'], [
        {
          id: 'agm_streamed_user',
          project_id: projectId,
          conversation_id: 'agc_first',
          client_request_id: clientRequestID,
          role: 'user',
          body: 'Inspect streaming state',
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
        {
          id: 'agm_streamed',
          project_id: projectId,
          conversation_id: 'agc_first',
          client_request_id: clientRequestID,
          role: 'assistant',
          body: 'The bracket is ready.',
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      ])
    })
    expect(result.current.messages.filter((message) => message.body === 'The bracket is ready.')).toHaveLength(1)

    act(() =>
      finishStream({
        message: {
          id: 'agm_streamed',
          project_id: projectId,
          conversation_id: 'agc_first',
          client_request_id: clientRequestID,
          role: 'assistant',
          body: 'The bracket is ready.',
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      }),
    )
    await waitFor(() => expect(result.current.pendingKind).toBe('idle'))
  })

  it('reconciles a persisted reply when the stream disconnects before the result event', async () => {
    let rejectStream: (error: Error) => void = () => undefined
    let clientRequestID = ''
    vi.mocked(streamProjectAgentConversationMessage).mockImplementation(
      (_projectID, _conversationID, payload) =>
        new Promise((_, reject) => {
          clientRequestID = payload.client_request_id ?? ''
          rejectStream = reject
        }),
    )
    let messageFetchCount = 0
    vi.mocked(fetchProjectAgentConversationMessages).mockImplementation(async () => {
      messageFetchCount += 1
      if (messageFetchCount === 1) {
        return {
        data: {
          messages: [
            {
              id: 'agm_reply',
              project_id: projectId,
              conversation_id: 'agc_first',
              role: 'assistant',
              body: 'Persisted reply',
              created_at: '2026-07-13T00:00:00Z',
              updated_at: '2026-07-13T00:00:00Z',
            },
          ],
        },
        } as Awaited<ReturnType<typeof fetchProjectAgentConversationMessages>>
      }
      return {
        data: {
          messages: [
            {
              id: 'agm_reply',
              project_id: projectId,
              conversation_id: 'agc_first',
              role: 'assistant',
              body: 'Persisted reply',
              created_at: '2026-07-13T00:00:00Z',
              updated_at: '2026-07-13T00:00:00Z',
            },
            {
              id: 'agm_stale_user',
              project_id: projectId,
              conversation_id: 'agc_first',
              client_request_id: 'other_request',
              role: 'user',
              body: 'Inspect persisted state',
              created_at: '2026-07-25T00:00:00Z',
              updated_at: '2026-07-25T00:00:00Z',
            },
            {
              id: 'agm_stale_assistant',
              project_id: projectId,
              conversation_id: 'agc_first',
              client_request_id: 'other_request',
              role: 'assistant',
              body: 'Older identical prompt reply',
              created_at: '2026-07-25T00:00:01Z',
              updated_at: '2026-07-25T00:00:01Z',
            },
            {
              id: 'agm_user_recovered',
              project_id: projectId,
              conversation_id: 'agc_first',
              client_request_id: clientRequestID,
              role: 'user',
              body: 'Inspect persisted state',
              created_at: '2026-07-26T00:00:00Z',
              updated_at: '2026-07-26T00:00:00Z',
            },
            {
              id: 'agm_assistant_recovered',
              project_id: projectId,
              conversation_id: 'agc_first',
              client_request_id: clientRequestID,
              role: 'assistant',
              body: 'Recovered after disconnect',
              created_at: '2026-07-26T00:00:01Z',
              updated_at: '2026-07-26T00:00:01Z',
            },
          ],
        },
      } as Awaited<ReturnType<typeof fetchProjectAgentConversationMessages>>
    })
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    act(() => result.current.setDraft('Inspect persisted state'))
    act(() => result.current.submitMessage())
    await waitFor(() => expect(result.current.pendingKind).toBe('message'))
    expect(clientRequestID).toMatch(/^local-assistant-stream-/)

    act(() => rejectStream(new Error('connection closed after persistence')))

    await waitFor(() => expect(result.current.pendingKind).toBe('idle'))
    await waitFor(() => expect(result.current.messages.map((message) => message.body)).toContain('Recovered after disconnect'))
    expect(messageFetchCount).toBeGreaterThanOrEqual(2)
    expect(result.current.messages.some((message) => message.stream?.state === 'error')).toBe(false)
  })

  it('aborts the provider stream when the controller unmounts', async () => {
    let capturedSignal: AbortSignal | undefined
    vi.mocked(streamProjectAgentConversationMessage).mockImplementation(
      (_projectID, _conversationID, _payload, _onEvent, signal) =>
        new Promise((_, reject) => {
          capturedSignal = signal
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const { wrapper } = createHarness()
    const { result, unmount } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    act(() => result.current.setDraft('Inspect cancellation'))
    act(() => result.current.submitMessage())
    await waitFor(() => expect(capturedSignal).toBeDefined())

    unmount()

    expect(capturedSignal?.aborted).toBe(true)
  })

  it('creates and selects a fresh conversation', async () => {
    vi.mocked(createProjectAgentConversation).mockResolvedValue({
      data: {
        conversation: {
          id: 'agc_new',
          project_id: projectId,
          title: 'New chat',
          active_model_id: '',
          updated_at: '2026-07-13T00:00:00Z',
        },
      },
    } as Awaited<ReturnType<typeof createProjectAgentConversation>>)
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    vi.mocked(fetchProjectAgentConversations).mockResolvedValue({
      data: {
        conversations: [
          { id: 'agc_new', project_id: projectId, title: 'New chat', active_model_id: '', updated_at: '2026-07-13T00:00:00Z' },
          { id: 'agc_first', project_id: projectId, title: 'First pass', active_model_id: '', updated_at: '2026-07-13T00:00:00Z' },
        ],
      },
    } as Awaited<ReturnType<typeof fetchProjectAgentConversations>>)
    act(() => result.current.createConversation())

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_new'))
  })

  it('tracks parametric generation progress and retry attempts after failures', async () => {
    let rejectFirstRun: (error: Error) => void = () => undefined
    let rejectSecondRun: (error: Error) => void = () => undefined
    let rejectThirdRun: (error: Error) => void = () => undefined
    vi.mocked(runProjectAgentParametric)
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirstRun = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSecondRun = reject
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectThirdRun = reject
          }),
      )
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    act(() => result.current.setDraft('Make a mounting bracket'))
    act(() => result.current.generateParametricArtifact())

    await waitFor(() => expect(result.current.pendingKind).toBe('parametric'))
    expect(result.current.parametricProgress).toEqual({ attempt: 1, prompt: 'Make a mounting bracket' })
    act(() => rejectFirstRun(new Error('tool output invalid')))
    await waitFor(() => expect(result.current.parametricRunError).toBe('Assistant could not answer right now. Retry the request or check the server logs.'))
    expect(result.current.parametricProgress).toBeUndefined()
    expect(result.current.retryParametricPrompt).toBe('Make a mounting bracket')

    act(() => result.current.retryParametricGeneration())

    await waitFor(() => expect(result.current.parametricProgress).toEqual({ attempt: 2, prompt: 'Make a mounting bracket' }))
    act(() => rejectSecondRun(new Error('tool output invalid')))
    await waitFor(() => expect(result.current.parametricProgress).toBeUndefined())

    act(() => result.current.setDraft('Make a hinge plate'))
    act(() => result.current.generateParametricArtifact())

    await waitFor(() => expect(result.current.parametricProgress).toEqual({ attempt: 1, prompt: 'Make a hinge plate' }))
    act(() => rejectThirdRun(new Error('tool output invalid')))
    await waitFor(() => expect(result.current.parametricProgress).toBeUndefined())
    expect(runProjectAgentParametric).toHaveBeenCalledTimes(3)
  })

  it('uses a provider-specific error for failed AI provider requests', () => {
    expect(projectAssistantErrorMessage({ response: { status: 502 } }, (key) => key)).toBe(
      'project.assistant.providerRequestFailed',
    )
    expect(projectAssistantErrorMessage({ response: { status: 422 } }, (key) => key)).toBe(
      'project.assistant.providerInvalidOutput',
    )
    expect(projectAssistantErrorMessage({ response: { status: 500, data: 'backend failure' } }, (key) => key)).toBe(
      'backend failure',
    )
    expect(projectAssistantErrorMessage(new Error('network failed'), (key) => key)).toBe('project.assistant.answerFailed')
  })

  it('sends the selected model as revision context for parametric generation', async () => {
    vi.mocked(runProjectAgentParametric).mockResolvedValue({
      data: {
        message: {
          id: 'agm_parametric',
          project_id: projectId,
          conversation_id: 'agc_first',
          role: 'assistant',
          body: '{"tool":"build_parametric_model"}',
          parts: [],
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
        artifact: {
          id: 'pma_revision',
          project_id: projectId,
          conversation_id: 'agc_first',
          message_id: 'agm_parametric',
          title: '球体三轴通孔 修正版',
          source_kind: 'litecad-feature-dsl',
          source_code: '{}',
          parameter_values: {},
          compile_status: 'pending',
          compile_error: '',
          preview_model_id: '',
          generation_tool_mode: 'native_tool',
          generation_duration_ms: 120,
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
        telemetry: { tool_mode: 'native_tool', source_kind: 'litecad-feature-dsl', duration_ms: 120 },
      },
    } as unknown as Awaited<ReturnType<typeof runProjectAgentParametric>>)
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () =>
        useProjectAssistantController({
          activeModel: {
            id: 'mdl_sphere',
            project_id: projectId,
            original_filename: '球体三轴通孔-litecad.lcad.json',
            format: 'lcad',
            content_type: 'application/json',
            byte_size: 120,
            parse_status: 'parsed',
            parse_error: '',
            current_revision_id: 'mvr_sphere',
            revision_sequence: 1,
            metadata: {
              asset_type: 'lcad',
              source_kind: 'litecad-feature-dsl',
              version: '1',
              schema: 'litecad-feature-dsl',
              product_names: ['球体三轴通孔'],
              length_unit: 'millimetre',
              entity_count: 1,
              representation_count: 1,
              triangle_count: 0,
            },
            created_at: '2026-07-13T00:00:00Z',
            updated_at: '2026-07-13T00:00:00Z',
          },
          projectId,
          enabled: true,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    expect(result.current.activeModelName).toBe('球体三轴通孔')
    act(() => result.current.setDraft('直接修改模型，让 xyz 轴各有一个通孔'))
    act(() => result.current.generateParametricArtifact())

    await waitFor(() =>
      expect(runProjectAgentParametric).toHaveBeenCalledWith(projectId, 'agc_first', {
        message: '直接修改模型，让 xyz 轴各有一个通孔',
        active_model_id: 'mdl_sphere',
      }),
    )
    await waitFor(() => expect(result.current.generatedArtifactRevisionTargetModelID).toBe('mdl_sphere'))
  })

  it('sends the selected model as revision context for ordinary Assistant messages', async () => {
    vi.mocked(streamProjectAgentConversationMessage).mockResolvedValue({
      message: {
        id: 'agm_answer',
        project_id: projectId,
        conversation_id: 'agc_first',
        role: 'assistant',
        body: 'Created a revised draft',
        created_at: '2026-07-13T00:00:00Z',
        updated_at: '2026-07-13T00:00:00Z',
      },
    })
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () =>
        useProjectAssistantController({
          activeModel: activeSphereModel(),
          projectId,
          enabled: true,
        }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    act(() => result.current.setDraft('直接修改模型'))
    act(() => result.current.submitMessage())

    await waitFor(() => expect(streamProjectAgentConversationMessage).toHaveBeenCalled())
    expect(vi.mocked(streamProjectAgentConversationMessage).mock.calls[0]?.slice(0, 3)).toEqual([
      projectId,
      'agc_first',
      expect.objectContaining({
        messages: [{ role: 'user', body: '直接修改模型' }],
        active_model_id: 'mdl_sphere',
        client_request_id: expect.stringMatching(/^local-assistant-stream-/),
      }),
    ])
  })
})

function activeSphereModel(): ProjectModel {
  return {
    id: 'mdl_sphere',
    project_id: projectId,
    original_filename: '球体三轴通孔-litecad.lcad.json',
    format: 'lcad',
    content_type: 'application/json',
    byte_size: 120,
    parse_status: 'parsed',
    parse_error: '',
    current_revision_id: 'mvr_sphere',
    revision_sequence: 1,
    metadata: {
      asset_type: 'lcad',
      source_kind: 'litecad-feature-dsl',
      version: '1',
      schema: 'litecad-feature-dsl',
      product_names: ['球体三轴通孔'],
      length_unit: 'millimetre',
      entity_count: 1,
      representation_count: 1,
      triangle_count: 0,
    },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}
