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
  test('stays out of the default sidebar when no position links exist', () => {
    render(<ProjectAssemblyConstraints constraints={[]} occurrences={occurrences} onDelete={vi.fn()} />)

    expect(screen.queryByTestId('assembly-constraints')).toBeNull()
  })

  test('keeps existing position links collapsed until the user opens advanced management', async () => {
    const user = userEvent.setup()
    render(
      <ProjectAssemblyConstraints
        constraints={[{
          id: 'cst_point', kind: 'mate', name: 'Driver to driven', first_occurrence_id: 'occ_driver', second_occurrence_id: 'occ_driven',
          status: 'solved', solver: 'point-coincident-v1', first_anchor: [1, 0, 0], second_anchor: [2, 0, 0], offset: [10, 0, 0], residual: 0,
        }]}
        occurrences={occurrences}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.queryByText('Driven follows Driver')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Advanced position links, 1 link' }))

    expect(screen.getByText('Driven follows Driver')).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
    expect(screen.queryByText(/residual/i)).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  test('describes unresolved legacy records without claiming that one model follows another', async () => {
    const user = userEvent.setup()
    render(
      <ProjectAssemblyConstraints
        constraints={[{
          id: 'cst_legacy', kind: 'mate', name: 'Legacy mate', first_occurrence_id: 'occ_driver', second_occurrence_id: 'occ_driven',
          status: 'unresolved',
        }]}
        occurrences={occurrences}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Advanced position links, 1 link' }))

    expect(screen.getByText('Inactive legacy link between Driver and Driven')).toBeTruthy()
    expect(screen.queryByText('Driven follows Driver')).toBeNull()
    expect(screen.getByText('Needs attention')).toBeTruthy()
  })

  test('removes an existing position link from advanced management', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <ProjectAssemblyConstraints
        constraints={[{
          id: 'cst_point', kind: 'mate', name: 'Driver to driven', first_occurrence_id: 'occ_driver', second_occurrence_id: 'occ_driven',
          status: 'solved', solver: 'point-coincident-v1', first_anchor: [1, 0, 0], second_anchor: [2, 0, 0], offset: [10, 0, 0], residual: 0,
        }]}
        occurrences={occurrences}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Advanced position links, 1 link' }))
    await user.click(screen.getByRole('button', { name: 'Remove position link Driver to driven' }))
    expect(onDelete).toHaveBeenCalledWith('cst_point')
  })
})
