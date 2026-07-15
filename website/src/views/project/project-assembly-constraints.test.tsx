import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ProjectAssemblyConstraints } from './project-assembly-constraints'
import type { CADAssemblyOccurrence } from 'src/types/project'

afterEach(cleanup)

const occurrences: CADAssemblyOccurrence[] = [
  {
    id: 'occ_driver', node_id: 'node_driver', model_id: 'mdl_driver', model_revision_id: 'mvr_driver',
    name: 'Driver', suppressed: false, transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  },
  {
    id: 'occ_driven', node_id: 'node_driven', model_id: 'mdl_driven', model_revision_id: 'mvr_driven',
    name: 'Driven', suppressed: false, transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  },
]

describe('ProjectAssemblyConstraints', () => {
  test('creates a point mate from explicit local anchors and offset', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<ProjectAssemblyConstraints constraints={[]} occurrences={occurrences} onCreate={onCreate} onDelete={vi.fn()} />)

    await user.clear(screen.getByRole('textbox', { name: 'Mate name' }))
    await user.type(screen.getByRole('textbox', { name: 'Mate name' }), 'Driver to driven')
    await user.clear(screen.getByRole('spinbutton', { name: 'Driver anchor X' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Driver anchor X' }), '1')
    await user.clear(screen.getByRole('spinbutton', { name: 'Driven anchor X' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Driven anchor X' }), '2')
    await user.clear(screen.getByRole('spinbutton', { name: 'Mate offset X' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Mate offset X' }), '10')
    await user.click(screen.getByRole('button', { name: 'Create point mate' }))

    expect(onCreate).toHaveBeenCalledWith({
      name: 'Driver to driven',
      kind: 'mate',
      first_occurrence_id: 'occ_driver',
      second_occurrence_id: 'occ_driven',
      first_anchor: [1, 0, 0],
      second_anchor: [2, 0, 0],
      offset: [10, 0, 0],
    })
  })

  test('renders solved mate status and deletes it', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <ProjectAssemblyConstraints
        constraints={[{
          id: 'cst_point', kind: 'mate', name: 'Driver to driven', first_occurrence_id: 'occ_driver', second_occurrence_id: 'occ_driven',
          status: 'solved', solver: 'point-coincident-v1', first_anchor: [1, 0, 0], second_anchor: [2, 0, 0], offset: [10, 0, 0], residual: 0,
        }]}
        occurrences={occurrences}
        onCreate={vi.fn()}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('Solved · residual 0')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Delete Driver to driven' }))
    expect(onDelete).toHaveBeenCalledWith('cst_point')
  })

  test('does not offer immutable reusable assembly members as mate endpoints', async () => {
    const user = userEvent.setup()
    render(
      <ProjectAssemblyConstraints
        constraints={[]}
        occurrences={[
          ...occurrences,
          { ...occurrences[1], id: 'occ_linked', name: 'Linked member', subassembly_member_id: 'smb_drive' },
        ]}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Driver occurrence' }))

    expect(screen.queryByRole('option', { name: 'Linked member' })).toBeNull()
  })
})
