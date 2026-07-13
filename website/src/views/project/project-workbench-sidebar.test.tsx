import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectWorkbenchSidebar } from './project-workbench-sidebar'
import type { ProjectModelTreeGroup } from './project-preview-assets'

afterEach(cleanup)

describe('ProjectWorkbenchSidebar', () => {
  it('renders the collapsed summary and forwards expand requests', async () => {
    const user = userEvent.setup()
    const onCollapseChange = vi.fn()

    renderSidebar({ isLeftPanelCollapsed: true, modelCount: 2, onCollapseChange })

    expect(document.body.textContent).toContain('Project')
    expect(document.body.textContent).toContain('2 models')

    await user.click(screen.getByRole('button', { name: 'Expand left panel' }))

    expect(onCollapseChange).toHaveBeenCalledWith(false)
  })

  it('forwards model selection and inspector transform edits from the expanded panel', async () => {
    const user = userEvent.setup()
    const onModelSelect = vi.fn()
    const onTransformChange = vi.fn()

    renderSidebar({
      inspectorSelection: {
        deleteError: '',
        details: [{ label: 'Format', value: 'STEP' }],
        name: 'Assembly',
        nodeId: 'node_model_one',
        stepExportError: '',
        stepExportStatus: '',
        transformDraft: { x: '0', y: '0', z: '0' },
        transformError: '',
      },
      onModelSelect,
      onTransformChange,
      projectModelTree: groups,
      selectedNodeId: 'node_model_one',
    })

    await user.click(screen.getByRole('option', { name: /Assembly/ }))
    fireEvent.change(screen.getByLabelText('X position for Assembly'), { target: { value: '12' } })

    expect(onModelSelect).toHaveBeenCalledWith('model_one', 'node_model_one')
    expect(onTransformChange).toHaveBeenLastCalledWith('node_model_one', 'x', '12')
  })
})

function renderSidebar(overrides: Partial<Parameters<typeof ProjectWorkbenchSidebar>[0]> = {}) {
  return render(
    <ProjectWorkbenchSidebar
      documentDetails={[{ label: 'Preview', value: 'Empty' }]}
      hiddenModelIds={new Set()}
      isLeftPanelCollapsed={false}
      isModelTreeLoading={false}
      isUploading={false}
      leftPanelWidth={320}
      modelCount={0}
      onCollapseChange={vi.fn()}
      onModelSelect={vi.fn()}
      onParameterValuesChange={vi.fn()}
      onResizePointerDown={vi.fn()}
      onSaveGeneratedArtifactAsModel={vi.fn()}
      onSaveModelParameters={vi.fn()}
      onToggleModelVisibility={vi.fn()}
      onTransformChange={vi.fn()}
      previewAssetModelIds={new Set()}
      projectModelTree={[]}
      selectedNodeId=""
      unitLabel="mm"
      uploadError=""
      {...overrides}
    />,
  )
}

const groups: ProjectModelTreeGroup[] = [
  {
    model: {
      id: 'model_one',
      project_id: 'project_one',
      original_filename: 'assembly.step',
      format: 'step',
      content_type: 'model/step',
      byte_size: 120,
      parse_status: 'parsed',
      parse_error: '',
      metadata: {
        asset_type: 'step',
        version: '',
        schema: '',
        product_names: ['Assembly'],
        length_unit: 'millimetre',
        entity_count: 12,
        representation_count: 1,
        triangle_count: 24,
      },
      created_at: '2026-07-13T00:00:00Z',
      updated_at: '2026-07-13T00:00:00Z',
    },
    sourceNodeId: 'node_model_one',
    displayName: 'Assembly',
    children: [],
  },
]
