import { describe, expect, test } from 'vitest'

import type { ProjectCADDocument } from 'src/types/project'
import { shouldAcceptCADNodeTransformDocument } from './cad-document-cache'

const documentWithNodes = (nodeIds: string[]): ProjectCADDocument => ({
  id: 'doc_01test',
  project_id: 'prj_01test',
  schema_version: 1,
  revision: 1,
  history: { head_id: '', can_undo: false, can_redo: false },
  unit: 'millimetre',
  nodes: nodeIds.map((nodeId) => ({
    id: nodeId,
    model_id: nodeId === 'node_mdl_step' ? 'mdl_step' : '',
    source_model_id: 'mdl_step',
    parent_node_id: nodeId === 'node_mdl_step' ? '' : 'node_mdl_step',
    name: nodeId,
    source_format: nodeId === 'node_mdl_step' ? 'step' : 'step-component',
    transform: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
  })),
  operations: [],
  created_at: '2026-07-10T00:00:00Z',
  updated_at: '2026-07-10T00:00:00Z',
})

describe('CAD document cache guards', () => {
  test('rejects stale node transform documents after the node was deleted from cache', () => {
    expect(shouldAcceptCADNodeTransformDocument(documentWithNodes(['node_mdl_step']), 'node_mdl_step_component_1')).toBe(false)
  })

  test('accepts node transform documents when the node still exists in cache', () => {
    expect(shouldAcceptCADNodeTransformDocument(documentWithNodes(['node_mdl_step', 'node_mdl_step_component_1']), 'node_mdl_step_component_1')).toBe(
      true,
    )
  })

  test('accepts node transform documents before the cache is populated', () => {
    expect(shouldAcceptCADNodeTransformDocument(undefined, 'node_mdl_step_component_1')).toBe(true)
  })
})
