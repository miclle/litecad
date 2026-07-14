import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { defaultBoxFeatureDraft } from './cad-document-box-features'
import { useProjectWorkbenchInspectorState } from './use-project-workbench-inspector-state'
import type { CADDocumentNode, Project, ProjectCADDocument, ProjectModel } from 'src/types/project'

describe('useProjectWorkbenchInspectorState', () => {
  it('derives document details from the project, preview summary, and latest model', () => {
    const model = projectModel()
    const { result } = renderHook(() =>
      useInspectorStateScenario({
        latestModel: model,
        latestTriangleCount: 42,
        project: project(),
        projectCADDocument: cadDocument([]),
        previewSummary: { previewLabel: '1 KERNEL mesh' },
      }),
    )

    expect(result.current.projectDescription).toBe('No description yet. Import a CAD source file to begin the project record.')
    expect(result.current.documentUnitLabel).toBe('mm')
    expect(result.current.documentDetails).toEqual([
      { label: 'Updated', value: 'Jul 13, 2026' },
      { label: 'Preview', value: '1 KERNEL mesh' },
      { label: 'Schema', value: 'AP214' },
      { label: 'Unit', value: 'millimetre' },
      { label: 'Entities', value: 12 },
      { label: 'Triangles', value: 42 },
    ])
    expect(result.current.inspectorSelection).toBeUndefined()
  })

  it('derives selected component inspector state with drafts and command statuses', () => {
    const model = projectModel()
    const node = cadNode({
      id: 'node_model_component_1',
      model_id: '',
      name: 'Bracket component',
      parent_node_id: 'node_model_step',
      source_format: 'step-component',
      source_model_id: model.id,
    })
    const { result } = renderHook(() =>
      useInspectorStateScenario({
        boxErrorsByModelId: { [model.id]: 'Invalid box feature' },
        boxFeatureDraftsByModelId: { [model.id]: { originX: '1', originY: '2', originZ: '3', sizeX: '4', sizeY: '5', sizeZ: '6' } },
        deleteError: 'Could not delete this model',
        isBoxUnionPendingFor: (modelId) => modelId === model.id,
        selectedDocumentNode: node,
        selectedSourceModel: model,
        stepExportErrorByModelId: { [model.id]: 'Export failed' },
        stepExportStatusByModelId: { [model.id]: 'Downloaded bracket.step' },
        transformDraftsByNodeId: { [node.id]: { x: '7', y: '8', z: '9' } },
        transformErrorsByNodeId: { [node.id]: 'Invalid transform' },
      }),
    )

    expect(result.current.selectedModelDisplayName).toBe('Bracket component')
    expect(result.current.selectedModelSupportsFuseBox).toBe(true)
    expect(result.current.selectedModelBoxFeatureError).toBe('Invalid box feature')
    expect(result.current.selectedModelBoxFeatureDraft).toEqual({ originX: '1', originY: '2', originZ: '3', sizeX: '4', sizeY: '5', sizeZ: '6' })
    expect(result.current.isSelectedModelBoxFeatureUpdating).toBe(true)
    expect(result.current.inspectorSelection).toMatchObject({
      deleteError: 'Could not delete this model',
      name: 'Bracket component',
      nodeId: node.id,
      stepExportError: 'Export failed',
      stepExportStatus: 'Downloaded bracket.step',
      transformDraft: { x: '7', y: '8', z: '9' },
      transformError: 'Invalid transform',
    })
    expect(result.current.inspectorSelection?.details[0]).toEqual({ label: 'Format', value: 'STEP-COMPONENT' })
  })

  it('falls back to the selected node transform and latest box draft when local drafts are empty', () => {
    const model = projectModel()
    const node = cadNode({ model_id: model.id, source_format: 'step' })
    const getBoxFeatureDraft = vi.fn(() => ({ originX: '0', originY: '0', originZ: '0', sizeX: '10', sizeY: '20', sizeZ: '30' }))
    const { result } = renderHook(() =>
      useInspectorStateScenario({
        getBoxFeatureDraft,
        selectedDocumentNode: node,
        selectedSourceModel: model,
      }),
    )

    expect(result.current.inspectorSelection?.transformDraft).toEqual({ x: '10', y: '20', z: '30' })
    expect(result.current.selectedModelBoxFeatureDraft).toEqual({ originX: '0', originY: '0', originZ: '0', sizeX: '10', sizeY: '20', sizeZ: '30' })
    expect(getBoxFeatureDraft).toHaveBeenCalledWith(model.id)
  })
})

function useInspectorStateScenario(overrides: Partial<Parameters<typeof useProjectWorkbenchInspectorState>[0]> = {}) {
  return useProjectWorkbenchInspectorState({
    boxErrorsByModelId: {},
    boxFeatureDraftsByModelId: {},
    deleteError: '',
    getBoxFeatureDraft: () => defaultBoxFeatureDraft(),
    isBoxUnionPendingFor: () => false,
    latestTriangleCount: 0,
    previewSummary: { previewLabel: 'Empty' },
    stepExportErrorByModelId: {},
    stepExportStatusByModelId: {},
    transformDraftsByNodeId: {},
    transformErrorsByNodeId: {},
    ...overrides,
  })
}

function project(): Project {
  return {
    id: 'prj_inspector',
    name: 'Inspector Project',
    description: '',
    thumbnail: { model_count: 0, models: [] },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function projectModel(): ProjectModel {
  return {
    id: 'model_step',
    project_id: 'prj_inspector',
    original_filename: 'bracket.step',
    format: 'step',
    content_type: 'application/step',
    byte_size: 120,
    parse_status: 'parsed',
    parse_error: '',
    current_revision_id: 'mvr_step',
    revision_sequence: 1,
    metadata: {
      asset_type: 'step',
      version: '',
      schema: 'AP214',
      product_names: ['Bracket'],
      length_unit: 'millimetre',
      entity_count: 12,
      representation_count: 1,
      triangle_count: 24,
    },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadDocument(nodes: ProjectCADDocument['nodes']): ProjectCADDocument {
  return {
    id: 'doc_inspector',
    project_id: 'prj_inspector',
    schema_version: 1,
    revision: 1,
    unit: 'millimetre',
    nodes,
    operations: [],
    history: { head_id: '', can_undo: false, can_redo: false },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}

function cadNode(overrides: Partial<CADDocumentNode> = {}): CADDocumentNode {
  return {
    id: 'node_model_step',
    model_id: 'model_step',
    parent_node_id: '',
    name: 'Bracket',
    source_format: 'step',
    transform: { matrix: [1, 0, 0, 10, 0, 1, 0, 20, 0, 0, 1, 30] },
    ...overrides,
  }
}
