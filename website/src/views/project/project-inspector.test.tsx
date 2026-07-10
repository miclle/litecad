import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectInspector } from './project-inspector'

afterEach(cleanup)

describe('ProjectInspector', () => {
  it('forwards position edits without duplicating selection controls', () => {
    const onTransformChange = vi.fn()
    render(
      <ProjectInspector
        documentDetails={[]}
        modelCount={1}
        onTransformChange={onTransformChange}
        selected={{
          deleteError: '',
          details: [{ label: 'Format', value: 'STEP-COMPONENT' }],
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

    expect(onTransformChange).toHaveBeenCalledWith('node_child_one', 'x', '12.5')
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Bracket' })).toBeNull()
  })
})
