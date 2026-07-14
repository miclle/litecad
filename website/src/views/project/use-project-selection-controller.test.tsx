import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CADDocumentNode, ProjectModel, ProjectParametricArtifact } from 'src/types/project'
import { useProjectSelectionController } from './use-project-selection-controller'

const model = {
  id: 'mdl_base',
  project_id: 'prj_test',
  original_filename: 'base.step',
  format: 'step',
  content_type: 'application/step',
  byte_size: 120,
  parse_status: 'parsed',
  parse_error: '',
  current_revision_id: 'mvr_base',
  revision_sequence: 1,
  metadata: {
    asset_type: 'step',
    version: '',
    schema: 'AP214',
    product_names: ['Base'],
    length_unit: 'millimetre',
    entity_count: 10,
    representation_count: 1,
    triangle_count: 12,
  },
  created_at: '2026-07-13T00:00:00Z',
  updated_at: '2026-07-13T00:00:00Z',
} satisfies ProjectModel

const node = {
  id: 'node_base',
  model_id: model.id,
  parent_node_id: '',
  name: 'Base',
  source_format: 'step',
  transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
} satisfies CADDocumentNode

const artifact = {
  id: 'pma_test',
  project_id: 'prj_test',
  conversation_id: 'agc_test',
  message_id: 'agm_test',
  title: 'Generated bracket',
  source_kind: 'litecad-feature-dsl',
  source_code: '{}',
  parameter_values: {},
  compile_status: 'pending',
  compile_error: '',
  preview_model_id: '',
  generation_tool_mode: 'native_tool',
  generation_duration_ms: 120,
  created_at: '2026-07-13T00:00:00Z',
  updated_at: '2026-07-13T00:00:00Z',
} satisfies ProjectParametricArtifact

describe('useProjectSelectionController', () => {
  it('selects project models through their CAD document nodes', () => {
    const { result } = renderController()

    act(() => result.current.selectModel(model.id))

    expect(result.current.selectedArtifact).toBeUndefined()
    expect(result.current.effectiveSelectedModelID).toBe(model.id)
    expect(result.current.effectiveSelectedDocumentNodeID).toBe(node.id)
    expect(result.current.selectedDocumentNode?.id).toBe(node.id)
    expect(result.current.selectedSourceModel?.id).toBe(model.id)
  })

  it('clears model selection when an Assistant artifact is selected', () => {
    const { result } = renderController()

    act(() => result.current.selectModel(model.id))
    act(() => result.current.selectArtifact(artifact))

    expect(result.current.selectedArtifact?.id).toBe(artifact.id)
    expect(result.current.effectiveSelectedModelID).toBe('')
    expect(result.current.effectiveSelectedDocumentNodeID).toBe('')
    expect(result.current.activeCADTool).toBe('inspect')
  })

  it('returns to inspect mode when clearing selection', () => {
    const { result } = renderController()

    act(() => result.current.selectModel(model.id))
    act(() => result.current.setActiveCADTool('fuse-box'))
    act(() => result.current.clearSelection())

    expect(result.current.activeCADTool).toBe('inspect')
    expect(result.current.selectedArtifact).toBeUndefined()
    expect(result.current.effectiveSelectedModelID).toBe('')
  })
})

function renderController() {
  return renderHook(() =>
    useProjectSelectionController({
      cadNodeByID: new Map([[node.id, node]]),
      projectModels: [model],
      sourceNodeIDByModelID: new Map([[model.id, node.id]]),
    }),
  )
}
