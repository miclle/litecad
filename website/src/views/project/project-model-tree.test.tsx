import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectModelTreeGroup } from './project-preview-assets'
import { ProjectModelTree } from './project-model-tree'

afterEach(cleanup)

const groups: ProjectModelTreeGroup[] = [
  {
    assemblyId: 'assembly_project_one',
    assemblyName: 'Robot project',
    assemblyOccurrenceCount: 2,
    occurrenceId: 'occurrence_model_one',
    occurrenceIndex: 0,
    modelOccurrenceCount: 2,
    modelRevisionId: 'mvr_model_one',
    suppressed: false,
    model: {
      id: 'model_one',
      project_id: 'project_one',
      original_filename: 'assembly.step',
      format: 'step',
      content_type: 'model/step',
      byte_size: 120,
      parse_status: 'parsed',
      parse_error: '',
      current_revision_id: 'mvr_model_one',
      revision_sequence: 1,
      metadata: {
        asset_type: 'step',
        version: '',
        schema: '',
        product_names: ['Assembly'],
        length_unit: 'mm',
        entity_count: 12,
        representation_count: 1,
        triangle_count: 24,
      },
      created_at: '2026-07-10T00:00:00Z',
      updated_at: '2026-07-10T00:00:00Z',
    },
    sourceNodeId: 'node_model_one',
    displayName: 'Assembly',
    children: [{ id: 'node_child_one', name: 'Bracket', sourceModelId: 'model_one' }],
  },
]

describe('ProjectModelTree', () => {
  it('forwards source selection, child selection, and visibility changes', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onToggleVisibility = vi.fn()
    const onDeleteOccurrence = vi.fn()
    const onDuplicateOccurrence = vi.fn()
    const onMoveOccurrence = vi.fn()
    const onUpdateOccurrence = vi.fn()
    render(
      <ProjectModelTree
        groups={groups}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onSelect={onSelect}
        onDeleteOccurrence={onDeleteOccurrence}
        onDuplicateOccurrence={onDuplicateOccurrence}
        onMoveOccurrence={onMoveOccurrence}
        onToggleVisibility={onToggleVisibility}
        onUpdateOccurrence={onUpdateOccurrence}
        previewAssetModelIds={new Set(['occurrence_model_one'])}
        selectedNodeId=""
        selectedOccurrenceId="occurrence_model_one"
        uploadError=""
      />,
    )

    await user.click(screen.getByRole('option', { name: /Assembly/ }))
    await user.click(screen.getByRole('option', { name: 'Bracket' }))
    await user.click(screen.getByRole('button', { name: 'Hide Assembly' }))

    expect(onSelect).toHaveBeenNthCalledWith(1, 'model_one', 'node_model_one', 'occurrence_model_one')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'model_one', 'node_child_one', 'occurrence_model_one')
    expect(onToggleVisibility).toHaveBeenCalledWith('occurrence_model_one')
    expect(screen.getByTestId('assembly-root').textContent).toContain('Robot project')
  })

  it('forwards compact occurrence authoring commands', async () => {
    const user = userEvent.setup()
    const onDeleteOccurrence = vi.fn()
    const onDuplicateOccurrence = vi.fn()
    const onMoveOccurrence = vi.fn()
    const onUpdateOccurrence = vi.fn()
    render(
      <ProjectModelTree
        groups={groups}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onDeleteOccurrence={onDeleteOccurrence}
        onDuplicateOccurrence={onDuplicateOccurrence}
        onMoveOccurrence={onMoveOccurrence}
        onSelect={vi.fn()}
        onToggleVisibility={vi.fn()}
        onUpdateOccurrence={onUpdateOccurrence}
        previewAssetModelIds={new Set(['occurrence_model_one'])}
        selectedNodeId="node_model_one"
        selectedOccurrenceId="occurrence_model_one"
        uploadError=""
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Duplicate occurrence' }))
    await user.click(screen.getByRole('button', { name: 'Move occurrence down' }))
    await user.click(screen.getByRole('button', { name: 'Suppress occurrence' }))
    await user.click(screen.getByRole('button', { name: 'Rename occurrence' }))
    const nameInput = screen.getByRole('textbox', { name: 'Occurrence name' })
    await user.clear(nameInput)
    await user.type(nameInput, 'Fixture right')
    await user.click(screen.getByRole('button', { name: 'Save occurrence name' }))
    await user.click(screen.getByRole('button', { name: 'Delete occurrence' }))

    expect(onDuplicateOccurrence).toHaveBeenCalledWith('occurrence_model_one')
    expect(onMoveOccurrence).toHaveBeenCalledWith('occurrence_model_one', 1)
    expect(onUpdateOccurrence).toHaveBeenNthCalledWith(1, 'occurrence_model_one', { suppressed: true })
    expect(onUpdateOccurrence).toHaveBeenNthCalledWith(2, 'occurrence_model_one', { name: 'Fixture right' })
    expect(onDeleteOccurrence).toHaveBeenCalledWith('occurrence_model_one')
  })

  it('keeps duplicate display suffixes out of occurrence rename values', async () => {
    const user = userEvent.setup()
    render(
      <ProjectModelTree
        groups={[
          {
            ...groups[0],
            displayName: 'Assembly · 2',
            occurrenceName: 'Assembly',
          },
        ]}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onSelect={vi.fn()}
        onToggleVisibility={vi.fn()}
        previewAssetModelIds={new Set(['occurrence_model_one'])}
        selectedNodeId="node_model_one"
        selectedOccurrenceId="occurrence_model_one"
        uploadError=""
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Rename occurrence' }))

    expect(
      (
        screen.getByRole('textbox', {
          name: 'Occurrence name',
        }) as HTMLInputElement
      ).value,
    ).toBe('Assembly')
  })

  it('authors nested groups and moves an occurrence between them', async () => {
    const user = userEvent.setup()
    const onCreateAssemblyGroup = vi.fn()
    const onDeleteAssemblyGroup = vi.fn()
    const onUpdateAssemblyGroup = vi.fn()
    const onUpdateOccurrence = vi.fn()
    render(
      <ProjectModelTree
        assemblyGroups={[
          {
            id: 'grp_power',
            parent_group_id: '',
            name: 'Power unit',
            suppressed: false,
          },
          {
            id: 'grp_reduction',
            parent_group_id: 'grp_power',
            name: 'Reduction stage',
            suppressed: false,
          },
          {
            id: 'grp_empty',
            parent_group_id: '',
            name: 'Empty group',
            suppressed: false,
          },
        ]}
        groups={[{ ...groups[0], parentGroupId: 'grp_reduction' }]}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onCreateAssemblyGroup={onCreateAssemblyGroup}
        onDeleteAssemblyGroup={onDeleteAssemblyGroup}
        onSelect={vi.fn()}
        onToggleVisibility={vi.fn()}
        onUpdateAssemblyGroup={onUpdateAssemblyGroup}
        onUpdateOccurrence={onUpdateOccurrence}
        previewAssetModelIds={new Set(['occurrence_model_one'])}
        selectedNodeId="node_model_one"
        selectedOccurrenceId="occurrence_model_one"
        uploadError=""
      />,
    )

    expect(screen.getByTestId('assembly-group-grp_reduction').style.marginLeft).toBe('16px')
    await user.click(screen.getByRole('button', { name: 'Create subgroup in Power unit' }))
    await user.click(screen.getByRole('button', { name: 'Suppress Power unit' }))
    await user.click(screen.getByRole('button', { name: 'Delete Empty group' }))
    await user.click(screen.getByRole('combobox', { name: 'Assembly group' }))
    await user.click(await screen.findByRole('option', { name: 'Assembly root' }))

    expect(onCreateAssemblyGroup).toHaveBeenCalledWith('Power unit subgroup', 'grp_power')
    expect(onUpdateAssemblyGroup).toHaveBeenCalledWith('grp_power', {
      suppressed: true,
    })
    expect(onDeleteAssemblyGroup).toHaveBeenCalledWith('grp_empty')
    expect(onUpdateOccurrence).toHaveBeenCalledWith('occurrence_model_one', {
      parent_group_id: '',
    })
  })

  it('saves an eligible leaf group for reuse from that group row', async () => {
    const user = userEvent.setup()
    const onCaptureSubassembly = vi.fn()
    const tree = (groupName: string) => (
      <ProjectModelTree
        assemblyGroups={[
          { id: 'grp_drive', parent_group_id: '', name: groupName, suppressed: false },
          { id: 'grp_parent', parent_group_id: '', name: 'Parent group', suppressed: false },
          { id: 'grp_child', parent_group_id: 'grp_parent', name: 'Child group', suppressed: false },
        ]}
        groups={[{ ...groups[0], parentGroupId: 'grp_drive' }]}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onCaptureSubassembly={onCaptureSubassembly}
        onSelect={vi.fn()}
        onToggleVisibility={vi.fn()}
        previewAssetModelIds={new Set(['occurrence_model_one'])}
        selectedNodeId=""
        uploadError=""
      />
    )
    const { rerender } = render(tree('Drive group'))

    expect(screen.queryByRole('button', { name: 'Save Parent group for reuse' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save Drive group for reuse' }))
    expect((screen.getByRole('textbox', { name: 'Combination name' }) as HTMLInputElement).value).toBe('Drive group')
    await user.click(screen.getByRole('button', { name: 'Save combination' }))

    expect(onCaptureSubassembly).toHaveBeenCalledWith({ group_id: 'grp_drive', name: 'Drive group' })

    rerender(tree('Renamed drive group'))
    await user.click(screen.getByRole('button', { name: 'Save Renamed drive group for reuse' }))

    expect((screen.getByRole('textbox', { name: 'Combination name' }) as HTMLInputElement).value).toBe('Renamed drive group')
  })

  it('keeps reusable instance groups and their expanded members immutable', () => {
    render(
      <ProjectModelTree
        assemblyGroups={[
          {
            id: 'grp_instance',
            parent_group_id: '',
            name: 'Drive A',
            suppressed: false,
            subassembly_definition_id: 'sub_drive',
            subassembly_definition_revision: 1,
          },
        ]}
        groups={[{ ...groups[0], isSubassemblyMember: true, parentGroupId: 'grp_instance' }]}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onSelect={vi.fn()}
        onToggleVisibility={vi.fn()}
        previewAssetModelIds={new Set(['occurrence_model_one'])}
        selectedNodeId="node_model_one"
        selectedOccurrenceId="occurrence_model_one"
        uploadError=""
      />,
    )

    expect(screen.getByText('Part of a saved combination copy')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Duplicate occurrence' })).toBeNull()
    expect((screen.getByRole('button', { name: 'Rename Drive A' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Create subgroup in Drive A' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Suppress Drive A' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not offer reusable instance groups as destinations for ordinary occurrences', async () => {
    const user = userEvent.setup()
    render(
      <ProjectModelTree
        assemblyGroups={[
          {
            id: 'grp_instance', parent_group_id: '', name: 'Drive A', suppressed: false,
            subassembly_definition_id: 'sub_drive', subassembly_definition_revision: 1,
          },
        ]}
        groups={groups}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onSelect={vi.fn()}
        onToggleVisibility={vi.fn()}
        previewAssetModelIds={new Set(['occurrence_model_one'])}
        selectedNodeId="node_model_one"
        selectedOccurrenceId="occurrence_model_one"
        uploadError=""
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'Assembly group' }))

    expect(screen.queryByRole('option', { name: 'Drive A' })).toBeNull()
  })
})
