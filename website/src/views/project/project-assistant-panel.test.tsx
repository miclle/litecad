import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ProjectAssistantPanel } from './project-assistant-panel'

describe('ProjectAssistantPanel', () => {
  it('forwards close, draft, and submit interactions without owning route state', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onDraftChange = vi.fn()
    const onSubmit = vi.fn()
    render(
      <ProjectAssistantPanel
        draft="Inspect the bracket"
        isPending={false}
        maxWidth={680}
        messages={[{ id: 'assistant_one', role: 'assistant', body: 'Ready.' }]}
        onClose={onClose}
        onDraftChange={onDraftChange}
        onResizePointerDown={vi.fn()}
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
})
