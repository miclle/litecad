import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import userEvent from '@testing-library/user-event'

import { TooltipProvider } from '@/components/ui/tooltip'
import { ProjectCanvas } from './project-canvas'
import type { BoxFeatureDraft } from './cad-document-box-features'
import type { CADDocumentNode, ProjectCADDocument, ProjectModel } from 'src/types/project'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

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
      unitLabel?: string
    }) => {
      const { onMeasurementChange } = props
      useEffect(() => {
        onMeasurementChange?.({
          center: { x: 30, y: 12, z: 4 },
          derivation: 'preview-visible-aabb',
          diagonal: 65,
          modelCount: 1,
          size: { x: 60, y: 24, z: 8 },
        })
      }, [onMeasurementChange])
      return <div
        data-edges={String(props.displayOptions.showEdges)}
        data-measurement={String(props.displayOptions.measurement)}
        data-measurement-overlay-class={props.measurementOverlayClassName}
        data-model-preview
        data-section={String(props.displayOptions.section)}
        data-selected-model={props.selectedModelId}
        data-selected-node={props.selectedNodeId}
        data-transform-locked={String(Boolean(props.transformControlsLocked))}
        data-unit-label={props.unitLabel}
      />
    },
  ),
}))

vi.mock('./view-controller', () => ({
  ViewController: vi.fn(() => <div aria-label="View orientation controls" />),
}))

describe('ProjectCanvas', () => {
  afterEach(() => {
    act(() => {
      roots.splice(0).forEach((root) => root.unmount())
    })
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
    expect((screen.getByRole('button', { name: 'Analysis 0' }) as HTMLButtonElement).disabled).toBe(false)
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

  test('uses the browser measurement unit without changing document-edit units', () => {
    renderCanvas({ measurementUnitLabel: 'mm', unitLabel: 'in' })

    expect(document.querySelector('[data-model-preview]')?.getAttribute('data-unit-label')).toBe('mm')
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
    await user.click(screen.getByRole('button', { name: 'Analysis 1' }))
    const generateSectionButton = screen.getByRole('button', { name: 'Generate section geometry' }) as HTMLButtonElement
    expect(generateSectionButton.disabled).toBe(false)
    await user.click(generateSectionButton)
    await user.click(screen.getByRole('button', { name: /^Restore center-x-section\.step, generation 1, saved / }))
    await user.click(screen.getByRole('button', { name: /^Download center-x-section\.step, generation 1, saved / }))
    await user.click(screen.getByRole('button', { name: /^Delete center-x-section\.step, generation 1, saved / }))

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

    await user.click(screen.getByRole('button', { name: 'Analysis 1' }))
    expect(document.body.textContent).toContain('Generation 1 · Stale')
    await user.click(screen.getByRole('button', { name: /^Regenerate section-r3\.step, generation 1, saved / }))
    expect(onRegenerateSectionArtifact).toHaveBeenCalledWith(expect.objectContaining({ id: 'pse_stale' }))
  })

  test('keeps saved analysis results off the canvas until requested and uses outcome-oriented labels', async () => {
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
      measurementUnitLabel: 'mm',
      unitLabel: 'cm',
    })

    expect(document.body.textContent).toContain('Analysis 1')
    expect(document.body.textContent).not.toContain('Geometry properties')

    await user.click(screen.getByRole('button', { name: 'Analysis 1' }))
    const calculatePropertiesButton = screen.getByRole('button', { name: 'Calculate geometry properties' }) as HTMLButtonElement
    expect(calculatePropertiesButton.disabled).toBe(false)
    await user.click(calculatePropertiesButton)

    expect(onAnalyzeTopology).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('Measurements and analysis')
    expect(document.body.textContent).toContain('Geometry properties')
    expect(document.body.textContent).toContain('Volume 6,000')
    expect(document.body.textContent).toContain('Surface area 2,200')
    expect(document.body.textContent).toContain('Edge length 240')
    expect(document.body.textContent).toContain('6,000 mm³')
    expect(document.body.textContent).toContain('2,200 mm²')
    expect(document.querySelector('[data-model-preview]')?.getAttribute('data-unit-label')).toBe('mm')
    expect(document.body.textContent).not.toContain('B-rep')
    expect(document.body.textContent).not.toContain('stable scope')
  })

  test('distinguishes repeated saved measurements by model version and save time', async () => {
    const user = userEvent.setup()
    const currentDocument = cadDocument()
    currentDocument.revision = 5
    const firstRecord = {
      id: 'pir_bounds_4', project_id: 'prj_demo', kind: 'measurement' as const, name: 'Visible bounds',
      cad_document_revision: 4, unit: 'millimetre', visible_model_ids: ['occ_box'],
      measurement: {
        derivation: 'preview-visible-aabb' as const, model_count: 1,
        center: { x: 30, y: 12, z: 4 }, size: { x: 60, y: 24, z: 8 }, diagonal: 65,
      },
      created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
    }
    renderCanvas({
      inspectionRecords: [
        firstRecord,
        {
          ...firstRecord,
          id: 'pir_bounds_5',
          cad_document_revision: 5,
          created_at: '2026-07-16T00:00:00Z',
          updated_at: '2026-07-16T00:00:00Z',
        },
      ],
      onDeleteInspectionRecord: vi.fn(),
      projectCADDocument: currentDocument,
    })

    await user.click(screen.getByRole('button', { name: 'Analysis 2' }))

    expect(document.body.textContent).toContain('Design revision 4')
    expect(document.body.textContent).toContain('Design revision 5')
    expect(document.body.textContent).toContain('Earlier result')
    const deleteButtons = screen.getAllByRole('button', { name: /^Delete Overall dimensions,/ })
    expect(deleteButtons).toHaveLength(2)
    expect(new Set(deleteButtons.map((button) => button.getAttribute('aria-label'))).size).toBe(2)
  })

  test('announces localized action failures without exposing kernel diagnostics', async () => {
    const user = userEvent.setup()
    renderCanvas({
      inspectionRecordError: 'Topology inspection target scope is unavailable',
      sectionArtifactError: 'OpenCascade shape inspection produced a non-finite property',
    })

    await user.click(screen.getByRole('button', { name: 'Analysis 0' }))

    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(2)
    expect(document.body.textContent).toContain('Could not update the analysis results. Try again.')
    expect(document.body.textContent).toContain('Could not update the section geometry. Try again.')
    expect(document.body.textContent).not.toContain('Topology inspection')
    expect(document.body.textContent).not.toContain('OpenCascade')
  })

  test('bounds the initial saved-result render and reveals older results on request', async () => {
    const user = userEvent.setup()
    renderCanvas({
      inspectionRecords: Array.from({ length: 21 }, (_, index) => ({
        id: `pir_${index}`, project_id: 'prj_demo', kind: 'measurement' as const, name: `Snapshot ${index}`,
        cad_document_revision: index + 1, unit: 'millimetre', visible_model_ids: [],
        created_at: `2026-07-${String((index % 20) + 1).padStart(2, '0')}T00:00:00Z`,
        updated_at: `2026-07-${String((index % 20) + 1).padStart(2, '0')}T00:00:00Z`,
      })),
      onDeleteInspectionRecord: vi.fn(),
    })

    await user.click(screen.getByRole('button', { name: 'Analysis 21' }))
    expect(screen.getAllByText(/^Snapshot \d+$/)).toHaveLength(20)

    await user.click(screen.getByRole('button', { name: 'Show all 21 results' }))
    expect(screen.getAllByText(/^Snapshot \d+$/)).toHaveLength(21)
  })

  test('disables saved-result deletion while related mutations are pending', async () => {
    const user = userEvent.setup()
    renderCanvas({
      inspectionRecords: [
        {
          id: 'pir_bounds', project_id: 'prj_demo', kind: 'measurement', name: 'Visible bounds',
          cad_document_revision: 4, unit: 'mm', visible_model_ids: ['occ_box'],
          measurement: {
            derivation: 'preview-visible-aabb', model_count: 1,
            center: { x: 30, y: 12, z: 4 }, size: { x: 60, y: 24, z: 8 }, diagonal: 65,
          },
          created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
        },
      ],
      isInspectionRecordMutationPending: true,
      isSectionArtifactMutationPending: true,
      onDeleteInspectionRecord: vi.fn(),
      onDeleteSectionArtifact: vi.fn(),
      sectionArtifacts: [
        {
          id: 'pse_section', project_id: 'prj_demo', association_id: 'psd_section', generation: 1,
          supersedes_artifact_id: '', is_latest: true, cad_document_revision: 4, unit: 'mm', status: 'ready',
          filename: 'center-x-section.step', content_type: 'model/step', target_count: 1,
          source_revision_ids: ['mvr_step'], occurrence_ids: ['occ_step'],
          plane_origin: { x: 30, y: 12, z: 4 }, plane_normal: { x: 1, y: 0, z: 0 },
          edge_count: 4, byte_size: 1024, created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z',
        },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Analysis 2' }))

    expect((screen.getByRole('button', { name: /^Delete Overall dimensions,/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /^Delete center-x-section\.step, generation 1, saved / }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.querySelector('.animate-spin')).toBeNull()
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
  const root = createRoot(host)
  roots.push(root)

  act(() => {
    root.render(
      <TooltipProvider>
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
        />
      </TooltipProvider>,
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
