import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CADAssemblyGroup, CADAssemblyOccurrence, CADSubassemblyDefinitionRevision } from 'src/types/project'
import { ProjectSubassemblies } from './project-subassemblies'

afterEach(cleanup)

const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

const groups: CADAssemblyGroup[] = [
  { id: 'grp_source', parent_group_id: '', name: 'Drive source', suppressed: false },
  { id: 'grp_nested', parent_group_id: '', name: 'Nested source', suppressed: false },
  { id: 'grp_child', parent_group_id: 'grp_nested', name: 'Child', suppressed: false },
  {
    id: 'grp_instance',
    parent_group_id: '',
    name: 'Drive A',
    suppressed: false,
    subassembly_definition_id: 'sub_drive',
    subassembly_definition_revision: 1,
  },
]

const occurrences: CADAssemblyOccurrence[] = [
  {
    id: 'occ_source',
    node_id: 'node_drive',
    model_id: 'model_drive',
    model_revision_id: 'mvr_drive',
    parent_group_id: 'grp_source',
    name: 'Drive',
    suppressed: false,
    transform: { matrix: identityMatrix },
  },
]

const definitions: CADSubassemblyDefinitionRevision[] = [
  {
    id: 'sub_drive',
    revision: 1,
    name: 'Drive module',
    members: [
      {
        id: 'smb_drive',
        node_id: 'node_drive',
        model_id: 'model_drive',
        model_revision_id: 'mvr_drive',
        name: 'Drive',
        suppressed: false,
        relative_transform: { matrix: identityMatrix },
      },
    ],
  },
]

describe('ProjectSubassemblies', () => {
  it('captures an eligible ordinary leaf group as an immutable definition', async () => {
    const user = userEvent.setup()
    const onCapture = vi.fn()
    render(<ProjectSubassemblies definitions={[]} groups={groups} occurrences={occurrences} onCapture={onCapture} onInstantiate={vi.fn()} />)

    expect(screen.getByRole('combobox', { name: 'Source group' }).textContent).toContain('Drive source')

    await user.type(screen.getByRole('textbox', { name: 'Definition name' }), 'Drive module')
    await user.click(screen.getByRole('button', { name: 'Capture definition' }))

    expect(onCapture).toHaveBeenCalledWith({ group_id: 'grp_source', name: 'Drive module' })
  })

  it('instantiates a pinned definition at an explicit translation', async () => {
    const user = userEvent.setup()
    const onInstantiate = vi.fn()
    render(<ProjectSubassemblies definitions={definitions} groups={groups} occurrences={occurrences} onCapture={vi.fn()} onInstantiate={onInstantiate} />)

    expect(screen.getByText('Drive module · r1 · 1 member')).toBeTruthy()
    await user.type(screen.getByRole('textbox', { name: 'Instance name' }), 'Drive B')
    await user.clear(screen.getByRole('spinbutton', { name: 'Instance position X' }))
    expect((screen.getByRole('button', { name: 'Create instance' }) as HTMLButtonElement).disabled).toBe(true)
    await user.type(screen.getByRole('spinbutton', { name: 'Instance position X' }), '100')
    await user.clear(screen.getByRole('spinbutton', { name: 'Instance position Y' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Instance position Y' }), '20')
    await user.click(screen.getByRole('button', { name: 'Create instance' }))

    expect(onInstantiate).toHaveBeenCalledWith('sub_drive', {
      name: 'Drive B',
      parent_group_id: '',
      translation: [100, 20, 0],
    })
  })

  it('explains why no source group can be captured', () => {
    render(<ProjectSubassemblies definitions={[]} groups={groups.slice(1)} occurrences={[]} onCapture={vi.fn()} onInstantiate={vi.fn()} />)

    expect(screen.getByText('Create a leaf group with at least one ordinary occurrence to capture it.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Capture definition' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
