import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ChangeEvent, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useProjectModelUploadController } from './use-project-model-upload-controller'

const uploadFile = new File(['solid'], 'bracket.step', { type: 'model/step' })

describe('useProjectModelUploadController', () => {
  it('uploads a selected file and refreshes project model state', async () => {
    const uploadProjectModel = vi.fn(async () => ({}))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(
      () =>
        useProjectModelUploadController({
          dependencies: { uploadProjectModel },
          projectId: 'prj_test',
        }),
      { wrapper: queryWrapper(queryClient) },
    )

    act(() => result.current.uploadModelFile(uploadFile))

    await waitFor(() => expect(uploadProjectModel).toHaveBeenCalledTimes(1))
    expect(uploadProjectModel).toHaveBeenCalledWith('prj_test', uploadFile)
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_test', 'models'] }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects', 'prj_test', 'cad-document'] })
    expect(result.current.uploadError).toBe('')
  })

  it('reports a stable upload error when the upload fails', async () => {
    const uploadProjectModel = vi.fn(async () => {
      throw new Error('upload failed')
    })
    const { result } = renderHook(
      () =>
        useProjectModelUploadController({
          dependencies: { uploadProjectModel },
          projectId: 'prj_test',
        }),
      { wrapper: queryWrapper() },
    )

    act(() => result.current.uploadModelFile(uploadFile))

    await waitFor(() =>
      expect(result.current.uploadError).toBe('Model upload failed. Check that the file is STEP, GLTF, GLB, or STL and try again.'),
    )
  })

  it('ignores empty file selections', () => {
    const uploadProjectModel = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectModelUploadController({
          dependencies: { uploadProjectModel },
          projectId: 'prj_test',
        }),
      { wrapper: queryWrapper() },
    )

    act(() => result.current.uploadModelFile())

    expect(uploadProjectModel).not.toHaveBeenCalled()
  })

  it('resets the file input after handling a selected file', async () => {
    const uploadProjectModel = vi.fn(async () => ({}))
    const { result } = renderHook(
      () =>
        useProjectModelUploadController({
          dependencies: { uploadProjectModel },
          projectId: 'prj_test',
        }),
      { wrapper: queryWrapper() },
    )
    const target = { files: [uploadFile], value: 'C:\\fakepath\\bracket.step' }

    act(() => result.current.handleModelFileChange({ target } as unknown as ChangeEvent<HTMLInputElement>))

    await waitFor(() => expect(uploadProjectModel).toHaveBeenCalledWith('prj_test', uploadFile))
    expect(target.value).toBe('')
  })
})

function queryWrapper(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}
