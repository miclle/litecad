import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { ProjectCanvas } from './project-canvas'
import type { BoxFeatureDraft } from './cad-document-box-features'
import type { CADDocumentNode, ProjectCADDocument, ProjectModel } from 'src/types/project'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./model-preview', () => ({
  ModelPreview: vi.fn((props: { selectedModelId: string; selectedNodeId: string }) => (
    <div data-model-preview data-selected-model={props.selectedModelId} data-selected-node={props.selectedNodeId} />
  )),
}))

vi.mock('./view-controller', () => ({
  ViewController: vi.fn(() => <div aria-label="View orientation controls" />),
}))

describe('ProjectCanvas', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  test('renders the controlled empty canvas state and disables Fuse box without a STEP selection', () => {
    renderCanvas()

    expect(document.body.textContent).toContain('Awaiting import')
    expect(document.body.textContent).toContain('Import a CAD source to preview it here.')
    expect(document.querySelector('[data-model-preview]')?.getAttribute('data-selected-model')).toBe('')
    expect(document.querySelector('[aria-label="View orientation controls"]')).toBeTruthy()
    expect((document.querySelector('button[aria-pressed="false"]') as HTMLButtonElement).disabled).toBe(true)
  })

  test('edits and applies the Fuse box draft for the selected STEP source', async () => {
    const user = userEvent.setup()
    const onApplyBoxFeatureDraft = vi.fn()
    const onUpdateBoxFeatureDraft = vi.fn()
    const selectedSourceModel = projectModel()

    renderCanvas({
      activeCADTool: 'fuse-box',
      onApplyBoxFeatureDraft,
      onUpdateBoxFeatureDraft,
      projectCADDocument: cadDocument(),
      selectedDocumentNode: cadNode(),
      selectedModelBoxFeatureDraft: boxFeatureDraft(),
      selectedModelDisplayName: 'gearbox.step',
      selectedModelId: selectedSourceModel.id,
      selectedModelSupportsFuseBox: true,
      selectedNodeId: 'node_mdl_step',
      selectedSourceModel,
      shouldShowCanvasStatus: false,
    })

    expect(document.body.textContent).toContain('Fuse box')
    expect(document.body.textContent).toContain('gearbox.step')

    const originXInput = document.querySelector('input[aria-label="Origin X for gearbox.step"]') as HTMLInputElement
    fireEvent.change(originXInput, { target: { value: '12' } })
    await user.click([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Apply fuse')) as HTMLButtonElement)

    expect(onUpdateBoxFeatureDraft).toHaveBeenLastCalledWith(selectedSourceModel.id, 'originX', '12')
    expect(onApplyBoxFeatureDraft).toHaveBeenCalledWith(selectedSourceModel.id)
  })
})

function renderCanvas(overrides: Partial<Parameters<typeof ProjectCanvas>[0]> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)

  act(() => {
    createRoot(host).render(
      <ProjectCanvas
        activeCADTool="inspect"
        animateViewCubeOrientation={false}
        canvasRightOffset={20}
        canvasStatusBody="Import a CAD source to preview it here."
        canvasStatusLabel="Awaiting import"
        canvasStatusLeftOffset={16}
        deferResize={false}
        draftModelTranslations={{}}
        isSelectedModelBoxFeatureUpdating={false}
        modelTranslations={{}}
        onApplyBoxFeatureDraft={vi.fn()}
        onClearSelection={vi.fn()}
        onCloseCADTool={vi.fn()}
        onFlipOrientation={vi.fn()}
        onModelTranslationChange={vi.fn()}
        onResetIsometric={vi.fn()}
        onSelectModel={vi.fn()}
        onSetOrientation={vi.fn()}
        onSnapshotCapture={vi.fn()}
        onStepOrientation={vi.fn()}
        onToggleFuseBoxTool={vi.fn()}
        onUpdateBoxFeatureDraft={vi.fn()}
        previewAssets={[]}
        projectId="prj_demo"
        selectedModelBoxFeatureError=""
        selectedModelDisplayName=""
        selectedModelId=""
        selectedModelSupportsFuseBox={false}
        selectedNodeId=""
        shouldShowCanvasStatus
        unitLabel="mm"
        viewOrientation={{ yaw: 22, pitch: 18 }}
        visibleModelIds={[]}
        {...overrides}
      />,
    )
  })
  return host
}

function boxFeatureDraft(): BoxFeatureDraft {
  return {
    originX: '0',
    originY: '0',
    originZ: '0',
    sizeX: '10',
    sizeY: '10',
    sizeZ: '10',
  }
}

function projectModel(): ProjectModel {
  return {
    id: 'mdl_step',
    project_id: 'prj_demo',
    original_filename: 'gearbox.step',
    format: 'step',
    content_type: 'application/step',
    byte_size: 100,
    parse_status: 'parsed',
    parse_error: '',
    metadata: {
      asset_type: 'step',
      version: '',
      schema: '',
      product_names: ['gearbox'],
      length_unit: 'millimetre',
      entity_count: 1,
      representation_count: 1,
      triangle_count: 0,
    },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadNode(): CADDocumentNode {
  return {
    id: 'node_mdl_step',
    model_id: 'mdl_step',
    parent_node_id: '',
    name: 'gearbox.step',
    source_format: 'step',
    transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] },
  }
}

function cadDocument(): ProjectCADDocument {
  return {
    id: 'doc_demo',
    project_id: 'prj_demo',
    schema_version: 1,
    revision: 1,
    unit: 'millimetre',
    nodes: [cadNode()],
    operations: [],
    history: { head_id: '', can_undo: false, can_redo: false },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}
