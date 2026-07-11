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
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
