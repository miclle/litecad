import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addProjectCADModelBoxUnion,
  deleteProjectCADNode,
  redoProjectCADDocument,
  undoProjectCADDocument,
  updateProjectCADNodeTransform,
} from 'src/api/projects'
import type { ProjectCADDocument } from 'src/types/project'
import { useCADDocumentCommands } from './use-cad-document-commands'

vi.mock('src/api/projects', () => ({
  addProjectCADModelBoxUnion: vi.fn(),
  deleteProjectCADNode: vi.fn(),
  redoProjectCADDocument: vi.fn(),
  undoProjectCADDocument: vi.fn(),
  updateProjectCADNodeTransform: vi.fn(),
}))

const projectId = 'project_test'
const nodeId = 'node_test'
const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

function projectDocument(revision: number): ProjectCADDocument {
  return {
    id: 'cad_document_test',
    project_id: projectId,
    schema_version: 1,
    revision,
    unit: 'mm',
    nodes: [
      {
        id: nodeId,
        model_id: 'model_test',
        parent_node_id: '',
        name: 'Part',
        source_format: 'step-component',
        transform: { matrix: identityMatrix },
      },
    ],
    operations: [],
    history: { head_id: '', can_undo: revision > 1, can_redo: false },
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  }
}

function createHarness(document = projectDocument(7)) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(['projects', projectId, 'cad-document'], document)
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useCADDocumentCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes document and history after an autosave conflict without accepting stale state', async () => {
    const conflict = Object.assign(new Error('conflict'), { response: { status: 409 } })
    vi.mocked(updateProjectCADNodeTransform).mockRejectedValue(conflict)
    const onConflict = vi.fn()
    const onTransformSynchronized = vi.fn()
    const { queryClient, wrapper } = createHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const { result } = renderHook(
      () => useCADDocumentCommands({ projectId, autosaveDelayMS: 0, onConflict, onTransformSynchronized }),
      { wrapper },
    )

    act(() => {
      result.current.scheduleTransformAutosave(nodeId, { x: 12, y: 2, z: -4 })
    })

    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('Document changed in another session. Latest version loaded.'))
    expect(updateProjectCADNodeTransform).toHaveBeenCalledWith(projectId, nodeId, expect.any(Object), 7)
    expect(queryClient.getQueryData<ProjectCADDocument>(['projects', projectId, 'cad-document'])?.revision).toBe(7)
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', projectId, 'cad-document'] })
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', projectId, 'cad-document', 'history'] })
    expect(onTransformSynchronized).toHaveBeenCalledWith(nodeId)
  })

  it('notifies the route when the latest transform draft is committed', async () => {
    vi.mocked(updateProjectCADNodeTransform).mockResolvedValue(
      { data: { document: projectDocument(8) } } as Awaited<ReturnType<typeof updateProjectCADNodeTransform>>,
    )
    const onTransformSynchronized = vi.fn()
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () => useCADDocumentCommands({ projectId, autosaveDelayMS: 0, onTransformSynchronized }),
      { wrapper },
    )

    act(() => {
      result.current.scheduleTransformAutosave(nodeId, { x: 12, y: 2, z: -4 })
    })

    await waitFor(() => expect(onTransformSynchronized).toHaveBeenCalledWith(nodeId))
  })

  it('reports history work as pending so delete and shortcut surfaces share one action gate', async () => {
    let resolveUndo: (() => void) | undefined
    const pendingUndo = new Promise<void>((resolve) => {
      resolveUndo = resolve
    }).then(() => ({ data: { document: projectDocument(8) } }) as Awaited<ReturnType<typeof undoProjectCADDocument>>)
    vi.mocked(undoProjectCADDocument).mockReturnValue(
      pendingUndo,
    )
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useCADDocumentCommands({ projectId }), { wrapper })

    act(() => {
      result.current.changeHistory('undo')
    })

    await waitFor(() => expect(result.current.isPending).toBe(true))
    expect(deleteProjectCADNode).not.toHaveBeenCalled()
    expect(addProjectCADModelBoxUnion).not.toHaveBeenCalled()
    expect(redoProjectCADDocument).not.toHaveBeenCalled()

    await act(async () => {
      resolveUndo?.()
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
  })
})
