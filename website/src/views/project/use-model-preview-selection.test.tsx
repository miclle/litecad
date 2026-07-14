import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useModelPreviewSelection } from './use-model-preview-selection'

afterEach(cleanup)

describe('useModelPreviewSelection', () => {
  it('keeps live callbacks, selection, visibility, and translations synchronized without rebuilding the scene', () => {
    const syncSelection = vi.fn()
    const syncTransforms = vi.fn()
    const syncVisibility = vi.fn()
    const { result, rerender } = renderHook(
      ({ selectedNodeId, selectedOccurrenceId, visibleModelIds }) =>
        useModelPreviewSelection({
          draftModelTranslations: { node_one: { x: 1, y: 2, z: 3 } },
          modelTranslations: { node_one: { x: 0, y: 0, z: 0 } },
          onClearSelection: vi.fn(),
          onModelTranslationChange: vi.fn(),
          onSelectModel: vi.fn(),
          selectedModelId: 'model_one',
          selectedNodeId,
					selectedOccurrenceId,
          syncSelection,
          syncTransforms,
          syncVisibility,
          visibleModelIds,
        }),
			{ initialProps: { selectedNodeId: 'node_one', selectedOccurrenceId: 'occ_one', visibleModelIds: ['occ_one'] as readonly string[] } },
    )

    expect(result.current.selectedNodeIdRef.current).toBe('node_one')
		expect(result.current.selectedOccurrenceIdRef.current).toBe('occ_one')
		expect(result.current.visibleModelIdsRef.current).toEqual(['occ_one'])

		act(() => rerender({ selectedNodeId: 'node_two', selectedOccurrenceId: 'occ_two', visibleModelIds: [] }))

    expect(result.current.selectedNodeIdRef.current).toBe('node_two')
		expect(result.current.selectedOccurrenceIdRef.current).toBe('occ_two')
    expect(result.current.visibleModelIdsRef.current).toEqual([])
    expect(syncSelection).toHaveBeenCalled()
    expect(syncTransforms).toHaveBeenCalled()
    expect(syncVisibility).toHaveBeenCalled()
  })
})
