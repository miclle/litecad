import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addProjectCADModelBoxUnion,
  deleteProjectCADNode,
  deleteProjectCADOccurrence,
  duplicateProjectCADOccurrence,
  createProjectCADAssemblyGroup,
  deleteProjectCADAssemblyGroup,
  moveProjectCADOccurrence,
  redoProjectCADDocument,
  undoProjectCADDocument,
  updateProjectCADNodeTransform,
  updateProjectCADOccurrence,
  updateProjectCADAssemblyGroup,
} from 'src/api/projects'
import type { ProjectCADDocument } from 'src/types/project'
import { useCADDocumentCommands } from './use-cad-document-commands'

vi.mock('src/api/projects', () => ({
  addProjectCADModelBoxUnion: vi.fn(),
  deleteProjectCADNode: vi.fn(),
  deleteProjectCADOccurrence: vi.fn(),
  duplicateProjectCADOccurrence: vi.fn(),
  createProjectCADAssemblyGroup: vi.fn(),
  deleteProjectCADAssemblyGroup: vi.fn(),
  moveProjectCADOccurrence: vi.fn(),
  redoProjectCADDocument: vi.fn(),
  undoProjectCADDocument: vi.fn(),
  updateProjectCADNodeTransform: vi.fn(),
  updateProjectCADOccurrence: vi.fn(),
  updateProjectCADAssemblyGroup: vi.fn(),
}))

const projectId = 'project_test'
const nodeId = 'node_test'
const occurrenceId = 'occ_test'
const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const

function projectDocument(revision: number): ProjectCADDocument {
  return {
    id: 'cad_document_test',
    project_id: projectId,
    schema_version: 2,
    revision,
    unit: 'mm',
    assembly: {
      id: 'assembly_test',
      name: 'Test assembly',
      occurrences: [
        {
          id: occurrenceId,
          node_id: nodeId,
          model_id: 'model_test',
          model_revision_id: 'mvr_test',
          name: 'Part',
          suppressed: false,
          transform: { matrix: identityMatrix },
        },
      ],
    },
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  queryClient.setQueryData(['projects', projectId, 'cad-document'], document)
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { queryClient, wrapper }
}

describe('useCADDocumentCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes document and history after an autosave conflict without accepting stale state', async () => {
    const conflict = Object.assign(new Error('conflict'), {
      response: { status: 409 },
    })
    vi.mocked(updateProjectCADNodeTransform).mockRejectedValue(conflict)
    const onConflict = vi.fn()
    const onTransformSynchronized = vi.fn()
    const { queryClient, wrapper } = createHarness()
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const { result } = renderHook(
      () =>
        useCADDocumentCommands({
          projectId,
          autosaveDelayMS: 0,
          onConflict,
          onTransformSynchronized,
        }),
      { wrapper },
    )

    act(() => {
      result.current.scheduleTransformAutosave(nodeId, { x: 12, y: 2, z: -4 })
    })

    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('Document changed in another session. Latest version loaded.'))
    expect(updateProjectCADNodeTransform).toHaveBeenCalledWith(projectId, nodeId, expect.any(Object), 7)
    expect(queryClient.getQueryData<ProjectCADDocument>(['projects', projectId, 'cad-document'])?.revision).toBe(7)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects', projectId, 'cad-document'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['projects', projectId, 'cad-document', 'history'],
    })
    expect(onTransformSynchronized).toHaveBeenCalledWith(nodeId)
  })

  it('notifies the route when the latest transform draft is committed', async () => {
    vi.mocked(updateProjectCADNodeTransform).mockResolvedValue({
      data: { document: projectDocument(8) },
    } as Awaited<ReturnType<typeof updateProjectCADNodeTransform>>)
    const onTransformSynchronized = vi.fn()
    const { wrapper } = createHarness()
    const { result } = renderHook(
      () =>
        useCADDocumentCommands({
          projectId,
          autosaveDelayMS: 0,
          onTransformSynchronized,
        }),
      { wrapper },
    )

    act(() => {
      result.current.scheduleTransformAutosave(nodeId, { x: 12, y: 2, z: -4 })
    })

    await waitFor(() => expect(onTransformSynchronized).toHaveBeenCalledWith(nodeId))
  })

  it('commits top-level placement through the occurrence endpoint', async () => {
    vi.mocked(updateProjectCADOccurrence).mockResolvedValue({
      data: { document: projectDocument(8) },
    } as Awaited<ReturnType<typeof updateProjectCADOccurrence>>)
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useCADDocumentCommands({ projectId, autosaveDelayMS: 0 }), { wrapper })

    act(() => {
      result.current.scheduleTransformAutosave(occurrenceId, {
        x: 18,
        y: 2,
        z: -4,
      })
    })

    await waitFor(() =>
      expect(updateProjectCADOccurrence).toHaveBeenCalledWith(
        projectId,
        occurrenceId,
        {
          transform: {
            matrix: [1, 0, 0, 18, 0, 1, 0, 2, 0, 0, 1, -4, 0, 0, 0, 1],
          },
        },
        7,
      ),
    )
    expect(updateProjectCADNodeTransform).not.toHaveBeenCalled()
  })

  it('reports history work as pending so delete and shortcut surfaces share one action gate', async () => {
    let resolveUndo: (() => void) | undefined
    const pendingUndo = new Promise<void>((resolve) => {
      resolveUndo = resolve
    }).then(() => ({ data: { document: projectDocument(8) } }) as Awaited<ReturnType<typeof undoProjectCADDocument>>)
    vi.mocked(undoProjectCADDocument).mockReturnValue(pendingUndo)
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useCADDocumentCommands({ projectId }), {
      wrapper,
    })

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

  it('serializes occurrence authoring commands through document revisions', async () => {
    vi.mocked(duplicateProjectCADOccurrence).mockResolvedValue({
      data: { document: projectDocument(8) },
    } as Awaited<ReturnType<typeof duplicateProjectCADOccurrence>>)
    vi.mocked(updateProjectCADOccurrence).mockResolvedValue({
      data: { document: projectDocument(9) },
    } as Awaited<ReturnType<typeof updateProjectCADOccurrence>>)
    vi.mocked(moveProjectCADOccurrence).mockResolvedValue({
      data: { document: projectDocument(10) },
    } as Awaited<ReturnType<typeof moveProjectCADOccurrence>>)
    vi.mocked(deleteProjectCADOccurrence).mockResolvedValue({
      data: { document: projectDocument(11) },
    } as Awaited<ReturnType<typeof deleteProjectCADOccurrence>>)
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useCADDocumentCommands({ projectId }), {
      wrapper,
    })

    act(() => result.current.duplicateOccurrence(occurrenceId))
    await waitFor(() => expect(duplicateProjectCADOccurrence).toHaveBeenCalledWith(projectId, occurrenceId, 7))
    act(() =>
      result.current.updateOccurrence(occurrenceId, {
        name: 'Fixture right',
        suppressed: true,
      }),
    )
    await waitFor(() => expect(updateProjectCADOccurrence).toHaveBeenCalledWith(projectId, occurrenceId, { name: 'Fixture right', suppressed: true }, 8))
    act(() => result.current.moveOccurrence(occurrenceId, 0))
    await waitFor(() => expect(moveProjectCADOccurrence).toHaveBeenCalledWith(projectId, occurrenceId, 0, 9))
    act(() => result.current.deleteOccurrence(occurrenceId))
    await waitFor(() => expect(deleteProjectCADOccurrence).toHaveBeenCalledWith(projectId, occurrenceId, 10))
  })

  it('serializes assembly group commands through document revisions', async () => {
    vi.mocked(createProjectCADAssemblyGroup).mockResolvedValue({
      data: { document: projectDocument(8) },
    } as Awaited<ReturnType<typeof createProjectCADAssemblyGroup>>)
    vi.mocked(updateProjectCADAssemblyGroup).mockResolvedValue({
      data: { document: projectDocument(9) },
    } as Awaited<ReturnType<typeof updateProjectCADAssemblyGroup>>)
    vi.mocked(deleteProjectCADAssemblyGroup).mockResolvedValue({
      data: { document: projectDocument(10) },
    } as Awaited<ReturnType<typeof deleteProjectCADAssemblyGroup>>)
    const { wrapper } = createHarness()
    const { result } = renderHook(() => useCADDocumentCommands({ projectId }), {
      wrapper,
    })

    act(() => result.current.createAssemblyGroup('Power unit', ''))
    await waitFor(() => expect(createProjectCADAssemblyGroup).toHaveBeenCalledWith(projectId, { name: 'Power unit', parent_group_id: '' }, 7))
    act(() => result.current.updateAssemblyGroup('grp_power', { suppressed: true }))
    await waitFor(() => expect(updateProjectCADAssemblyGroup).toHaveBeenCalledWith(projectId, 'grp_power', { suppressed: true }, 8))
    act(() => result.current.deleteAssemblyGroup('grp_power'))
    await waitFor(() => expect(deleteProjectCADAssemblyGroup).toHaveBeenCalledWith(projectId, 'grp_power', 9))
  })
})
