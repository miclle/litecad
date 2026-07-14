import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { StepExportTarget } from './project-step-export'
import { useProjectStepExportController } from './use-project-step-export-controller'
import type { ProjectExportArtifact } from 'src/types/project'

const targets: StepExportTarget[] = [
  {
	occurrenceId: 'occurrence_mdl_a',
    modelId: 'mdl_a',
	modelRevisionId: 'mvr_a',
    sourceFormat: 'step',
    displayName: 'A',
    sourceFilename: 'a.step',
    downloadFilename: 'a-litecad-r4.step',
    operations: [],
  },
  {
	occurrenceId: 'occurrence_mdl_b',
    modelId: 'mdl_b',
	modelRevisionId: 'mvr_b',
    sourceFormat: 'step',
    displayName: 'B',
    sourceFilename: 'b.step',
    downloadFilename: 'b-litecad-r4.step',
    operations: [],
  },
]

describe('useProjectStepExportController', () => {
  it('defaults to all available export targets and preserves manual selection intent', async () => {
    const fetchExportArtifacts = vi.fn(async () => [])
    const { result, rerender } = renderHook(
      ({ nextTargets }) =>
        useProjectStepExportController({
          assemblyDownloadFilename: 'assembly-r4.step',
          dependencies: { fetchExportArtifacts },
          projectId: 'prj_test',
          targets: nextTargets,
        }),
      { initialProps: { nextTargets: targets }, wrapper: queryWrapper() },
    )

		await waitFor(() => expect([...result.current.selectedTargetIDs].sort()).toEqual(['occurrence_mdl_a', 'occurrence_mdl_b']))

		act(() => result.current.toggleTarget('occurrence_mdl_b'))
		expect([...result.current.selectedTargetIDs]).toEqual(['occurrence_mdl_a'])

    rerender({ nextTargets: targets.slice(0, 1) })
		await waitFor(() => expect([...result.current.selectedTargetIDs]).toEqual(['occurrence_mdl_a']))
  })

  it('exports selected models separately and records per-model status', async () => {
    const createExportArtifact = vi.fn(async () => undefined)
    const exportSingleTarget = vi.fn(async () => ({ exportedStepText: 'STEP' }))
    const fetchExportArtifacts = vi.fn(async () => [])
    const { result } = renderHook(
      () =>
        useProjectStepExportController({
          assemblyDownloadFilename: 'assembly-r4.step',
          dependencies: {
          createExportArtifact,
          exportSingleTarget,
          fetchExportArtifacts,
          },
          projectId: 'prj_test',
          targets,
        }),
      { wrapper: queryWrapper() },
    )

    await waitFor(() => expect(result.current.selectedTargets).toHaveLength(2))

    await act(async () => {
      await result.current.exportSelection('separate')
    })

    expect(exportSingleTarget).toHaveBeenCalledTimes(2)
    expect(result.current.statusByModelID.mdl_a).toBe('Downloaded a-litecad-r4.step')
    expect(result.current.statusByModelID.mdl_b).toBe('Downloaded b-litecad-r4.step')
  })

  it('stores merged export artifact history after browser-kernel export succeeds', async () => {
    const exportMergedTargets = vi.fn(async () => ({ exportedStepText: 'ISO-10303-21; MERGED' }))
    const createExportArtifact = vi.fn(async () => undefined)
    const fetchExportArtifacts = vi.fn(async () => [])
    const { result } = renderHook(
      () =>
        useProjectStepExportController({
          assemblyDownloadFilename: 'assembly-r4.step',
          dependencies: {
          createExportArtifact,
          exportMergedTargets,
          fetchExportArtifacts,
          },
          projectId: 'prj_test',
          targets,
        }),
      { wrapper: queryWrapper() },
    )

    await waitFor(() => expect(result.current.selectedTargets).toHaveLength(2))

    await act(async () => {
      await result.current.exportSelection('merged')
    })

    expect(createExportArtifact).toHaveBeenCalledWith('prj_test', {
      filename: 'assembly-r4.step',
      content_type: 'model/step',
      export_kind: 'merged',
      target_count: 2,
      source_revision_ids: ['mvr_a', 'mvr_b'],
      occurrence_ids: ['occurrence_mdl_a', 'occurrence_mdl_b'],
      step_text: 'ISO-10303-21; MERGED',
    })
  })

  it('loads stored export history and downloads an artifact through the browser publisher', async () => {
    const artifact: ProjectExportArtifact = {
      id: 'pex_01test',
      project_id: 'prj_test',
      filename: 'assembly-r4.step',
      content_type: 'model/step',
      export_kind: 'merged',
      target_count: 2,
      source_revision_ids: ['mvr_a', 'mvr_b'],
      occurrence_ids: ['occurrence_mdl_a', 'occurrence_mdl_b'],
      byte_size: 20,
      created_at: '2026-07-14T12:00:00Z',
      updated_at: '2026-07-14T12:00:00Z',
    }
    const fetchExportArtifacts = vi.fn(async () => [artifact])
    const downloadExportArtifact = vi.fn(async () => new Blob(['ISO-10303-21; HISTORY'], { type: 'model/step' }))
    const publishDownload = vi.fn()
    const { result } = renderHook(
      () =>
        useProjectStepExportController({
          assemblyDownloadFilename: 'assembly-r4.step',
          dependencies: {
            downloadExportArtifact,
            fetchExportArtifacts,
            publishDownload,
          },
          projectId: 'prj_test',
          targets,
        }),
      { wrapper: queryWrapper() },
    )

    await waitFor(() => expect(result.current.exportArtifacts).toEqual([artifact]))

    await act(async () => {
      await result.current.downloadExportArtifact('pex_01test')
    })

    expect(downloadExportArtifact).toHaveBeenCalledWith('prj_test', 'pex_01test')
    expect(publishDownload).toHaveBeenCalledWith({
      filename: 'assembly-r4.step',
      stepText: 'ISO-10303-21; HISTORY',
    })
  })
})

function queryWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}
