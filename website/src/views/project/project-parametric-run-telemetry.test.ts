import { describe, expect, it } from 'vitest'

import { formatParametricRunSummary } from './project-parametric-run-telemetry'

describe('formatParametricRunSummary', () => {
  it('includes provider mode, source kind, and duration in successful generation summaries', () => {
    expect(
      formatParametricRunSummary('Mounting bracket', {
        tool_mode: 'native_tool',
        source_kind: 'litecad-feature-dsl',
        duration_ms: 1240,
      }),
    ).toBe('Generated source draft: Mounting bracket\n\nRun: native tool · litecad-feature-dsl · 1.24s')
  })

  it('keeps the existing summary when telemetry is unavailable', () => {
    expect(formatParametricRunSummary('Mounting bracket')).toBe('Generated source draft: Mounting bracket')
  })

  it('describes revised drafts when a selected model is active', () => {
    expect(formatParametricRunSummary('Sphere revised', undefined, undefined, { activeModelName: 'Sphere' })).toBe(
      'Generated revised draft for Sphere: Sphere revised',
    )
  })
})
