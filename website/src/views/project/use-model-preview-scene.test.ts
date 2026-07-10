import { describe, expect, it, vi } from 'vitest'

import { createModelPreviewLifecycle } from './use-model-preview-scene'

describe('createModelPreviewLifecycle', () => {
  it('runs registered scene cleanup exactly once', () => {
    const disposeRenderer = vi.fn()
    const disconnectObserver = vi.fn()
    const lifecycle = createModelPreviewLifecycle()
    lifecycle.addCleanup(disposeRenderer)
    lifecycle.addCleanup(disconnectObserver)

    lifecycle.dispose()
    lifecycle.dispose()

    expect(disposeRenderer).toHaveBeenCalledTimes(1)
    expect(disconnectObserver).toHaveBeenCalledTimes(1)
  })
})
