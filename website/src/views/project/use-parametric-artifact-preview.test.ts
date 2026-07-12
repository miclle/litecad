import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectParametricArtifact } from 'src/types/project'
import { useParametricArtifactPreview } from './use-parametric-artifact-preview'

const artifact = {
  id: 'pma_width',
  project_id: 'prj_one',
  conversation_id: 'agc_one',
  message_id: 'agm_one',
  title: 'Width block',
  source_kind: 'openscad',
  source_code: 'width = 20; // [10:1:80]\ncube([width, 10, 5]);',
  parameter_values: {},
  compile_status: 'pending',
  compile_error: '',
  preview_model_id: '',
  generation_tool_mode: '',
  generation_duration_ms: 0,
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
} satisfies ProjectParametricArtifact

afterEach(() => {
  vi.useRealTimers()
})

describe('useParametricArtifactPreview', () => {
  it('reads LiteCAD feature DSL parameters without calling the OpenSCAD compiler', async () => {
    vi.useFakeTimers()
    const compile = vi.fn()
    const featureDSLArtifact = {
      ...artifact,
      id: 'pma_lcad',
      title: 'Feature DSL bracket',
      source_kind: 'litecad-feature-dsl',
      source_code:
        '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80,"min":20,"max":200},"centered":{"type":"boolean","default":true}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}',
      parameter_values: { width: 96 },
      compile_status: 'success',
    } satisfies ProjectParametricArtifact

    const { result } = renderHook(() =>
      useParametricArtifactPreview({
        artifact: featureDSLArtifact,
        compile,
        debounceMs: 20,
        parameterValues: { width: 96, centered: true },
      }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })

    expect(compile).not.toHaveBeenCalled()
    expect(result.current.status).toBe('success')
    expect(result.current.parameters).toEqual([
      { name: 'width', type: 'number', value: 80, range: { min: 20, step: 1, max: 200 }, group: '' },
      { name: 'centered', type: 'boolean', value: true, group: '' },
    ])
  })

  it('debounces parameter changes before compiling', async () => {
    vi.useFakeTimers()
    const compile = vi.fn().mockResolvedValue({
      output: 'preview',
      bytes: new Uint8Array([1, 2, 3]),
      stdout: '',
      stderr: '',
      durationMs: 4,
    })

    const { rerender, result } = renderHook(
      ({ parameterValues }) =>
        useParametricArtifactPreview({
          artifact,
          compile,
          debounceMs: 20,
          parameterValues,
        }),
      { initialProps: { parameterValues: { width: 20 } } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(compile).toHaveBeenCalledWith({ code: artifact.source_code, parameterValues: { width: 20 } })

    rerender({ parameterValues: { width: 40 } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(19)
    })
    expect(compile).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(compile).toHaveBeenLastCalledWith({ code: artifact.source_code, parameterValues: { width: 40 } })
    expect(result.current.status).toBe('success')
  })

  it('keeps stale compile results from overwriting newer errors', async () => {
    vi.useFakeTimers()
    let resolveFirst: ((value: { output: 'preview'; bytes: Uint8Array; stdout: string; stderr: string; durationMs: number }) => void) | undefined
    const compile = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockRejectedValueOnce(new Error('OpenSCAD runtime unavailable'))

    const { rerender, result } = renderHook(
      ({ parameterValues }) =>
        useParametricArtifactPreview({
          artifact,
          compile,
          debounceMs: 20,
          parameterValues,
        }),
      { initialProps: { parameterValues: { width: 20 } } },
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    rerender({ parameterValues: { width: 40 } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(result.current.error).toBe('OpenSCAD runtime unavailable')

    await act(async () => {
      resolveFirst?.({ output: 'preview', bytes: new Uint8Array([1]), stdout: '', stderr: '', durationMs: 10 })
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('OpenSCAD runtime unavailable')
  })
})
