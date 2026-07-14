import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createProjectAgentConversation,
  fetchProjectAgentConversationMessages,
  fetchProjectAgentConversations,
  runProjectAgentParametric,
  sendProjectAgentConversationMessage,
} from 'src/api/projects'
import type { ProjectModel } from 'src/types/project'
import { useProjectAssistantController } from './use-project-assistant-controller'

vi.mock('src/api/projects', () => ({
  createProjectAgentConversation: vi.fn(),
  fetchProjectAgentConversationMessages: vi.fn(),
  fetchProjectAgentConversations: vi.fn(),
  fetchProjectParametricArtifacts: vi.fn(),
  runProjectAgentParametric: vi.fn(),
  sendProjectAgentConversationMessage: vi.fn(),
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
    vi.mocked(sendProjectAgentConversationMessage).mockResolvedValue({
      data: {
        message: {
          id: 'agm_answer',
          project_id: projectId,
          conversation_id: 'agc_first',
          role: 'assistant',
          body: 'Inspection complete',
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      },
    } as Awaited<ReturnType<typeof sendProjectAgentConversationMessage>>)
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useProjectAssistantController({ projectId, enabled: true }),
      { wrapper },
    )

    await waitFor(() => expect(result.current.activeConversationID).toBe('agc_first'))
    act(() => result.current.setDraft('Inspect this model'))
    act(() => result.current.submitMessage())

    await waitFor(() =>
      expect(sendProjectAgentConversationMessage).toHaveBeenCalledWith(projectId, 'agc_first', {
        messages: [{ role: 'user', body: 'Inspect this model' }],
      }),
    )
    expect(result.current.draft).toBe('')
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
    await waitFor(() => expect(result.current.parametricRunError).toBe('Assistant could not answer right now. Check the AI provider configuration and try again.'))
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
  })

  it('sends the selected model as revision context for ordinary Assistant messages', async () => {
    vi.mocked(sendProjectAgentConversationMessage).mockResolvedValue({
      data: {
        message: {
          id: 'agm_answer',
          project_id: projectId,
          conversation_id: 'agc_first',
          role: 'assistant',
          body: 'Created a revised draft',
          created_at: '2026-07-13T00:00:00Z',
          updated_at: '2026-07-13T00:00:00Z',
        },
      },
    } as Awaited<ReturnType<typeof sendProjectAgentConversationMessage>>)
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

    await waitFor(() =>
      expect(sendProjectAgentConversationMessage).toHaveBeenCalledWith(projectId, 'agc_first', {
        messages: [{ role: 'user', body: '直接修改模型' }],
        active_model_id: 'mdl_sphere',
      }),
    )
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
