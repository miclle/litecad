import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ModelPreviewSnapshotCapture } from './model-preview'
import type { ProjectPreviewAsset } from './project-preview-assets'
import { useProjectThumbnailSnapshotController } from './use-project-thumbnail-snapshot-controller'

const snapshot = {
  blob: new Blob(['thumbnail'], { type: 'image/webp' }),
  width: 640,
  height: 360,
} satisfies ModelPreviewSnapshotCapture

const previewAssets = [
  {
    modelId: 'mdl_step',
    name: 'Step model',
    previewFormat: 'kernel-mesh',
    mesh: { positions: [], normals: [], indices: [] },
    meshSummary: { vertexCount: 0, triangleCount: 0, hasNormals: false },
  },
] satisfies ProjectPreviewAsset[]

describe('useProjectThumbnailSnapshotController', () => {
  it('publishes the first valid snapshot and invalidates the project list', async () => {
    const saveThumbnailSnapshot = thumbnailSaveMock()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () =>
        useProjectThumbnailSnapshotController({
          dependencies: { saveThumbnailSnapshot },
          previewAssets,
          projectId: 'prj_test',
          revision: 3,
          visibleModelIds: ['mdl_step'],
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => result.current.onSnapshotCapture(snapshot))

    await waitFor(() => expect(saveThumbnailSnapshot).toHaveBeenCalledTimes(1))
    expect(saveThumbnailSnapshot).toHaveBeenCalledWith('prj_test', snapshot, 3)
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] }))
  })

  it('deduplicates repeated captures for the same project revision and visible signature', async () => {
    const saveThumbnailSnapshot = thumbnailSaveMock()
    const { result } = renderHook(
      () =>
        useProjectThumbnailSnapshotController({
          dependencies: { saveThumbnailSnapshot },
          previewAssets,
          projectId: 'prj_test',
          revision: 3,
          visibleModelIds: ['mdl_step'],
        }),
      { wrapper: queryWrapper() },
    )

    act(() => {
      result.current.onSnapshotCapture(snapshot)
      result.current.onSnapshotCapture(snapshot)
    })

    await waitFor(() => expect(saveThumbnailSnapshot).toHaveBeenCalledTimes(1))
  })

  it('skips captures when no visible project geometry can produce a list thumbnail', () => {
    const saveThumbnailSnapshot = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectThumbnailSnapshotController({
          dependencies: { saveThumbnailSnapshot },
          previewAssets,
          projectId: 'prj_test',
          revision: 3,
          visibleModelIds: [],
        }),
      { wrapper: queryWrapper() },
    )

    act(() => result.current.onSnapshotCapture(snapshot))

    expect(saveThumbnailSnapshot).not.toHaveBeenCalled()
  })

  it('allows a new publication when the revision changes', async () => {
    const saveThumbnailSnapshot = thumbnailSaveMock()
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useProjectThumbnailSnapshotController({
          dependencies: { saveThumbnailSnapshot },
          previewAssets,
          projectId: 'prj_test',
          revision,
          visibleModelIds: ['mdl_step'],
        }),
      { initialProps: { revision: 3 }, wrapper: queryWrapper() },
    )

    act(() => result.current.onSnapshotCapture(snapshot))
    await waitFor(() => expect(saveThumbnailSnapshot).toHaveBeenCalledTimes(1))

    rerender({ revision: 4 })
    act(() => result.current.onSnapshotCapture(snapshot))

    await waitFor(() => expect(saveThumbnailSnapshot).toHaveBeenCalledTimes(2))
  })
})

function thumbnailSaveMock() {
  return vi.fn(async () => ({
    url: '/api/v1/projects/prj_test/thumbnail',
    status: 'ready' as const,
    revision: 3,
    width: 640,
    height: 360,
    updated_at: '2026-07-13T00:00:00Z',
  }))
}

function queryWrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}
