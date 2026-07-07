import { describe, expect, it } from 'vitest'

import { resolveCadKernelSmokeInput, resolveCadKernelSmokeTransport } from './kernel-smoke-input'

describe('resolveCadKernelSmokeInput', () => {
  it('uses a generated box when no STEP URL is provided', () => {
    expect(resolveCadKernelSmokeInput('')).toEqual({ kind: 'generated-box' })
  })

  it('uses the provided STEP URL when the query string includes stepUrl', () => {
    expect(resolveCadKernelSmokeInput('?stepUrl=%2Ffixtures%2Fpart.step')).toEqual({
      kind: 'step-url',
      url: '/fixtures/part.step',
    })
  })
})

describe('resolveCadKernelSmokeTransport', () => {
  it('uses direct adapter calls by default', () => {
    expect(resolveCadKernelSmokeTransport('')).toBe('direct')
  })

  it('uses the worker message boundary when requested', () => {
    expect(resolveCadKernelSmokeTransport('?transport=worker')).toBe('worker')
  })
})
