import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectModelRevision, ProjectParametricArtifact } from 'src/types/project'
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

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ParametricArtifactEditor', () => {
  it('shows immutable model revisions and requests a restore when another version is selected', () => {
    const onRestoreRevision = vi.fn()
    render(
      <ParametricArtifactEditor
        artifact={artifact}
        currentRevisionID="mvr_second"
        currentRevisionSequence={2}
        modelRevisions={[modelRevision('mvr_second', 2, true), modelRevision('mvr_first', 1, false)]}
        onRestoreRevision={onRestoreRevision}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Version' }), { target: { value: 'mvr_first' } })
    expect(onRestoreRevision).toHaveBeenCalledWith('mvr_first')
    expect(screen.getByText('r2')).not.toBeNull()
  })

  it('keeps persisted generation telemetry out of the normal inspector controls', async () => {
    const compile = vi.fn()
    const generatedArtifact = {
      ...artifact,
      source_kind: 'litecad-feature-dsl',
      generation_tool_mode: 'native_tool',
      generation_duration_ms: 240,
    } satisfies ProjectParametricArtifact

    render(<ParametricArtifactEditor artifact={generatedArtifact} compile={compile} debounceMs={0} />)

    expect(screen.queryByText('Generated with native tool · litecad-feature-dsl · 240ms')).toBeNull()
    expect(screen.queryByText('Generated source')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Mounting bracket' })).not.toBeNull()
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

  it('keeps generated source out of the inspector controls', async () => {
    const compile = vi.fn()
    const compileFeatureDSL = vi.fn().mockResolvedValue({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
      meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
    })
    const sourceCode =
      '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}'
    const featureDSLArtifact = {
      ...artifact,
      id: 'pma_hidden_source',
      title: 'Hidden source block',
      source_kind: 'litecad-feature-dsl',
      source_code: sourceCode,
      parameter_values: { width: 80 },
      compile_status: 'pending',
    } satisfies ProjectParametricArtifact

    render(<ParametricArtifactEditor artifact={featureDSLArtifact} compile={compile} compileFeatureDSL={compileFeatureDSL} debounceMs={0} />)

    expect(screen.queryByText(sourceCode)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show source' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Hide source' })).toBeNull()
  })

  it('edits the feature graph only for saved LiteCAD models after browser kernel validation', async () => {
    const compileFeatureDSL = vi.fn().mockResolvedValue({
      mesh: { positions: [0, 0, 0], normals: [0, 0, 1], indices: [0] },
      meshSummary: { vertexCount: 1, triangleCount: 0, hasNormals: true },
    })
    const onSaveFeatureGraph = vi.fn()
    const sourceCode =
      '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,6]}]}'
    const updatedSourceCode =
      '{"version":1,"unit":"millimetre","parameters":{"width":{"type":"number","default":80}},"features":[{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,8]}]}'
    const savedArtifact = {
      ...artifact,
      id: 'pma_saved_lcad',
      source_kind: 'litecad-feature-dsl',
      source_code: sourceCode,
      parameter_values: { width: 80 },
      preview_model_id: 'mdl_saved_lcad',
    } satisfies ProjectParametricArtifact

    render(
      <ParametricArtifactEditor
        artifact={savedArtifact}
        compileFeatureDSL={compileFeatureDSL}
        debounceMs={0}
        onSaveFeatureGraph={onSaveFeatureGraph}
      />,
    )

    expect(screen.getByLabelText('width parameter')).not.toBeNull()
    expect(screen.queryByText('base')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Advanced editing' }))
    expect(screen.queryByLabelText('width parameter')).toBeNull()
    expect(screen.getByRole('button', { name: 'Back to parameter editing' })).not.toBeNull()
    expect(screen.getByText('Model structure · 1 step')).not.toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Selected step source' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit selected step source' }))
    const sourceEditor = screen.getByLabelText<HTMLTextAreaElement>('Selected step source')
    expect(sourceEditor.value).toContain('"id": "base"')

    fireEvent.change(sourceEditor, { target: { value: '{"id":"base","type":"box","origin":[0,0,0],"size":["width",40,8]}' } })
    await waitFor(() =>
      expect(compileFeatureDSL).toHaveBeenLastCalledWith(
        expect.objectContaining({ document: expect.objectContaining({ features: [expect.objectContaining({ id: 'base', size: ['width', 40, 8] })] }) }),
      ),
    )
    const applyButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Apply changes' })
    await waitFor(() => expect(applyButton.disabled).toBe(false))
    fireEvent.click(applyButton)

    const savedSourceCode = onSaveFeatureGraph.mock.calls[0]?.[0] as string
    expect(JSON.parse(savedSourceCode)).toEqual(JSON.parse(updatedSourceCode))

    fireEvent.click(screen.getByRole('button', { name: 'Back to parameter editing' }))
    expect(screen.getByLabelText('width parameter')).not.toBeNull()
    expect(screen.queryByText('Model structure · 1 step')).toBeNull()
  })

  it('does not offer feature graph editing for OpenSCAD models', () => {
    render(<ParametricArtifactEditor artifact={artifact} onSaveFeatureGraph={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Advanced editing' })).toBeNull()
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

  it('auto-saves parameter edits for an existing parametric model without a save button', async () => {
    vi.useFakeTimers()
    const compile = vi.fn().mockRejectedValue(new Error('OpenSCAD runtime unavailable'))
    const onSaveParameters = vi.fn()

    render(
      <ParametricArtifactEditor
        artifact={artifact}
        compile={compile}
        debounceMs={0}
        initialParameterValues={{ width: 30, style: 'square', centered: false }}
        onSaveParameters={onSaveParameters}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Save parameters' })).toBeNull()
    expect(onSaveParameters).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('width value'), { target: { value: '48' } })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(onSaveParameters).toHaveBeenCalledWith({ width: 48, style: 'square', centered: false })
    expect(onSaveParameters).toHaveBeenCalledTimes(1)
  })

  it('waits for saved-model parameter editing to settle before persisting the final value', async () => {
    vi.useFakeTimers()
    const compile = vi.fn().mockRejectedValue(new Error('OpenSCAD runtime unavailable'))
    const onSaveParameters = vi.fn()

    render(
      <ParametricArtifactEditor
        artifact={artifact}
        compile={compile}
        debounceMs={0}
        initialParameterValues={{ width: 30, style: 'square', centered: false }}
        onSaveParameters={onSaveParameters}
      />,
    )

    fireEvent.change(screen.getByLabelText('width value'), { target: { value: '48' } })
    fireEvent.change(screen.getByLabelText('width value'), { target: { value: '64' } })
    fireEvent.change(screen.getByLabelText('width value'), { target: { value: '72' } })

    expect(screen.getByLabelText<HTMLInputElement>('width value').value).toBe('72')
    expect(onSaveParameters).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(onSaveParameters).not.toHaveBeenCalled()
    fireEvent.blur(screen.getByLabelText('width value'))

    expect(onSaveParameters).toHaveBeenCalledTimes(1)
    expect(onSaveParameters).toHaveBeenCalledWith({ width: 72, style: 'square', centered: false })
  })

  it('reports saved-model parameter edits immediately for live preview before persistence', async () => {
    vi.useFakeTimers()
    const compile = vi.fn().mockRejectedValue(new Error('OpenSCAD runtime unavailable'))
    const onParameterValuesChange = vi.fn()
    const onSaveParameters = vi.fn()

    render(
      <ParametricArtifactEditor
        artifact={artifact}
        compile={compile}
        debounceMs={0}
        initialParameterValues={{ width: 30, style: 'square', centered: false }}
        onParameterValuesChange={onParameterValuesChange}
        onSaveParameters={onSaveParameters}
      />,
    )

    expect(onParameterValuesChange).toHaveBeenLastCalledWith({ width: 30, style: 'square', centered: false })
    fireEvent.change(screen.getByLabelText('width value'), { target: { value: '48' } })

    expect(onParameterValuesChange).toHaveBeenLastCalledWith({ width: 48, style: 'square', centered: false })
    expect(onSaveParameters).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(onSaveParameters).toHaveBeenCalledWith({ width: 48, style: 'square', centered: false })
  })
})

function modelRevision(id: string, sequence: number, isCurrent: boolean): ProjectModelRevision {
  return {
    id,
    project_id: 'prj_one',
    model_id: 'mdl_one',
    sequence,
    byte_size: 120,
    metadata: {
      asset_type: 'lcad',
      version: '1',
      schema: 'litecad-feature-dsl',
      product_names: ['Bracket'],
      length_unit: 'millimetre',
      entity_count: 1,
      representation_count: 1,
      triangle_count: 12,
    },
    content_checksum: `checksum-${sequence}`,
    summary: sequence === 1 ? 'Initial model source' : 'Updated parametric parameters',
    is_current: isCurrent,
    created_at: '2026-07-14T00:00:00Z',
  }
}
