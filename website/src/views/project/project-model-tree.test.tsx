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
	occurrenceId: 'occurrence_model_one',
	modelRevisionId: 'mvr_model_one',
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
    render(
      <ProjectModelTree
        groups={groups}
        hiddenModelIds={new Set()}
        isLoading={false}
        isUploading={false}
        onSelect={onSelect}
        onToggleVisibility={onToggleVisibility}
        previewAssetModelIds={new Set(['model_one'])}
        selectedNodeId=""
        uploadError=""
      />,
    )

    await user.click(screen.getByRole('option', { name: /Assembly/ }))
    await user.click(screen.getByRole('option', { name: 'Bracket' }))
    await user.click(screen.getByRole('button', { name: 'Hide Assembly' }))

    expect(onSelect).toHaveBeenNthCalledWith(1, 'model_one', 'node_model_one')
    expect(onSelect).toHaveBeenNthCalledWith(2, 'model_one', 'node_child_one')
    expect(onToggleVisibility).toHaveBeenCalledWith('model_one')
		expect(screen.getByTestId('assembly-root').textContent).toContain('Robot project')
  })
})
