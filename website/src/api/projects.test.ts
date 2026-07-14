import { describe, expect, test, vi } from 'vitest'

import client from './client'
import {
  createProjectExportArtifact,
  createProjectInspectionRecord,
  createProjectSectionArtifact,
  deleteProject,
  deleteProjectCADNode,
  deleteProjectCADOccurrence,
  deleteProjectInspectionRecord,
  deleteProjectSectionArtifact,
  duplicateProjectCADOccurrence,
  createProjectCADAssemblyGroup,
  deleteProjectCADAssemblyGroup,
  fetchProjectCADDocument,
  fetchProjectCADHistory,
  createProjectAgentConversation,
  createProjectParametricArtifact,
  fetchProjectAgentConversationMessages,
  fetchProjectAgentConversations,
  fetchProjectGeometryDocument,
  fetchProjectModelPreview,
  fetchProjectModelPreviewArtifact,
  fetchProjectModelSource,
  fetchProjectModelRevisionSource,
  fetchProjectModelRevisions,
  downloadProjectExportArtifact,
  downloadProjectSectionArtifact,
  fetchProjectExportArtifacts,
  fetchProjectInspectionRecords,
  fetchProjectSectionArtifacts,
  fetchProjectParametricArtifact,
  fetchProjectParametricArtifacts,
  addProjectCADModelBoxUnion,
  runProjectAgentParametric,
  saveProjectParametricArtifactModel,
  sendProjectAgentConversationMessage,
  redoProjectCADDocument,
  restoreProjectModelRevision,
  undoProjectCADDocument,
  updateProjectCADNodeTransform,
  updateProjectCADOccurrence,
  updateProjectCADAssemblyGroup,
  moveProjectCADOccurrence,
  updateProjectCADModelTransform,
  updateProject,
  updateProjectParametricArtifact,
  updateProjectFeatureDSLGraph,
  updateProjectParametricModelParameters,
  uploadProjectThumbnailSnapshot,
  uploadProjectModel,
} from './projects'

vi.mock('./client', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}))

describe('project API', () => {
  test('updates and deletes project metadata', () => {
    updateProject('prj_01test', {
      name: 'Wall bracket v2',
      description: 'Updated note',
    })
    deleteProject('prj_01test')

    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test', {
      name: 'Wall bracket v2',
      description: 'Updated note',
    })
    expect(client.delete).toHaveBeenCalledWith('/projects/prj_01test')
  })

  test('uploads a project model as multipart form data', () => {
    const file = new File(['ISO-10303-21;'], 'macintosh_ipad_lcd_case.step', {
      type: 'application/step',
    })

    uploadProjectModel('prj_01test', file)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/models', expect.any(FormData))
    const formData = vi.mocked(client.post).mock.calls[0]?.[1] as FormData
    expect(formData.get('model')).toBe(file)
  })

  test('uploads a project thumbnail snapshot as multipart form data', () => {
    const snapshot = new Blob(['snapshot'], { type: 'image/webp' })

    uploadProjectThumbnailSnapshot('prj_01test', snapshot, {
      width: 640,
      height: 360,
      revision: 4,
    })

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/thumbnail', expect.any(FormData))
    const formData = vi.mocked(client.post).mock.calls.at(-1)?.[1] as FormData
    expect(formData.get('snapshot')).toBeInstanceOf(File)
    expect(formData.get('width')).toBe('640')
    expect(formData.get('height')).toBe('360')
    expect(formData.get('revision')).toBe('4')
  })

  test('fetches a project model preview as a blob', () => {
    fetchProjectModelPreview('prj_01test', 'mdl_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/preview', { responseType: 'blob' })
  })

  test('fetches a project model source as a blob', () => {
    fetchProjectModelSource('prj_01test', 'mdl_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/source', { responseType: 'blob' })
  })

  test('manages project export artifacts', () => {
    const payload = {
      filename: 'assembly.step',
      content_type: 'model/step' as const,
      export_kind: 'merged' as const,
      target_count: 2,
      source_revision_ids: ['mvr_a', 'mvr_b'],
      occurrence_ids: ['occ_a', 'occ_b'],
      step_text: 'ISO-10303-21;',
    }

    fetchProjectExportArtifacts('prj_01test')
    createProjectExportArtifact('prj_01test', payload)
    downloadProjectExportArtifact('prj_01test', 'pex_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/export-artifacts')
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/export-artifacts', payload)
    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/export-artifacts/pex_01test/download', { responseType: 'blob' })
  })

  test('manages project inspection records', () => {
    const payload = {
      kind: 'measurement' as const,
      name: 'Visible bounds',
      cad_document_revision: 3,
      unit: 'millimetre',
      visible_model_ids: ['mdl_a'],
      measurement: {
        derivation: 'preview-visible-aabb' as const,
        model_count: 1,
        center: { x: 1, y: 2, z: 3 },
        size: { x: 10, y: 20, z: 30 },
        diagonal: 37.416573867739416,
      },
    }

    fetchProjectInspectionRecords('prj_01test')
    createProjectInspectionRecord('prj_01test', payload)
    deleteProjectInspectionRecord('prj_01test', 'pir_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/inspection-records')
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/inspection-records', payload)
    expect(client.delete).toHaveBeenCalledWith('/projects/prj_01test/inspection-records/pir_01test')
  })

  test('manages project section artifacts', () => {
    const payload = {
      cad_document_revision: 3,
      unit: 'millimetre',
      status: 'ready' as const,
      filename: 'center-x-section.step',
      content_type: 'model/step' as const,
      target_count: 1,
      source_revision_ids: ['mvr_a'],
      occurrence_ids: ['occ_a'],
      plane_origin: { x: 30, y: 0, z: 0 },
      plane_normal: { x: 1, y: 0, z: 0 },
      edge_count: 4,
      step_text: 'ISO-10303-21;',
    }

    fetchProjectSectionArtifacts('prj_01test')
    createProjectSectionArtifact('prj_01test', payload)
    downloadProjectSectionArtifact('prj_01test', 'pse_01test')
    deleteProjectSectionArtifact('prj_01test', 'pse_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/section-artifacts')
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/section-artifacts', payload)
    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/section-artifacts/pse_01test/download', { responseType: 'blob' })
    expect(client.delete).toHaveBeenCalledWith('/projects/prj_01test/section-artifacts/pse_01test')
  })

  test('fetches an immutable project model revision source as a blob', () => {
    fetchProjectModelRevisionSource('prj_01test', 'mdl_01test', 'mvr_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/revisions/mvr_01test/source', { responseType: 'blob' })
  })

  test('fetches project model preview artifact metadata', () => {
    fetchProjectModelPreviewArtifact('prj_01test', 'mdl_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/preview-artifact')
  })

  test('fetches a project geometry document', () => {
    fetchProjectGeometryDocument('prj_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/geometry')
  })

  test('fetches a project CAD document', () => {
    fetchProjectCADDocument('prj_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/cad-document')
  })

  test('updates a project CAD model transform', () => {
    const transform = {
      matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1] as const,
    }

    updateProjectCADModelTransform('prj_01test', 'mdl_01test', transform, 7)

    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/cad-document/models/mdl_01test/transform', {
      transform,
      expected_revision: 7,
    })
  })

  test('updates a project CAD document node transform', () => {
    const transform = {
      matrix: [1, 0, 0, 12, 0, 1, 0, -4, 0, 0, 1, 8, 0, 0, 0, 1] as const,
    }

    updateProjectCADNodeTransform('prj_01test', 'node_01test', transform, 8)

    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/cad-document/nodes/node_01test/transform', {
      transform,
      expected_revision: 8,
    })
  })

  test('deletes a project CAD document node', () => {
    deleteProjectCADNode('prj_01test', 'node_01test_component_2', 9)

    expect(client.delete).toHaveBeenCalledWith('/projects/prj_01test/cad-document/nodes/node_01test_component_2', {
      data: { expected_revision: 9 },
    })
  })

  test('authors durable CAD assembly occurrences', () => {
    const transform = {
      matrix: [1, 0, 0, 24, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const,
    }

    duplicateProjectCADOccurrence('prj_01test', 'occ_01test', 4)
    updateProjectCADOccurrence('prj_01test', 'occ_01test', { name: 'Fixture right', suppressed: true, transform }, 5)
    moveProjectCADOccurrence('prj_01test', 'occ_01test', 0, 6)
    deleteProjectCADOccurrence('prj_01test', 'occ_01test', 7)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/cad-document/occurrences/occ_01test/duplicate', { expected_revision: 4 })
    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/cad-document/occurrences/occ_01test', {
      name: 'Fixture right',
      suppressed: true,
      transform,
      expected_revision: 5,
    })
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/cad-document/occurrences/occ_01test/move', {
      target_index: 0,
      expected_revision: 6,
    })
    expect(client.delete).toHaveBeenCalledWith('/projects/prj_01test/cad-document/occurrences/occ_01test', {
      data: { expected_revision: 7 },
    })
  })

  test('authors nested CAD assembly groups', () => {
    createProjectCADAssemblyGroup('prj_01test', { name: 'Power unit', parent_group_id: '' }, 8)
    updateProjectCADAssemblyGroup('prj_01test', 'grp_01test', { suppressed: true }, 9)
    deleteProjectCADAssemblyGroup('prj_01test', 'grp_01test', 10)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/cad-document/groups', {
      name: 'Power unit',
      parent_group_id: '',
      expected_revision: 8,
    })
    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/cad-document/groups/grp_01test', {
      suppressed: true,
      expected_revision: 9,
    })
    expect(client.delete).toHaveBeenCalledWith('/projects/prj_01test/cad-document/groups/grp_01test', {
      data: { expected_revision: 10 },
    })
  })

  test('adds a project CAD model box-union feature', () => {
    const box = {
      origin: [2, -1, 4] as const,
      size: [8, 6, 3] as const,
    }

    addProjectCADModelBoxUnion('prj_01test', 'mdl_01test', box, 10)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/cad-document/models/mdl_01test/box-union', {
      box,
      expected_revision: 10,
    })
  })

  test('fetches and changes persisted CAD history', () => {
    fetchProjectCADHistory('prj_01test', 42)
    undoProjectCADDocument('prj_01test', 11)
    redoProjectCADDocument('prj_01test', 12)

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/cad-document/history', { params: { before_sequence: 42 } })
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/cad-document/history/undo', { expected_revision: 11 })
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/cad-document/history/redo', { expected_revision: 12 })
  })

  test('creates and fetches project agent conversations', () => {
    createProjectAgentConversation('prj_01test', { title: 'Fresh thread' })
    fetchProjectAgentConversations('prj_01test')

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/agent/conversations', { title: 'Fresh thread' })
    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/agent/conversations')
  })

  test('sends project agent conversation messages', () => {
    const payload = {
      messages: [{ role: 'user' as const, body: 'Inspect the model' }],
      active_model_id: 'mdl_active',
    }

    sendProjectAgentConversationMessage('prj_01test', 'agc_01test', payload)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/agent/conversations/agc_01test/messages', payload)
  })

  test('fetches project agent conversation messages', () => {
    fetchProjectAgentConversationMessages('prj_01test', 'agc_01test')

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/agent/conversations/agc_01test/messages')
  })

  test('runs a project agent parametric tool request', () => {
    const payload = {
      message: 'Make a parametric mounting bracket',
      active_model_id: 'mdl_active',
    }

    runProjectAgentParametric('prj_01test', 'agc_01test', payload)

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/agent/conversations/agc_01test/parametric-runs', payload)
  })

  test('manages project parametric artifacts', () => {
    const payload = {
      title: 'Bracket generator',
      source_kind: 'openscad' as const,
      source_code: 'cube([10, 10, 10]);',
      parameter_values: { width: 10 },
      compile_status: 'pending' as const,
    }

    fetchProjectParametricArtifacts('prj_01test')
    fetchProjectParametricArtifact('prj_01test', 'pma_01test')
    createProjectParametricArtifact('prj_01test', payload)
    updateProjectParametricArtifact('prj_01test', 'pma_01test', {
      ...payload,
      compile_status: 'success',
    })
    saveProjectParametricArtifactModel('prj_01test', 'pma_01test')
    updateProjectParametricModelParameters('prj_01test', 'mdl_01test', {
      parameter_values: { width: 12 },
      expected_revision: 13,
    })
    fetchProjectModelRevisions('prj_01test', 'mdl_01test')
    restoreProjectModelRevision('prj_01test', 'mdl_01test', 'mvr_01test', 14)

    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/parametric-artifacts')
    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/parametric-artifacts/pma_01test')
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/parametric-artifacts', payload)
    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/parametric-artifacts/pma_01test', {
      ...payload,
      compile_status: 'success',
    })
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/parametric-artifacts/pma_01test/save-model', {})
    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/parametric-parameters', {
      parameter_values: { width: 12 },
      expected_revision: 13,
    })
    expect(client.get).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/revisions')
    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/revisions/mvr_01test/restore', {
      expected_revision: 14,
    })
  })

  test('manages LiteCAD feature DSL parametric artifacts', () => {
    const payload = {
      title: 'Feature DSL bracket',
      source_kind: 'litecad-feature-dsl' as const,
      source_code:
        '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}',
      parameter_values: { width: 96 },
      compile_status: 'success' as const,
    }

    createProjectParametricArtifact('prj_01test', payload)
    updateProjectParametricArtifact('prj_01test', 'pma_01test', payload)
    updateProjectFeatureDSLGraph('prj_01test', 'mdl_01test', {
      source_code: payload.source_code,
      expected_revision: 15,
    })

    expect(client.post).toHaveBeenCalledWith('/projects/prj_01test/parametric-artifacts', payload)
    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/parametric-artifacts/pma_01test', payload)
    expect(client.patch).toHaveBeenCalledWith('/projects/prj_01test/models/mdl_01test/feature-dsl-graph', {
      source_code: payload.source_code,
      expected_revision: 15,
    })
  })
})
