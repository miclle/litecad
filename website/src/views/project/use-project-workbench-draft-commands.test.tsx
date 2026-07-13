import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CADBoxFeature, CADDocumentNode, ProjectCADDocument } from 'src/types/project'
import {
  useProjectWorkbenchDraftCommands,
  type ProjectWorkbenchDraftCommandAdapter,
} from './use-project-workbench-draft-commands'

describe('useProjectWorkbenchDraftCommands', () => {
  let commandAdapter: ProjectWorkbenchDraftCommandAdapter
  let commandAdapterRef: RefObject<ProjectWorkbenchDraftCommandAdapter | null>

  beforeEach(() => {
    commandAdapter = {
      addBoxUnion: vi.fn(),
      cancelTransformAutosave: vi.fn(),
      scheduleTransformAutosave: vi.fn(),
      setBoxValidationError: vi.fn(),
      setTransformValidationError: vi.fn(),
    }
    commandAdapterRef = { current: commandAdapter }
  })

  it('updates transform drafts from canvas translations and schedules autosave for the source node', () => {
    const node = cadNode({ id: 'node_model_step', model_id: 'model_step' })
    const { result } = renderHook(() =>
      useDraftCommandsScenario({
        cadNodeByID: new Map([[node.id, node]]),
        sourceNodeIDByModelID: new Map([[node.model_id, node.id]]),
      }),
    )

    act(() => result.current.updateTransformDraftFromTranslation(node.model_id, { x: 4, y: 5, z: 6 }))

    expect(result.current.transformDraftsByNodeID[node.id]).toEqual({ x: '4', y: '5', z: '6' })
    expect(result.current.draftModelTranslationsByID).toMatchObject({
      [node.id]: { x: 4, y: 5, z: 6 },
      [node.model_id]: { x: 4, y: 5, z: 6 },
    })
    expect(commandAdapter.setTransformValidationError).toHaveBeenCalledWith(node.id, '')
    expect(commandAdapter.scheduleTransformAutosave).toHaveBeenCalledWith(node.id, { x: 4, y: 5, z: 6 })
  })

  it('cancels autosave and reports invalid transform input', () => {
    const node = cadNode({ id: 'node_model_step' })
    const { result } = renderHook(() =>
      useDraftCommandsScenario({
        cadNodeByID: new Map([[node.id, node]]),
      }),
    )

    act(() => result.current.updateTransformDraftField(node.id, 'x', 'bad'))

    expect(result.current.transformDraftsByNodeID[node.id]).toEqual({ x: 'bad', y: '20', z: '30' })
    expect(commandAdapter.cancelTransformAutosave).toHaveBeenCalledWith(node.id)
    expect(commandAdapter.setTransformValidationError).toHaveBeenCalledWith(node.id, 'Invalid transform')
    expect(commandAdapter.scheduleTransformAutosave).not.toHaveBeenCalled()
  })

  it('cancels autosave when transform input matches the saved node transform', () => {
    const node = cadNode({ id: 'node_model_step' })
    const { result } = renderHook(() =>
      useDraftCommandsScenario({
        cadNodeByID: new Map([[node.id, node]]),
      }),
    )

    act(() => result.current.updateTransformDraftField(node.id, 'x', '10'))

    expect(commandAdapter.cancelTransformAutosave).toHaveBeenCalledWith(node.id)
    expect(commandAdapter.setTransformValidationError).toHaveBeenCalledWith(node.id, '')
    expect(commandAdapter.scheduleTransformAutosave).not.toHaveBeenCalled()
  })

  it('falls back to the latest box operation draft and applies valid box unions', () => {
    const document = cadDocument([
      {
        id: 'box_1',
        type: 'box-union',
        model_id: 'model_step',
        box: { origin: [1, 2, 3], size: [4, 5, 6] },
        created_at: '2026-07-13T00:00:00Z',
      },
    ])
    const { result } = renderHook(() => useDraftCommandsScenario({ projectCADDocument: document }))

    expect(result.current.latestBoxFeatureDraftForModel('model_step')).toEqual({
      originX: '1',
      originY: '2',
      originZ: '3',
      sizeX: '4',
      sizeY: '5',
      sizeZ: '6',
    })

    act(() => result.current.updateBoxFeatureDraft('model_step', 'sizeX', '8'))
    act(() => result.current.addBoxFeatureDraft('model_step'))

    expect(commandAdapter.addBoxUnion).toHaveBeenCalledWith('model_step', { origin: [1, 2, 3], size: [8, 5, 6] })
    expect(commandAdapter.setBoxValidationError).not.toHaveBeenCalled()
  })

  it('reports invalid box drafts without applying a box union', () => {
    const { result } = renderHook(() => useDraftCommandsScenario())

    act(() => result.current.updateBoxFeatureDraft('model_step', 'sizeX', '0'))
    act(() => result.current.addBoxFeatureDraft('model_step'))

    expect(commandAdapter.setBoxValidationError).toHaveBeenCalledWith('model_step', 'Invalid box feature')
    expect(commandAdapter.addBoxUnion).not.toHaveBeenCalled()
  })

  it('cleans transform and box drafts after a CAD document node is deleted', () => {
    const onSelectionClear = vi.fn()
    const node = cadNode({ id: 'node_model_step', model_id: 'model_step' })
    const { result } = renderHook(() =>
      useDraftCommandsScenario({
        cadNodeByID: new Map([[node.id, node]]),
        onSelectionClear,
        sourceNodeIDByModelID: new Map([[node.model_id, node.id]]),
      }),
    )

    act(() => result.current.updateTransformDraftFromTranslation(node.model_id, { x: 4, y: 5, z: 6 }))
    act(() => result.current.updateBoxFeatureDraft(node.model_id, 'sizeX', '8'))
    act(() => result.current.handleCADDocumentNodeDeleted(node.id))

    expect(result.current.transformDraftsByNodeID[node.id]).toBeUndefined()
    expect(result.current.boxFeatureDraftsByModelID[node.model_id]).toBeUndefined()
    expect(onSelectionClear).toHaveBeenCalledTimes(1)
  })

  function useDraftCommandsScenario(overrides: Partial<Parameters<typeof useProjectWorkbenchDraftCommands>[0]> = {}) {
    return useProjectWorkbenchDraftCommands({
      cadNodeByID: new Map(),
      commandAdapterRef,
      onSelectionClear: vi.fn(),
      sourceNodeIDByModelID: new Map(),
      ...overrides,
    })
  }
})

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

function cadDocument(operations: Array<{ id: string; type: 'box-union'; model_id: string; box: CADBoxFeature; created_at: string }>): ProjectCADDocument {
  return {
    id: 'doc_draft',
    project_id: 'prj_draft',
    schema_version: 1,
    revision: 1,
    unit: 'millimetre',
    nodes: [],
    operations,
    history: { head_id: '', can_undo: false, can_redo: false },
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
  }
}
