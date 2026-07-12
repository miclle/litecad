import { describe, expect, it } from 'vitest'

import type { ProjectParametricArtifact } from './project'

describe('ProjectParametricArtifact', () => {
  it('includes durable generation telemetry fields', () => {
    const artifact: Pick<ProjectParametricArtifact, 'generation_tool_mode' | 'generation_duration_ms'> = {
      generation_tool_mode: 'native_tool',
      generation_duration_ms: 240,
    }

    expect(artifact.generation_tool_mode).toBe('native_tool')
    expect(artifact.generation_duration_ms).toBe(240)
  })
})
