import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { ProjectCanvas } from './project-canvas'
import type { BoxFeatureDraft } from './cad-document-box-features'
import type { CADDocumentNode, ProjectCADDocument, ProjectModel } from 'src/types/project'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./model-preview', () => ({
  ModelPreview: vi.fn(
    (props: {
      displayOptions: { measurement: boolean; section: boolean; showEdges: boolean }
      measurementOverlayClassName?: string
      onMeasurementChange?: (measurement: {
        center: { x: number; y: number; z: number }
        derivation: 'preview-visible-aabb'
        diagonal: number
        modelCount: number
        size: { x: number; y: number; z: number }
      }) => void
      selectedModelId: string
      selectedNodeId: string
      transformControlsLocked?: boolean
    }) => {
      useEffect(() => {
        props.onMeasurementChange?.({
          center: { x: 30, y: 12, z: 4 },
          derivation: 'preview-visible-aabb',
          diagonal: 65,
          modelCount: 1,
          size: { x: 60, y: 24, z: 8 },
        })
      }, [props.onMeasurementChange])
      return <div
        data-edges={String(props.displayOptions.showEdges)}
        data-measurement={String(props.displayOptions.measurement)}
        data-measurement-overlay-class={props.measurementOverlayClassName}
        data-model-preview
        data-section={String(props.displayOptions.section)}
        data-selected-model={props.selectedModelId}
        data-selected-node={props.selectedNodeId}
        data-transform-locked={String(Boolean(props.transformControlsLocked))}
      />
    },
  ),
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

  test('keeps the measurement HUD below desktop view orientation controls', () => {
    renderCanvas()

    expect(document.querySelector('[data-model-preview]')?.getAttribute('data-measurement-overlay-class')).toContain('sm:top-[168px]')
  })

  test('locks viewport transforms for reusable assembly members', () => {
    const projectDocument = cadDocument()
    projectDocument.assembly = {
      id: 'assembly_demo',
      name: 'Demo assembly',
      groups: [{
        id: 'grp_drive', parent_group_id: '', name: 'Drive A', suppressed: false,
        subassembly_definition_id: 'sub_drive', subassembly_definition_revision: 1,
      }],
      occurrences: [{
        id: 'occ_member', node_id: 'node_mdl_step', model_id: 'mdl_step', model_revision_id: 'mvr_step',
        parent_group_id: 'grp_drive', subassembly_member_id: 'smb_drive', name: 'Drive', suppressed: false,
        transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
      }],
      constraints: [],
      subassemblies: [],
    }

    renderCanvas({ projectCADDocument: projectDocument, selectedOccurrenceId: 'occ_member' })

    expect(document.querySelector('[data-model-preview]')?.getAttribute('data-transform-locked')).toBe('true')
  })

  test('toggles preview analysis tools for loaded preview assets', async () => {
    const user = userEvent.setup()
    renderCanvas({ previewAssets: [{ modelId: 'mdl_step', name: 'gearbox.step', previewFormat: 'obj', previewUrl: '/gearbox.obj' }] })

    await user.click(document.querySelector('button[aria-label="Edges"]') as HTMLButtonElement)
    await user.click(document.querySelector('button[aria-label="Section"]') as HTMLButtonElement)
    await user.click(document.querySelector('button[aria-label="Measure"]') as HTMLButtonElement)

    const preview = document.querySelector('[data-model-preview]')
    expect(preview?.getAttribute('data-edges')).toBe('true')
    expect(preview?.getAttribute('data-section')).toBe('true')
    expect(preview?.getAttribute('data-measurement')).toBe('true')
  })

  test('generates, restores, downloads, and deletes section geometry artifacts', async () => {
    const user = userEvent.setup()
    const onGenerateSectionArtifact = vi.fn()
    const onRestoreSectionArtifact = vi.fn()
    const onDownloadSectionArtifact = vi.fn()
    const onDeleteSectionArtifact = vi.fn()
    renderCanvas({
      canGenerateSectionGeometry: true,
      sectionArtifacts: [
        {
          id: 'pse_section',
          project_id: 'prj_demo',
          association_id: 'psd_section',
          generation: 1,
          supersedes_artifact_id: '',
          is_latest: true,
          cad_document_revision: 4,
          unit: 'mm',
          status: 'ready',
          filename: 'center-x-section.step',
          content_type: 'model/step',
          target_count: 1,
          source_revision_ids: ['mvr_step'],
          occurrence_ids: ['occ_step'],
          plane_origin: { x: 30, y: 12, z: 4 },
          plane_normal: { x: 1, y: 0, z: 0 },
          edge_count: 4,
          byte_size: 1024,
          created_at: '2026-07-14T00:00:00Z',
          updated_at: '2026-07-14T00:00:00Z',
        },
      ],
      onDeleteSectionArtifact,
      onDownloadSectionArtifact,
      onGenerateSectionArtifact,
      onRestoreSectionArtifact,
      previewAssets: [{ modelId: 'mdl_step', name: 'gearbox.step', previewFormat: 'obj', previewUrl: '/gearbox.obj' }],
    })

    await user.click(document.querySelector('button[aria-label="Section"]') as HTMLButtonElement)
    await user.click(document.querySelector('button[aria-label="Generate section geometry"]') as HTMLButtonElement)
    await user.click(document.querySelector('button[aria-label="Restore center-x-section.step"]') as HTMLButtonElement)
    await user.click(document.querySelector('button[aria-label="Download center-x-section.step"]') as HTMLButtonElement)
    await user.click(document.querySelector('button[aria-label="Delete center-x-section.step"]') as HTMLButtonElement)

    expect(onGenerateSectionArtifact).toHaveBeenCalledWith({ x: 30, y: 12, z: 4 })
    expect(onRestoreSectionArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: 'pse_section' }))
    expect(onDownloadSectionArtifact).toHaveBeenCalledWith('pse_section')
    expect(onDeleteSectionArtifact).toHaveBeenCalledWith('pse_section')
    expect(document.querySelector('[data-model-preview]')?.getAttribute('data-section')).toBe('true')
  })

  test('regenerates a stale latest section association', async () => {
    const user = userEvent.setup()
    const onRegenerateSectionArtifact = vi.fn()
    renderCanvas({
      sectionArtifacts: [
        {
          id: 'pse_stale', project_id: 'prj_demo', association_id: 'psd_section', generation: 1,
          supersedes_artifact_id: '', is_latest: true, cad_document_revision: 3, unit: 'mm', status: 'ready',
          filename: 'section-r3.step', content_type: 'model/step', target_count: 1,
          source_revision_ids: ['pmr_1'], occurrence_ids: ['occ_1'],
          plane_origin: { x: 30, y: 0, z: 0 }, plane_normal: { x: 1, y: 0, z: 0 },
          edge_count: 4, byte_size: 1024, created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
        },
      ],
      getSectionArtifactState: () => 'stale',
      onRegenerateSectionArtifact,
      previewAssets: [{ modelId: 'mdl_step', name: 'gearbox.step', previewFormat: 'obj', previewUrl: '/gearbox.obj' }],
    })

    expect(document.body.textContent).toContain('Generation 1 · Stale')
    await user.click(document.querySelector('button[aria-label="Regenerate section-r3.step"]') as HTMLButtonElement)
    expect(onRegenerateSectionArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: 'pse_stale' }))
  })

  test('runs exact B-rep analysis and labels persisted topology measurements', async () => {
    const user = userEvent.setup()
    const onAnalyzeTopology = vi.fn()
    renderCanvas({
      canAnalyzeTopology: true,
      inspectionRecords: [
        {
          id: 'pir_topology', project_id: 'prj_demo', kind: 'measurement', name: 'Exact B-rep properties',
          cad_document_revision: 4, unit: 'mm', visible_model_ids: ['occ_box'],
          measurement: {
            derivation: 'occt-brep-properties',
            topology: {
              target_count: 1,
              totals: { volume: 6000, surface_area: 2200, edge_length: 240, center_of_mass: { x: 5, y: 10, z: 15 }, solid_count: 1, face_count: 6, edge_count: 12 },
              targets: [],
            },
          },
          created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
        },
      ],
      onAnalyzeTopology,
      previewAssets: [{ modelId: 'mdl_step', name: 'gearbox.step', previewFormat: 'obj', previewUrl: '/gearbox.obj' }],
    })

    await user.click(document.querySelector('button[aria-label="Analyze B-rep"]') as HTMLButtonElement)

    expect(onAnalyzeTopology).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('Exact B-rep')
    expect(document.body.textContent).toContain('V 6,000')
    expect(document.body.textContent).toContain('A 2,200')
    expect(document.body.textContent).toContain('L 240')
    expect(document.body.textContent).toContain('1 stable scope · 18 face/edge references')
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
    current_revision_id: 'mvr_step',
    revision_sequence: 1,
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
