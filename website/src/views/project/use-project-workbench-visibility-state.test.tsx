import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useProjectWorkbenchVisibilityState } from './use-project-workbench-visibility-state'

describe('useProjectWorkbenchVisibilityState', () => {
  it('tracks hidden model IDs with immutable toggles', () => {
    const { result } = renderHook(() => useProjectWorkbenchVisibilityState())
    const initialSet = result.current.hiddenModelIDs

    act(() => result.current.toggleModelVisibility('model_a'))

    expect(result.current.hiddenModelIDs).not.toBe(initialSet)
    expect([...result.current.hiddenModelIDs]).toEqual(['model_a'])

    act(() => result.current.toggleModelVisibility('model_b'))
    expect([...result.current.hiddenModelIDs].sort()).toEqual(['model_a', 'model_b'])

    act(() => result.current.toggleModelVisibility('model_a'))
    expect([...result.current.hiddenModelIDs]).toEqual(['model_b'])
  })
})
