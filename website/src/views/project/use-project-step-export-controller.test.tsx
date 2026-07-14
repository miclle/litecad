import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { StepExportTarget } from './project-step-export'
import { useProjectStepExportController } from './use-project-step-export-controller'

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
    const { result, rerender } = renderHook(
      ({ nextTargets }) =>
        useProjectStepExportController({
          assemblyDownloadFilename: 'assembly-r4.step',
          projectId: 'prj_test',
          targets: nextTargets,
        }),
      { initialProps: { nextTargets: targets } },
    )

		await waitFor(() => expect([...result.current.selectedTargetIDs].sort()).toEqual(['occurrence_mdl_a', 'occurrence_mdl_b']))

		act(() => result.current.toggleTarget('occurrence_mdl_b'))
		expect([...result.current.selectedTargetIDs]).toEqual(['occurrence_mdl_a'])

    rerender({ nextTargets: targets.slice(0, 1) })
		await waitFor(() => expect([...result.current.selectedTargetIDs]).toEqual(['occurrence_mdl_a']))
  })

  it('exports selected models separately and records per-model status', async () => {
    const exportSingleTarget = vi.fn(async () => ({ exportedStepText: 'STEP' }))
    const { result } = renderHook(() =>
      useProjectStepExportController({
        assemblyDownloadFilename: 'assembly-r4.step',
        dependencies: {
          exportSingleTarget,
        },
        projectId: 'prj_test',
        targets,
      }),
    )

    await waitFor(() => expect(result.current.selectedTargets).toHaveLength(2))

    await act(async () => {
      await result.current.exportSelection('separate')
    })

    expect(exportSingleTarget).toHaveBeenCalledTimes(2)
    expect(result.current.statusByModelID.mdl_a).toBe('Downloaded a-litecad-r4.step')
    expect(result.current.statusByModelID.mdl_b).toBe('Downloaded b-litecad-r4.step')
  })
})
