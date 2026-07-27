import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectAssistantPanel } from './project-assistant-panel'

afterEach(() => cleanup())

describe('ProjectAssistantPanel', () => {
  it('forwards close, draft, and submit interactions without owning route state', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onDraftChange = vi.fn()
    const onSubmit = vi.fn()
    render(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        conversations={[{ id: 'agc_one', title: 'Initial review', updated_at: '2026-07-11T00:00:00Z' }]}
        draft="Inspect the bracket"
        isPending={false}
        maxWidth={680}
        messages={[{ id: 'assistant_one', role: 'assistant', body: 'Ready.' }]}
        onClose={onClose}
        onCreateConversation={vi.fn()}
        onDraftChange={onDraftChange}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onSelectConversation={vi.fn()}
        onSubmit={onSubmit}
        open
        sourceCount={2}
        width={420}
      />,
    )

    fireEvent.change(screen.getByLabelText('Message Assistant'), { target: { value: 'Check clearances' } })
    await user.click(screen.getByRole('button', { name: 'Send Assistant message' }))
    await user.click(screen.getByRole('button', { name: 'Close Assistant' }))

    expect(onDraftChange).toHaveBeenCalledWith('Check clearances')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByText('2 project sources attached')).not.toBeNull()
  })

  it('creates a new Assistant conversation and changes the active conversation', async () => {
    const user = userEvent.setup()
    const onCreateConversation = vi.fn()
    const onSelectConversation = vi.fn()
    render(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        conversations={[
          { id: 'agc_one', title: 'Old bracket pass', updated_at: '2026-07-11T00:00:00Z' },
          { id: 'agc_two', title: 'Fresh enclosure pass', updated_at: '2026-07-11T01:00:00Z' },
        ]}
        draft="Old draft"
        isPending={false}
        maxWidth={680}
        messages={[{ id: 'assistant_one', role: 'assistant', body: 'Old answer.' }]}
        onClose={vi.fn()}
        onCreateConversation={onCreateConversation}
        onDraftChange={vi.fn()}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onSelectConversation={onSelectConversation}
        onSubmit={vi.fn()}
        open
        sourceCount={1}
        width={420}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Assistant conversation'), 'agc_two')
    await user.click(screen.getByRole('button', { name: 'New chat' }))

    expect(onSelectConversation).toHaveBeenCalledWith('agc_two')
    expect(onCreateConversation).toHaveBeenCalledTimes(1)
    expect(screen.getByDisplayValue('Old bracket pass')).not.toBeNull()
  })

  it('does not send messages when no conversation is selected', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ProjectAssistantPanel
        conversations={[]}
        draft="Inspect the bracket"
        isPending={false}
        maxWidth={680}
        messages={[]}
        onClose={vi.fn()}
        onCreateConversation={vi.fn()}
        onDraftChange={vi.fn()}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onSelectConversation={vi.fn()}
        onSubmit={onSubmit}
        open
        sourceCount={0}
        width={420}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Send Assistant message' }))

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send Assistant message' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Generate parametric model' }).disabled).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('forwards parametric generation from the current draft', async () => {
    const user = userEvent.setup()
    const onGenerateParametric = vi.fn()
    render(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        conversations={[{ id: 'agc_one', title: 'Design pass', updated_at: '2026-07-11T00:00:00Z' }]}
        draft="Make a mounting bracket"
        isPending={false}
        maxWidth={680}
        messages={[]}
        onClose={vi.fn()}
        onCreateConversation={vi.fn()}
        onDraftChange={vi.fn()}
        onGenerateParametric={onGenerateParametric}
        onResizePointerDown={vi.fn()}
        onSelectConversation={vi.fn()}
        onSubmit={vi.fn()}
        open
        sourceCount={0}
        width={420}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Generate parametric model' }))

    expect(onGenerateParametric).toHaveBeenCalledTimes(1)
  })

  it('shows parametric run status and forwards retry guidance', async () => {
    const user = userEvent.setup()
    const onRetryParametric = vi.fn()
    const { rerender } = render(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        conversations={[{ id: 'agc_one', title: 'Design pass', updated_at: '2026-07-11T00:00:00Z' }]}
        draft=""
        isPending
        maxWidth={680}
        messages={[]}
        onClose={vi.fn()}
        onCreateConversation={vi.fn()}
        onDraftChange={vi.fn()}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onRetryParametric={onRetryParametric}
        onSelectConversation={vi.fn()}
        onSubmit={vi.fn()}
        open
        parametricProgress={{ attempt: 2, prompt: 'Make a mounting bracket' }}
        pendingKind="parametric"
        retryParametricPrompt="Make a mounting bracket"
        sourceCount={0}
        width={420}
      />,
    )

    expect(screen.getByText('Generating model')).not.toBeNull()
    expect(screen.getByText('Generating parametric model')).not.toBeNull()
    expect(screen.getByText('Attempt 2 is running. The canvas will stay unchanged until LiteCAD accepts a valid source draft.')).not.toBeNull()
    expect(screen.getByText('Provider response and validation in progress')).not.toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'New chat' }).disabled).toBe(true)

    rerender(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        conversations={[{ id: 'agc_one', title: 'Design pass', updated_at: '2026-07-11T00:00:00Z' }]}
        draft=""
        isPending={false}
        maxWidth={680}
        messages={[]}
        onClose={vi.fn()}
        onCreateConversation={vi.fn()}
        onDraftChange={vi.fn()}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onRetryParametric={onRetryParametric}
        onSelectConversation={vi.fn()}
        onSubmit={vi.fn()}
        open
        parametricRunError="Assistant could not answer right now."
        pendingKind="idle"
        retryParametricPrompt="Make a mounting bracket"
        sourceCount={0}
        width={420}
      />,
    )

    expect(screen.getByText('Generation needs attention')).not.toBeNull()
    expect(screen.getByText('Assistant could not answer right now.')).not.toBeNull()
    expect(screen.getByText(/No canvas changes were made/)).not.toBeNull()
    expect(screen.getByText(/Make a mounting bracket/)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Retry generation' }))

    expect(onRetryParametric).toHaveBeenCalledTimes(1)
  })

  it('shows selected-model revision context while generating', () => {
    render(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        activeModelName="球体三轴通孔"
        conversations={[{ id: 'agc_one', title: 'Design pass', updated_at: '2026-07-11T00:00:00Z' }]}
        draft=""
        isPending
        maxWidth={680}
        messages={[]}
        onClose={vi.fn()}
        onCreateConversation={vi.fn()}
        onDraftChange={vi.fn()}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onSelectConversation={vi.fn()}
        onSubmit={vi.fn()}
        open
        parametricProgress={{ attempt: 1, prompt: '直接修改模型', activeModelName: '球体三轴通孔' }}
        pendingKind="parametric"
        sourceCount={1}
        width={420}
      />,
    )

    expect(screen.getByText('Revising:')).not.toBeNull()
    expect(screen.getByText('球体三轴通孔')).not.toBeNull()
  })

  it('shows live Assistant stage, provider reasoning, and partial answer content', () => {
    render(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        conversations={[{ id: 'agc_one', title: 'Streaming review', updated_at: '2026-07-26T00:00:00Z' }]}
        draft=""
        isPending
        maxWidth={680}
        messages={[
          {
            id: 'assistant_stream',
            role: 'assistant',
            body: 'The bracket is',
            stream: {
              reasoning: 'Checking source metadata and current model context.',
              stage: 'provider',
              state: 'active',
            },
          },
        ]}
        onClose={vi.fn()}
        onCreateConversation={vi.fn()}
        onDraftChange={vi.fn()}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onSelectConversation={vi.fn()}
        onSubmit={vi.fn()}
        open
        pendingKind="message"
        sourceCount={1}
        width={420}
      />,
    )

    expect(screen.getByRole('status', { name: 'Assistant activity' })).not.toBeNull()
    expect(screen.getByText('Waiting for AI provider')).not.toBeNull()
    expect(screen.getByText('Provider reasoning')).not.toBeNull()
    expect(screen.getByText('Checking source metadata and current model context.')).not.toBeNull()
    expect(screen.getByText('The bracket is')).not.toBeNull()
  })

  it('keeps partial content and shows explicit recovery guidance after a stream error', () => {
    render(
      <ProjectAssistantPanel
        activeConversationId="agc_one"
        conversations={[{ id: 'agc_one', title: 'Interrupted review', updated_at: '2026-07-26T00:00:00Z' }]}
        draft=""
        isPending={false}
        maxWidth={680}
        messages={[
          {
            id: 'assistant_stream_error',
            role: 'assistant',
            body: 'Partial inspection result',
            stream: {
              error: 'The provider connection ended unexpectedly.',
              reasoning: '',
              stage: 'provider',
              state: 'error',
            },
          },
        ]}
        onClose={vi.fn()}
        onCreateConversation={vi.fn()}
        onDraftChange={vi.fn()}
        onGenerateParametric={vi.fn()}
        onResizePointerDown={vi.fn()}
        onSelectConversation={vi.fn()}
        onSubmit={vi.fn()}
        open
        sourceCount={1}
        width={420}
      />,
    )

    expect(screen.getByText('Response interrupted')).not.toBeNull()
    expect(screen.getByText('The provider connection ended unexpectedly.')).not.toBeNull()
    expect(screen.getByText('Partial inspection result')).not.toBeNull()
    expect(
      screen.getByText(
        'LiteCAD checked the saved conversation and preserved this partial response. Retry only if no completed reply appears.',
      ),
    ).not.toBeNull()
  })
})
