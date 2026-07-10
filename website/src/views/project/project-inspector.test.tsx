import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectInspector } from './project-inspector'

afterEach(cleanup)

describe('ProjectInspector', () => {
  it('forwards position edits, clear, and component deletion', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const onDelete = vi.fn()
    const onTransformChange = vi.fn()
    render(
      <ProjectInspector
        documentDetails={[]}
        modelCount={1}
        onClear={onClear}
        onDelete={onDelete}
        onTransformChange={onTransformChange}
        selected={{
          canDelete: true,
          deleteError: '',
          details: [{ label: 'Format', value: 'STEP-COMPONENT' }],
          isDeleting: false,
          name: 'Bracket',
          nodeId: 'node_child_one',
          stepExportError: '',
          stepExportStatus: '',
          transformDraft: { x: '0', y: '1', z: '2' },
          transformError: '',
        }}
        unitLabel="mm"
      />,
    )

    fireEvent.change(screen.getByLabelText('X position for Bracket'), { target: { value: '12.5' } })
    await user.click(screen.getByRole('button', { name: 'Delete Bracket' }))
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onTransformChange).toHaveBeenCalledWith('node_child_one', 'x', '12.5')
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
