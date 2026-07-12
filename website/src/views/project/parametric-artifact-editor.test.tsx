import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectParametricArtifact } from 'src/types/project'
import { ParametricArtifactEditor } from './parametric-artifact-editor'

const artifact = {
  id: 'pma_bracket',
  project_id: 'prj_one',
  conversation_id: 'agc_one',
  message_id: 'agm_one',
  title: 'Mounting bracket',
  source_kind: 'openscad',
  source_code: 'width = 20; // [10:1:80]\nstyle = "round"; // [round, square]\ncentered = true;\ncube([width, 10, 5]);',
  parameter_values: {},
  compile_status: 'pending',
  compile_error: '',
  preview_model_id: '',
  generation_tool_mode: '',
  generation_duration_ms: 0,
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
} satisfies ProjectParametricArtifact

afterEach(() => cleanup())

describe('ParametricArtifactEditor', () => {
  it('shows persisted generation telemetry when the artifact has it', async () => {
    const compile = vi.fn()
    const generatedArtifact = {
      ...artifact,
      source_kind: 'litecad-feature-dsl',
      generation_tool_mode: 'native_tool',
      generation_duration_ms: 240,
    } satisfies ProjectParametricArtifact

    render(<ParametricArtifactEditor artifact={generatedArtifact} compile={compile} debounceMs={0} />)

    expect(screen.getByText('Generated with native tool · litecad-feature-dsl · 240ms')).not.toBeNull()
    await waitFor(() => expect(compile).not.toHaveBeenCalled())
  })

  it('enables saving LiteCAD feature DSL drafts after browser kernel preview succeeds', async () => {
    const compile = vi.fn()
    const compileFeatureDSL = vi.fn().mockResolvedValue({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
      meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
    })
    const onSaveAsModel = vi.fn()
    const featureDSLArtifact = {
      ...artifact,
      id: 'pma_lcad',
      title: 'Feature DSL bracket',
      source_kind: 'litecad-feature-dsl',
      source_code:
        '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80,"min":20,"max":200}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}',
      parameter_values: { width: 96 },
      compile_status: 'pending',
    } satisfies ProjectParametricArtifact

    render(
      <ParametricArtifactEditor
        artifact={featureDSLArtifact}
        compile={compile}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSaveAsModel={onSaveAsModel}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Feature DSL bracket' })).not.toBeNull()
    expect(screen.getByLabelText('width parameter')).not.toBeNull()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save as model' }).disabled).toBe(true)
    await waitFor(() => expect(compileFeatureDSL).toHaveBeenCalled())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save as model' }).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Save as model' }))
    expect(onSaveAsModel).toHaveBeenCalledWith({ width: 96 })
    await waitFor(() => expect(compile).not.toHaveBeenCalled())
  })

  it('automatically saves generated LiteCAD feature DSL drafts after preview succeeds', async () => {
    const compile = vi.fn()
    const compileFeatureDSL = vi.fn().mockResolvedValue({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
      meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
    })
    const onSaveAsModel = vi.fn()
    const featureDSLArtifact = {
      ...artifact,
      id: 'pma_auto_lcad',
      title: 'Auto saved block',
      source_kind: 'litecad-feature-dsl',
      source_code:
        '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}',
      parameter_values: { width: 88 },
      compile_status: 'pending',
    } satisfies ProjectParametricArtifact

    render(
      <ParametricArtifactEditor
        artifact={featureDSLArtifact}
        autoSaveOnPreviewSuccess
        compile={compile}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSaveAsModel={onSaveAsModel}
      />,
    )

    await waitFor(() => expect(onSaveAsModel).toHaveBeenCalledWith({ width: 88 }))
    expect(onSaveAsModel).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(compile).not.toHaveBeenCalled())
  })

  it('does not auto-save a new artifact from a stale preview success', async () => {
    const compile = vi.fn()
    let resolveSecondPreview: ((result: unknown) => void) | undefined
    const compileFeatureDSL = vi
      .fn()
      .mockResolvedValueOnce({
        mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
        meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondPreview = resolve
          }),
      )
    const onSaveAsModel = vi.fn()
    const firstArtifact = {
      ...artifact,
      id: 'pma_first_lcad',
      title: 'First block',
      source_kind: 'litecad-feature-dsl',
      source_code:
        '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}',
      parameter_values: { width: 80 },
      compile_status: 'pending',
    } satisfies ProjectParametricArtifact
    const secondArtifact = {
      ...firstArtifact,
      id: 'pma_second_lcad',
      title: 'Second block',
      parameter_values: { width: 120 },
    } satisfies ProjectParametricArtifact

    const { rerender } = render(
      <ParametricArtifactEditor
        artifact={firstArtifact}
        autoSaveOnPreviewSuccess
        compile={compile}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSaveAsModel={onSaveAsModel}
      />,
    )

    await waitFor(() => expect(onSaveAsModel).toHaveBeenCalledWith({ width: 80 }))
    rerender(
      <ParametricArtifactEditor
        artifact={secondArtifact}
        autoSaveOnPreviewSuccess
        compile={compile}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSaveAsModel={onSaveAsModel}
      />,
    )

    await waitFor(() => expect(compileFeatureDSL).toHaveBeenCalledTimes(2))
    expect(onSaveAsModel).toHaveBeenCalledTimes(1)

    resolveSecondPreview?.({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
      meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
    })
    await waitFor(() => expect(onSaveAsModel).toHaveBeenCalledWith({ width: 120 }))
    expect(onSaveAsModel).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(compile).not.toHaveBeenCalled())
  })

  it('keeps OpenSCAD drafts on the manual save flow even when auto-save is requested', async () => {
    const compile = vi.fn().mockResolvedValue({
      output: 'preview',
      bytes: new Uint8Array([1, 2, 3]),
      stdout: '',
      stderr: '',
      durationMs: 4,
    })
    const onSaveAsModel = vi.fn()

    render(<ParametricArtifactEditor artifact={artifact} autoSaveOnPreviewSuccess compile={compile} debounceMs={0} onSaveAsModel={onSaveAsModel} />)

    await waitFor(() => expect(compile).toHaveBeenCalled())
    expect(onSaveAsModel).not.toHaveBeenCalled()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save as model' }).disabled).toBe(false)
  })

  it('renders parsed parameters and recompiles when a slider changes', async () => {
    const compile = vi.fn().mockResolvedValue({
      output: 'preview',
      bytes: new Uint8Array([1, 2, 3]),
      stdout: '',
      stderr: '',
      durationMs: 4,
    })

    render(<ParametricArtifactEditor artifact={artifact} compile={compile} debounceMs={0} />)

    expect(screen.getByRole('heading', { name: 'Mounting bracket' })).not.toBeNull()
    expect(screen.getByLabelText('width parameter')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('width parameter'), { target: { value: '40' } })

    await waitFor(() => expect(compile).toHaveBeenLastCalledWith({ code: artifact.source_code, parameterValues: { width: 40, style: 'round', centered: true } }))
  })

  it('keeps compile errors visible and does not enable Save as model', async () => {
    const compile = vi.fn().mockRejectedValue(new Error('OpenSCAD runtime unavailable'))

    render(<ParametricArtifactEditor artifact={artifact} compile={compile} debounceMs={0} />)

    await waitFor(() => expect(screen.getByText('OpenSCAD runtime unavailable')).not.toBeNull())
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save as model' }).disabled).toBe(true)
  })

  it('saves parameter edits for an existing parametric model without requiring compile success', async () => {
    const compile = vi.fn().mockRejectedValue(new Error('OpenSCAD runtime unavailable'))
    const onSaveParameters = vi.fn()

    render(
      <ParametricArtifactEditor
        artifact={artifact}
        compile={compile}
        debounceMs={0}
        initialParameterValues={{ width: 30, style: 'square', centered: false }}
        onSaveParameters={onSaveParameters}
        saveLabel="Save parameters"
      />,
    )

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save parameters' }).disabled).toBe(false)
    fireEvent.change(screen.getByLabelText('width value'), { target: { value: '48' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save parameters' }))

    expect(onSaveParameters).toHaveBeenCalledWith({ width: 48, style: 'square', centered: false })
  })
})
